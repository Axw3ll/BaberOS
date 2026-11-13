import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound, bad } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
const Schema = z.object({ delta: z.number().int().refine((n) => n !== 0, "No puede ser 0"), reason: z.string().trim().min(2).max(120) });

/** Entrada (+) o salida (-) de inventario con motivo. Nunca deja stock negativo. */
export const POST = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("products.manage");
  const { id } = await params;
  const d = Schema.parse(await body(req));
  const product = await prisma.$transaction(async (tx) => {
    const where = { id, barbershopId: c.shopId, ...(d.delta < 0 ? { stock: { gte: -d.delta } } : {}) };
    const r = await tx.product.updateMany({ where, data: { stock: { increment: d.delta } } });
    if (!r.count) {
      const exists = await tx.product.findFirst({ where: { id, barbershopId: c.shopId } });
      if (!exists) throw notFound("Producto no encontrado");
      throw bad(`No hay suficiente stock: quedan ${exists.stock}`);
    }
    await tx.stockMovement.create({ data: { barbershopId: c.shopId, productId: id, delta: d.delta, reason: d.reason, memberId: c.memberId } });
    return tx.product.findUniqueOrThrow({ where: { id } });
  });
  return json({ product });
});

export const GET = handle(async (_req: Request, { params }: P) => {
  const c = await requireCtx("products.manage");
  const { id } = await params;
  return json({ movements: await prisma.stockMovement.findMany({ where: { productId: id, barbershopId: c.shopId }, orderBy: { createdAt: "desc" }, take: 50 }) });
});
