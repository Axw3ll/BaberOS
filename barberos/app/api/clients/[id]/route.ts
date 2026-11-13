import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound, conflict } from "@/lib/http";
import { ClientSchema } from "@/lib/schemas";
import { normalizePhone } from "@/lib/domain/appointments";
import { clientCards } from "@/lib/domain/clients";

type P = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: P) => {
  const c = await requireCtx("clients", "booking");
  const { id } = await params;
  const [card] = await clientCards(c.shop, { id });
  if (!card) throw notFound("Cliente no encontrado");
  return json({ client: card });
});

export const PATCH = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("clients");
  const { id } = await params;
  const d = ClientSchema.partial().parse(await body(req));
  const cur = await prisma.client.findFirst({ where: { id, barbershopId: c.shopId } });
  if (!cur) throw notFound("Cliente no encontrado");
  const data: Record<string, unknown> = { ...d };
  if (d.phone) {
    data.phone = normalizePhone(d.phone);
    const dup = await prisma.client.findFirst({ where: { barbershopId: c.shopId, phone: data.phone as string, id: { not: id } } });
    if (dup) throw conflict(`Ese teléfono ya es de ${dup.name}`);
  }
  if (d.favoriteBarberId) await prisma.barber.findFirstOrThrow({ where: { id: d.favoriteBarberId, barbershopId: c.shopId } });
  return json({ client: await prisma.client.update({ where: { id }, data }) });
});

/** Sin citas: se elimina. Con historial: se archiva para no perder cobros ni reportes. */
export const DELETE = handle(async (_req: Request, { params }: P) => {
  const c = await requireCtx("clients");
  const { id } = await params;
  const cur = await prisma.client.findFirst({ where: { id, barbershopId: c.shopId }, include: { _count: { select: { appointments: true } } } });
  if (!cur) throw notFound("Cliente no encontrado");
  if (cur._count.appointments) { await prisma.client.update({ where: { id }, data: { active: false } }); return json({ archived: true }); }
  await prisma.client.delete({ where: { id } });
  return json({ deleted: true });
});
