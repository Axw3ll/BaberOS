import "server-only";
import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";

export class SaleError extends Error {}
const D = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(v);

export type CartLine =
  | { kind: "SERVICE"; serviceId: string; staffId: string; quantity: number }
  | { kind: "PRODUCT"; productId: string; staffId?: string | null; quantity: number }
  | { kind: "PACKAGE"; packageId: string; staffId?: string | null; quantity: number };

/**
 * Cobra un ticket: renglones con precio y comisión copiados, IVA incluido desglosado,
 * descuento de inventario atómico y folio consecutivo. Todo o nada.
 */
export async function checkout(input: {
  shopId: string; chargedById: string; customerId?: string | null; appointmentId?: string | null;
  lines: CartLine[]; discount: number; tip: number; method: PaymentMethod; redeemPoints?: number; redeemReward?: boolean;
  /** Efectivo que entregó el cliente; si se captura, no puede ser menor al total. */
  received?: number | null;
  /** Descuento manual máximo, en % del subtotal (según el rol de quien cobra). null = sin tope. */
  maxDiscountPct?: number | null;
  /** Usar los paquetes o membresías vigentes del cliente para los servicios que cubren. */
  usePackages?: boolean;
}) {
  // Validación estricta: nada se corrige en silencio
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new SaleError("Agrega al menos un servicio o producto.");
  if (input.lines.length > 50) throw new SaleError("El ticket tiene demasiados renglones.");
  if (!["CASH", "CARD", "TRANSFER"].includes(input.method)) throw new SaleError("Elige cómo pagó.");
  const isMoney = (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.round(n * 100) === Number((n * 100).toFixed(4));
  for (const l of input.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new SaleError("Las cantidades deben ser números enteros de 1 en adelante.");
    if (l.quantity > 99) throw new SaleError("La cantidad de un renglón no puede pasar de 99.");
    if (l.kind === "SERVICE" && l.quantity !== 1) throw new SaleError("Cada servicio va en su propio renglón.");
    if (l.kind === "PACKAGE" && l.quantity !== 1) throw new SaleError("Cada paquete va en su propio renglón.");
  }
  if (!isMoney(input.discount)) throw new SaleError("El descuento no es un monto válido (máximo 2 decimales).");
  if (input.discount < 0) throw new SaleError("El descuento no puede ser negativo.");
  if (!isMoney(input.tip)) throw new SaleError("La propina no es un monto válido (máximo 2 decimales).");
  if (input.tip < 0) throw new SaleError("La propina no puede ser negativa.");
  if (input.tip > 10_000) throw new SaleError("La propina no puede pasar de $10,000.");
  if (input.received != null && (!isMoney(input.received) || input.received < 0)) throw new SaleError("El efectivo recibido no es válido.");
  if (input.received != null && input.method !== "CASH") throw new SaleError("El efectivo recibido solo aplica a pagos en efectivo.");
  if (input.redeemPoints != null && (!Number.isInteger(input.redeemPoints) || input.redeemPoints < 0)) throw new SaleError("Los puntos a canjear no son válidos.");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const shop = await tx.barbershop.findUniqueOrThrow({ where: { id: input.shopId } });
        const staffIds = [...new Set(input.lines.map((l) => l.staffId).filter(Boolean) as string[])];
        const staff = new Map((await tx.staff.findMany({ where: { shopId: shop.id, id: { in: staffIds } } })).map((s) => [s.id, s]));

        const items: Prisma.SaleItemCreateManySaleInput[] = [];
        const stock: { productId: string; qty: number }[] = [];

        for (const l of input.lines) {
          const qty = l.quantity;
          const who = l.staffId ? staff.get(l.staffId) : undefined;
          if (l.staffId && !who) throw new SaleError("Barbero no válido.");
          if (l.kind === "SERVICE") {
            const s = await tx.service.findFirst({ where: { id: l.serviceId, shopId: shop.id } });
            if (!s) throw new SaleError("Servicio no válido.");
            const total = s.price.mul(qty);
            items.push({ kind: "SERVICE", serviceId: s.id, staffId: who?.id, name: s.name, quantity: qty,
              unitPrice: s.price, total, commission: who ? total.mul(who.serviceCommission).toDecimalPlaces(2) : 0 });
          } else if (l.kind === "PACKAGE") {
            const pk = await tx.package.findFirst({ where: { id: l.packageId, shopId: shop.id, active: true } });
            if (!pk) throw new SaleError("Paquete no válido.");
            if (!input.customerId) throw new SaleError("Para vender un paquete registra al cliente (su teléfono).");
            items.push({ kind: "PACKAGE", packageId: pk.id, staffId: who?.id, name: pk.name, quantity: 1, unitPrice: pk.price, total: pk.price, commission: 0 });
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
        if (D(input.discount).gt(subtotal)) throw new SaleError(`El descuento no puede ser mayor al subtotal (${subtotal.toFixed(2)}).`);
        if (input.maxDiscountPct != null && D(input.discount).gt(subtotal.mul(input.maxDiscountPct).div(100))) {
          const max = subtotal.mul(input.maxDiscountPct).div(100).toDecimalPlaces(2);
          throw new SaleError(`Tu descuento máximo es de ${input.maxDiscountPct}% ($${max.toFixed(2)} en este ticket). Para más, pídele al encargado que cobre.`);
        }
        let discount = D(input.discount);

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

        // Paquetes y membresías: cada servicio cubierto consume un uso (los paquetes que se compran en este ticket no aplican aquí)
        const packageUses: { customerPackageId: string; serviceId: string; value: Prisma.Decimal }[] = [];
        if (input.usePackages && input.customerId) {
          const owned = await tx.customerPackage.findMany({
            where: { customerId: input.customerId, shopId: shop.id, status: "ACTIVE", expiresAt: { gt: new Date() }, OR: [{ usesLeft: null }, { usesLeft: { gt: 0 } }] },
            orderBy: { expiresAt: "asc" }, // se usa primero el que vence antes
          });
          const left = new Map(owned.map((o) => [o.id, o.usesLeft]));
          for (const it of items) {
            if (it.kind !== "SERVICE" || !it.serviceId) continue;
            const pkg = owned.find((o) => o.serviceIds.includes(it.serviceId!) && (left.get(o.id) === null || left.get(o.id)! > 0));
            if (!pkg) continue;
            if (left.get(pkg.id) !== null) left.set(pkg.id, left.get(pkg.id)! - 1);
            packageUses.push({ customerPackageId: pkg.id, serviceId: it.serviceId, value: D(String(it.unitPrice)) });
          }
          if (!packageUses.length) throw new SaleError("El cliente no tiene un paquete vigente que cubra estos servicios.");
          for (const u of packageUses) {
            const ok = await tx.customerPackage.updateMany({
              where: { id: u.customerPackageId, OR: [{ usesLeft: null }, { usesLeft: { gt: 0 } }] },
              data: owned.find((o) => o.id === u.customerPackageId)!.usesLeft === null ? {} : { usesLeft: { decrement: 1 } },
            });
            if (ok.count === 0) throw new SaleError("El paquete ya no tiene usos disponibles.");
          }
          const value = packageUses.reduce((a, u) => a.plus(u.value), D(0));
          discount = Prisma.Decimal.min(subtotal, discount.plus(value));
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
        const tip = D(input.tip);
        const total = net.plus(tip);
        if (input.received != null && D(input.received).lt(total)) {
          throw new SaleError(`El efectivo recibido ($${D(input.received).toFixed(2)}) es menor que el total ($${total.toFixed(2)}).`);
        }

        const last = await tx.sale.aggregate({ where: { shopId: shop.id }, _max: { folio: true } });
        const sale = await tx.sale.create({
          data: {
            shopId: shop.id, folio: (last._max.folio ?? 0) + 1,
            customerId: input.customerId || null, appointmentId: input.appointmentId || null,
            chargedById: input.chargedById, subtotal, discount, tax, tip, total, pointsRedeemed: pointsUsed, rewardRedeemed: rewardUsed,
            items: { createMany: { data: items } },
            ...(total.gt(0) && { payments: { create: { method: input.method, amount: total, received: input.received ?? null } } }),
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

        if (packageUses.length) {
          await tx.packageUse.createMany({ data: packageUses.map((u) => ({ ...u, saleId: sale.id })) });
        }
        for (const it of items.filter((i) => i.kind === "PACKAGE")) {
          const pk = await tx.package.findUniqueOrThrow({ where: { id: it.packageId! }, include: { services: true } });
          await tx.customerPackage.create({
            data: {
              shopId: shop.id, customerId: input.customerId!, packageId: pk.id, saleId: sale.id, name: pk.name, kind: pk.kind,
              usesTotal: pk.kind === "BUNDLE" ? pk.uses : null, usesLeft: pk.kind === "BUNDLE" ? pk.uses : null,
              serviceIds: pk.services.map((x) => x.serviceId), expiresAt: new Date(Date.now() + pk.days * 86_400_000),
            },
          });
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
    // Paquetes: regresa los usos consumidos y anula los paquetes que se vendieron en este ticket
    const uses = await tx.packageUse.findMany({ where: { saleId }, include: { customerPackage: true } });
    for (const u of uses) {
      if (u.customerPackage.usesLeft !== null) await tx.customerPackage.update({ where: { id: u.customerPackageId }, data: { usesLeft: { increment: 1 } } });
    }
    await tx.packageUse.deleteMany({ where: { saleId } });
    await tx.customerPackage.updateMany({ where: { saleId }, data: { status: "VOIDED" } });

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
  items: { kind: "SERVICE" | "PRODUCT" | "PACKAGE"; unitPrice: unknown }[],
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
