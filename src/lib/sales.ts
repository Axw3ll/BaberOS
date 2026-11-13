import "server-only";
import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";

export class SaleError extends Error {}
const D = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(v);

export type CartLine =
  | { kind: "SERVICE"; serviceId: string; staffId: string; quantity: number }
  | { kind: "PRODUCT"; productId: string; staffId?: string | null; quantity: number };

/**
 * Cobra un ticket: renglones con precio y comisión copiados, IVA incluido desglosado,
 * descuento de inventario atómico y folio consecutivo. Todo o nada.
 */
export async function checkout(input: {
  shopId: string; chargedById: string; customerId?: string | null; appointmentId?: string | null;
  lines: CartLine[]; discount: number; tip: number; method: PaymentMethod; redeemPoints?: number; redeemReward?: boolean;
}) {
  if (input.lines.length === 0) throw new SaleError("Agrega al menos un servicio o producto.");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const shop = await tx.barbershop.findUniqueOrThrow({ where: { id: input.shopId } });
        const staffIds = [...new Set(input.lines.map((l) => l.staffId).filter(Boolean) as string[])];
        const staff = new Map((await tx.staff.findMany({ where: { shopId: shop.id, id: { in: staffIds } } })).map((s) => [s.id, s]));

        const items: Prisma.SaleItemCreateManySaleInput[] = [];
        const stock: { productId: string; qty: number }[] = [];

        for (const l of input.lines) {
          const qty = Math.max(1, Math.floor(l.quantity));
          const who = l.staffId ? staff.get(l.staffId) : undefined;
          if (l.staffId && !who) throw new SaleError("Barbero no válido.");
          if (l.kind === "SERVICE") {
            const s = await tx.service.findFirst({ where: { id: l.serviceId, shopId: shop.id } });
            if (!s) throw new SaleError("Servicio no válido.");
            const total = s.price.mul(qty);
            items.push({ kind: "SERVICE", serviceId: s.id, staffId: who?.id, name: s.name, quantity: qty,
              unitPrice: s.price, total, commission: who ? total.mul(who.serviceCommission).toDecimalPlaces(2) : 0 });
          } else {
            const p = await tx.product.findFirst({ where: { id: l.productId, shopId: shop.id, active: true } });
            if (!p) throw new SaleError("Producto no válido.");
            const total = p.price.mul(qty);
            items.push({ kind: "PRODUCT", productId: p.id, staffId: who?.id, name: p.name, quantity: qty,
              unitPrice: p.price, total, commission: who ? total.mul(who.productCommission).toDecimalPlaces(2) : 0 });
            stock.push({ productId: p.id, qty });
          }
        }

        const subtotal = items.reduce((s, i) => s.plus(i.total as Prisma.Decimal), D(0));
        let discount = Prisma.Decimal.min(D(Math.max(0, input.discount)), subtotal);

        // Canje de puntos: se vuelve descuento. Nunca más de lo que falta por pagar.
        let pointsUsed = 0;
        const wanted = Math.max(0, Math.floor(input.redeemPoints ?? 0));
        if (wanted > 0) {
          if (!input.customerId) throw new SaleError("Para canjear puntos registra al cliente.");
          if (shop.loyaltyMode !== "POINTS" || shop.loyaltyPointsPerPeso.lte(0)) throw new SaleError("El programa de puntos está apagado.");
          const maxByTotal = subtotal.minus(discount).div(shop.loyaltyPesoPerPoint).floor().toNumber();
          pointsUsed = Math.min(wanted, maxByTotal);
          if (pointsUsed > 0) {
            const ok = await tx.customer.updateMany({
              where: { id: input.customerId, shopId: shop.id, points: { gte: pointsUsed } },
              data: { points: { decrement: pointsUsed } },
            });
            if (ok.count === 0) throw new SaleError("El cliente no tiene esos puntos.");
            discount = discount.plus(shop.loyaltyPesoPerPoint.mul(pointsUsed)).toDecimalPlaces(2);
            discount = Prisma.Decimal.min(discount, subtotal);
          }
        }

        // Tarjeta de sellos: canjear el premio ganado
        let rewardUsed = false;
        if (input.redeemReward) {
          if (!input.customerId) throw new SaleError("Para usar el premio registra al cliente.");
          if (shop.loyaltyMode !== "STAMPS") throw new SaleError("La tarjeta de sellos está apagada.");
          const value = stampRewardDiscount(shop, items, subtotal.minus(discount));
          if (value.lte(0)) throw new SaleError("El premio aplica a un servicio: agrégalo al ticket.");
          const ok = await tx.customer.updateMany({
            where: { id: input.customerId, shopId: shop.id, stampRewards: { gte: 1 } },
            data: { stampRewards: { decrement: 1 } },
          });
          if (ok.count === 0) throw new SaleError("El cliente no tiene premios disponibles.");
          discount = Prisma.Decimal.min(discount.plus(value), subtotal);
          rewardUsed = true;
        }

        const net = subtotal.minus(discount);
        const tax = net.minus(net.div(D(1).plus(shop.taxRate))).toDecimalPlaces(2);
        const tip = D(Math.max(0, input.tip));
        const total = net.plus(tip);

        const last = await tx.sale.aggregate({ where: { shopId: shop.id }, _max: { folio: true } });
        const sale = await tx.sale.create({
          data: {
            shopId: shop.id, folio: (last._max.folio ?? 0) + 1,
            customerId: input.customerId || null, appointmentId: input.appointmentId || null,
            chargedById: input.chargedById, subtotal, discount, tax, tip, total, pointsRedeemed: pointsUsed, rewardRedeemed: rewardUsed,
            items: { createMany: { data: items } },
            ...(total.gt(0) && { payments: { create: { method: input.method, amount: total } } }),
          },
        });

        for (const s of stock) {
          const ok = await tx.product.updateMany({
            where: { id: s.productId, stock: { gte: s.qty } }, data: { stock: { decrement: s.qty } },
          });
          const p = await tx.product.findUniqueOrThrow({ where: { id: s.productId } });
          if (ok.count === 0) throw new SaleError(`No hay suficiente "${p.name}". Quedan ${p.stock}.`);
          await tx.stockMovement.create({
            data: { shopId: shop.id, productId: p.id, type: "SALE", quantity: -s.qty, stockAfter: p.stock, saleId: sale.id },
          });
        }

        // Puntos: se canjean y se ganan sobre lo pagado (sin propina).
        if (input.customerId && (shop.loyaltyMode === "POINTS" || pointsUsed > 0)) {
          const earned = shop.loyaltyMode === "POINTS" && shop.loyaltyPointsPerPeso.gt(0) ? net.mul(shop.loyaltyPointsPerPeso).floor().toNumber() : 0;
          let balance = (await tx.customer.findUniqueOrThrow({ where: { id: input.customerId }, select: { points: true } })).points;
          if (pointsUsed > 0) {
            await tx.loyaltyMovement.create({
              data: { shopId: shop.id, customerId: input.customerId, kind: "REDEEM", points: -pointsUsed, balance, saleId: sale.id, note: `Canje en venta #${sale.folio}` },
            });
          }
          if (earned > 0) {
            balance = (await tx.customer.update({ where: { id: input.customerId }, data: { points: { increment: earned } } })).points;
            await tx.loyaltyMovement.create({
              data: { shopId: shop.id, customerId: input.customerId, kind: "EARN", points: earned, balance, saleId: sale.id, note: `Venta #${sale.folio}` },
            });
          }
        }

        // Sellos: uno por visita con servicio y gasto mínimo. La visita en la que usa su premio no suma sello.
        if (input.customerId && shop.loyaltyMode === "STAMPS") {
          if (rewardUsed) {
            const c = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId } });
            await tx.loyaltyMovement.create({
              data: { shopId: shop.id, customerId: input.customerId, kind: "REWARD", points: -1, balance: c.stampRewards, saleId: sale.id, note: `Premio usado en venta #${sale.folio}` },
            });
          } else if (items.some((i) => i.kind === "SERVICE") && net.gte(shop.stampMinAmount)) {
            const c = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId } });
            const complete = c.stamps + 1 >= shop.stampsRequired;
            const after = await tx.customer.update({
              where: { id: c.id },
              data: complete ? { stamps: c.stamps + 1 - shop.stampsRequired, stampRewards: { increment: 1 } } : { stamps: { increment: 1 } },
            });
            await tx.sale.update({ where: { id: sale.id }, data: { stampGiven: true } });
            await tx.loyaltyMovement.create({
              data: { shopId: shop.id, customerId: c.id, kind: "STAMP", points: 1, balance: after.stamps, saleId: sale.id,
                note: complete ? `Sello en venta #${sale.folio}: tarjeta completa, ganó un premio` : `Sello en venta #${sale.folio}` },
            });
          }
        }

        if (input.appointmentId) {
          await tx.appointment.update({ where: { id: input.appointmentId, shopId: shop.id }, data: { status: "COMPLETED" } });
        }
        return sale;
      });
    } catch (e) {
      // Dos cobros al mismo tiempo pueden pedir el mismo folio: reintenta.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
  throw new SaleError("No se pudo registrar la venta. Intenta de nuevo.");
}

export async function voidSale(shopId: string, saleId: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirstOrThrow({ where: { id: saleId, shopId }, include: { items: true } });
    if (sale.status === "VOIDED") return sale;
    for (const i of sale.items) {
      if (i.kind !== "PRODUCT" || !i.productId) continue;
      const p = await tx.product.update({ where: { id: i.productId }, data: { stock: { increment: i.quantity } } });
      await tx.stockMovement.create({
        data: { shopId, productId: p.id, type: "ADJUSTMENT", quantity: i.quantity, stockAfter: p.stock, saleId, note: `Venta #${sale.folio} cancelada` },
      });
    }
    // Regresa los puntos canjeados y quita los ganados (sin dejar saldo negativo).
    const moves = await tx.loyaltyMovement.findMany({ where: { saleId, kind: { in: ["EARN", "REDEEM"] } } });
    for (const m of moves) {
      const [c] = await tx.$queryRaw<{ points: number }[]>`
        UPDATE customers SET points = GREATEST(0, points - ${m.points}) WHERE id = ${m.customerId}::uuid RETURNING points`;
      if (!c) continue;
      await tx.loyaltyMovement.create({
        data: { shopId, customerId: m.customerId, kind: "ADJUST", points: -m.points, balance: c.points, saleId, note: `Venta #${sale.folio} cancelada` },
      });
    }
    // Sellos: quita el sello que dio (deshaciendo el premio si con él completó la tarjeta) y regresa el premio usado
    if ((sale.stampGiven || sale.rewardRedeemed) && sale.customerId) {
      const shop = await tx.barbershop.findUniqueOrThrow({ where: { id: shopId } });
      const c = await tx.customer.findUniqueOrThrow({ where: { id: sale.customerId } });
      let { stamps, stampRewards } = c;
      if (sale.rewardRedeemed) stampRewards += 1;
      if (sale.stampGiven) {
        if (stamps > 0) stamps -= 1;
        else if (stampRewards > 0) { stampRewards -= 1; stamps = shop.stampsRequired - 1; }
      }
      await tx.customer.update({ where: { id: c.id }, data: { stamps, stampRewards } });
      await tx.loyaltyMovement.create({
        data: { shopId, customerId: c.id, kind: sale.stampGiven ? "STAMP" : "REWARD", points: sale.stampGiven ? -1 : 1,
          balance: sale.stampGiven ? stamps : stampRewards, saleId, note: `Venta #${sale.folio} cancelada` },
      });
    }
    return tx.sale.update({ where: { id: saleId }, data: { status: "VOIDED" } });
  });
}

/** Cuánto descuenta el premio de la tarjeta de sellos en este ticket. */
export function stampRewardDiscount(
  shop: { stampReward: "FREE_SERVICE" | "PERCENT" | "AMOUNT"; stampRewardValue: Prisma.Decimal },
  items: { kind: "SERVICE" | "PRODUCT"; unitPrice: unknown }[],
  remaining: Prisma.Decimal,
) {
  let value: Prisma.Decimal;
  if (shop.stampReward === "FREE_SERVICE") {
    const prices = items.filter((i) => i.kind === "SERVICE").map((i) => D(String(i.unitPrice)));
    if (!prices.length) return D(0);
    value = prices.reduce((a, b) => (b.gt(a) ? b : a));
    if (shop.stampRewardValue.gt(0)) value = Prisma.Decimal.min(value, shop.stampRewardValue);
  } else if (shop.stampReward === "PERCENT") {
    value = remaining.mul(Prisma.Decimal.min(shop.stampRewardValue, D(100))).div(100).toDecimalPlaces(2);
  } else {
    value = shop.stampRewardValue;
  }
  return Prisma.Decimal.max(D(0), Prisma.Decimal.min(value, remaining));
}
