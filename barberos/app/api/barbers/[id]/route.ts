import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound } from "@/lib/http";
import { BarberSchema } from "@/lib/schemas";

type P = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("barbers");
  const { id } = await params;
  const d = BarberSchema.partial().parse(await body(req));
  const r = await prisma.barber.updateMany({ where: { id, barbershopId: c.shopId }, data: { ...d, ...(d.email !== undefined ? { email: d.email || null } : {}) } });
  if (!r.count) throw notFound("Barbero no encontrado");
  return json({ barber: await prisma.barber.findUnique({ where: { id } }) });
});
