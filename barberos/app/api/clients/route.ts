import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, conflict } from "@/lib/http";
import { ClientSchema } from "@/lib/schemas";
import { normalizePhone } from "@/lib/domain/appointments";
import { clientCards } from "@/lib/domain/clients";

export const GET = handle(async (req: Request) => {
  const c = await requireCtx("clients", "booking");
  const u = new URL(req.url);
  const filter = u.searchParams.get("filter") ?? "all";
  const q = (u.searchParams.get("q") ?? "").toLowerCase().trim();
  let list = await clientCards(c.shop);
  if (q) list = list.filter((x) => x.name.toLowerCase().includes(q) || x.phone.includes(q.replace(/\D/g, "") || "~"));
  if (filter === "frequent") list = list.filter((x) => x.visits >= 3).sort((a, b) => b.visits - a.visits);
  if (filter === "recover") list = list.filter((x) => x.recover).sort((a, b) => (b.daysAway ?? 0) - (a.daysAway ?? 0));
  if (filter === "noshow") list = list.filter((x) => x.noShows > 0).sort((a, b) => b.noShows - a.noShows);
  // la lista no lleva el historial completo; se abre en el modal
  return json({ clients: list.map(({ history, ...rest }) => ({ ...rest, historyCount: history.length })) });
});

export const POST = handle(async (req: Request) => {
  const c = await requireCtx("clients", "booking");
  const d = ClientSchema.parse(await body(req));
  const phone = normalizePhone(d.phone);
  const exists = await prisma.client.findUnique({ where: { barbershopId_phone: { barbershopId: c.shopId, phone } } });
  if (exists) throw conflict(`Ya existe un cliente con ese teléfono: ${exists.name}`);
  if (d.favoriteBarberId) await prisma.barber.findFirstOrThrow({ where: { id: d.favoriteBarberId, barbershopId: c.shopId } });
  return json({ client: await prisma.client.create({ data: { ...d, phone, barbershopId: c.shopId } }) }, 201);
});
