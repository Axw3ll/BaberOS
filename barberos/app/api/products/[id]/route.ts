import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound } from "@/lib/http";
import { ProductSchema } from "@/lib/schemas";

type P = { params: Promise<{ id: string }> };

/** Editar datos del producto. El stock NO se edita aquí: se ajusta con entradas/salidas con motivo. */
export const PATCH = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("products.manage");
  const { id } = await params;
  const { stock: _ignored, ...d } = ProductSchema.partial().parse(await body(req));
  const r = await prisma.product.updateMany({ where: { id, barbershopId: c.shopId }, data: d });
  if (!r.count) throw notFound("Producto no encontrado");
  return json({ product: await prisma.product.findUnique({ where: { id } }) });
});

export const DELETE = handle(async (_req: Request, { params }: P) => {
  const c = await requireCtx("products.manage");
  const { id } = await params;
  const p = await prisma.product.findFirst({ where: { id, barbershopId: c.shopId }, include: { _count: { select: { sales: true } } } });
  if (!p) throw notFound("Producto no encontrado");
  if (p._count.sales) { await prisma.product.update({ where: { id }, data: { active: false } }); return json({ deactivated: true }); }
  await prisma.product.delete({ where: { id } });
  return json({ deleted: true });
});
