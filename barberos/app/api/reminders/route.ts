import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound } from "@/lib/http";
import { addDays, dayRange, localDate, localTime, todayLocal } from "@/lib/time";
import { reminderText, waLink, getProvider } from "@/lib/domain/messaging";

async function group(shopId: string, shop: { timezone: string; name: string; phone: string }, date: string, kind: "TODAY" | "TOMORROW") {
  const appts = await prisma.appointment.findMany({
    where: { barbershopId: shopId, startAt: dayRange(date, shop.timezone), status: { in: ["PENDING", "CONFIRMED"] } },
    include: { client: true, service: true, barber: true, reminderLogs: true }, orderBy: { startAt: "asc" },
  });
  if (kind === "TODAY") {
    // solo las que aún no pasan
    const now = new Date();
    for (let i = appts.length - 1; i >= 0; i--) if (appts[i].startAt < now) appts.splice(i, 1);
  }
  return appts.map((a) => {
    const time = localTime(a.startAt, shop.timezone);
    const text = reminderText({ client: a.client.name.split(" ")[0], service: a.service.name, barber: a.barber.name, date: localDate(a.startAt, shop.timezone), time, shop: shop.name, shopPhone: shop.phone, when: kind });
    const log = a.reminderLogs.find((l) => l.kind === kind);
    return { appointmentId: a.id, kind, time, client: a.client.name, phone: a.client.phone, service: a.service.name, barber: a.barber.name, message: text, link: waLink(a.client.phone, text), sent: log ? { at: log.sentAt, by: log.sentByName } : null };
  });
}

export const GET = handle(async () => {
  const c = await requireCtx("reminders");
  const today = todayLocal(c.shop.timezone);
  return json({
    automatic: getProvider().automatic, // false: el envío es manual
    tomorrow: await group(c.shopId, c.shop, addDays(today, 1), "TOMORROW"),
    today: await group(c.shopId, c.shop, today, "TODAY"),
  });
});

const Schema = z.object({ appointmentId: z.string(), kind: z.enum(["TODAY", "TOMORROW"]) });

/** Marca como enviado (después de mandarlo a mano desde WhatsApp). Único por cita y tipo: no se repite. */
export const POST = handle(async (req: Request) => {
  const c = await requireCtx("reminders");
  const d = Schema.parse(await body(req));
  const a = await prisma.appointment.findFirst({ where: { id: d.appointmentId, barbershopId: c.shopId } });
  if (!a) throw notFound("Cita no encontrada");
  const log = await prisma.reminderLog.create({ data: { barbershopId: c.shopId, appointmentId: a.id, kind: d.kind, sentById: c.memberId, sentByName: c.memberName } });
  return json({ log }, 201);
});
