import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound } from "@/lib/http";
import { ServiceSchema } from "@/lib/schemas";

type P = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("services");
  const { id } = await params;
  const d = ServiceSchema.partial().parse(await body(req));
  const r = await prisma.service.updateMany({ where: { id, barbershopId: c.shopId }, data: d });
  if (!r.count) throw notFound("Servicio no encontrado");
  return json({ service: await prisma.service.findUnique({ where: { id } }) });
});

/** Borrado real solo si nunca se usó; si tiene citas, se desactiva para conservar el historial. */
export const DELETE = handle(async (_req: Request, { params }: P) => {
  const c = await requireCtx("services");
  const { id } = await params;
  const s = await prisma.service.findFirst({ where: { id, barbershopId: c.shopId }, include: { _count: { select: { appointments: true } } } });
  if (!s) throw notFound("Servicio no encontrado");
  if (s._count.appointments) { await prisma.service.update({ where: { id }, data: { active: false } }); return json({ deactivated: true }); }
  await prisma.service.delete({ where: { id } });
  return json({ deleted: true });
});
