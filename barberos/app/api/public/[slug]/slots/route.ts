import { prisma } from "@/lib/db";
import { handle, json, notFound, bad } from "@/lib/http";
import { freeSlots, freeSlotsAny } from "@/lib/domain/appointments";

type P = { params: Promise<{ slug: string }> };

export const GET = handle(async (req: Request, { params }: P) => {
  const { slug } = await params;
  const shop = await prisma.barbershop.findUnique({ where: { slug } });
  if (!shop) throw notFound("Barbería no encontrada");
  const u = new URL(req.url);
  const barberId = u.searchParams.get("barberId"), serviceId = u.searchParams.get("serviceId"), date = u.searchParams.get("date");
  if (!barberId || !serviceId || !date) throw bad("Faltan barbero, servicio o fecha");
  return json({ slots: barberId === "any" ? await freeSlotsAny(shop, serviceId, date) : await freeSlots(shop, barberId, serviceId, date) });
});
