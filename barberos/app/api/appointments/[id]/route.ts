import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound, forbidden } from "@/lib/http";
import { updateAppointment } from "@/lib/domain/appointments";
import { localDate, localTime } from "@/lib/time";

type P = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: P) => {
  const c = await requireCtx("agenda.all", "agenda.own");
  const { id } = await params;
  const a = await prisma.appointment.findFirst({
    where: { id, barbershopId: c.shopId },
    include: { client: true, service: true, barber: true, deposit: true, payment: true, rating: true, redeemedReward: true, reminderLogs: true },
  });
  if (!a) throw notFound("Cita no encontrada");
  if (c.role === "BARBER" && a.barberId !== c.barberId) throw forbidden("Esa cita no es tuya");
  const rewards = await prisma.loyaltyReward.count({ where: { barbershopId: c.shopId, clientId: a.clientId, redeemedAt: null } });
  return json({ appointment: { ...a, date: localDate(a.startAt, c.shop.timezone), time: localTime(a.startAt, c.shop.timezone), availableRewards: rewards } });
});

const Schema = z.object({
  barberId: z.string().optional(), serviceId: z.string().optional(), clientId: z.string().optional(),
  date: z.string().optional(), time: z.string().optional(), notes: z.string().max(500).nullable().optional(),
});

/** Editar o reprogramar sin cancelar (misma cita, mismo id). */
export const PATCH = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("booking");
  const { id } = await params;
  const d = Schema.parse(await body(req));
  return json({ appointment: await updateAppointment(c, id, d) });
});
