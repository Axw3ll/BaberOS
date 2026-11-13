import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound, bad } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
const Schema = z.object({ qty: z.number().int().min(1).max(100).default(1), method: z.enum(["CASH", "TRANSFER", "CARD"]) });

/** Venta en un toque: descuenta stock de forma atómica, impide vender más de lo que hay y suma al corte. */
export const POST = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("products.sell");
  const { id } = await params;
  const d = Schema.parse(await body(req));
  const sale = await prisma.$transaction(async (tx) => {
    const p = await tx.product.findFirst({ where: { id, barbershopId: c.shopId } });
    if (!p) throw notFound("Producto no encontrado");
    if (!p.active) throw bad("Producto desactivado");
    const r = await tx.product.updateMany({ where: { id, barbershopId: c.shopId, stock: { gte: d.qty } }, data: { stock: { decrement: d.qty } } });
    if (!r.count) throw bad(p.stock === 0 ? "Producto agotado" : `Solo hay ${p.stock} en existencia`);
    await tx.stockMovement.create({ data: { barbershopId: c.shopId, productId: id, delta: -d.qty, reason: "Venta", memberId: c.memberId } });
    return tx.productSale.create({ data: { barbershopId: c.shopId, productId: id, qty: d.qty, unitPrice: p.price, unitCost: p.cost, total: p.price * d.qty, method: d.method, memberId: c.memberId } });
  });
  return json({ sale }, 201);
});
