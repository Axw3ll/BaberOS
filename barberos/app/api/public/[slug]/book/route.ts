import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handle, json, notFound, conflict } from "@/lib/http";
import { createAppointment, findOrCreateClient, freeSlots, pickBarber } from "@/lib/domain/appointments";
import { humanDate } from "@/lib/time";

type P = { params: Promise<{ slug: string }> };
const Schema = z.object({
  serviceId: z.string(), barberId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/),
  name: z.string().trim().min(2).max(80), phone: z.string().trim().min(10).max(20),
});

/** Reserva en línea: solo se acepta si el horario sigue libre de verdad. */
export const POST = handle(async (req: Request, { params }: P) => {
  const { slug } = await params;
  const shop = await prisma.barbershop.findUnique({ where: { slug } });
  if (!shop) throw notFound("Barbería no encontrada");
  const d = Schema.parse(await body(req));
  // "any" = sin preferencia: el servidor asigna al barbero libre con menos citas ese día
  const barberId = d.barberId === "any" ? await pickBarber(shop, d.serviceId, d.date, d.time) : d.barberId;
  if (!barberId || !(await freeSlots(shop, barberId, d.serviceId, d.date)).includes(d.time)) throw conflict("Ese horario ya no está disponible. Elige otro.", "SLOT_TAKEN");

  const appt = await prisma.$transaction(async (tx) => {
    const client = await findOrCreateClient(tx, shop.id, d.name, d.phone);
    return createAppointment(tx, shop, { barberId, serviceId: d.serviceId, clientId: client.id, date: d.date, time: d.time, source: "ONLINE" });
  });
  const full = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: { service: true, barber: true, deposit: true } });
  return json({
    confirmation: {
      id: full.id, token: full.publicToken,
      service: full.service.name, barber: full.barber.name, date: d.date, dateLabel: humanDate(d.date), time: d.time,
      total: full.price, deposit: full.deposit?.amount ?? 0, depositStatus: full.deposit?.status ?? null,
      shopName: shop.name, shopPhone: shop.phone,
    },
  }, 201);
});
