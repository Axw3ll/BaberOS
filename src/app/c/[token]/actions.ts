"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { slotsFor } from "@/lib/booking";
import { allow } from "@/lib/guard";
import { addDays, dateLabel, isDate, timeLabel, toLocalDate, today } from "@/lib/time";

const ACTIVE = ["PENDING", "CONFIRMED"] as const;

async function load(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  if (!(await allow(`manage:${token}`, 40, 3600))) return null;
  const a = await prisma.appointment.findUnique({ where: { token }, include: { shop: true, services: true } });
  if (!a || !ACTIVE.includes(a.status as (typeof ACTIVE)[number]) || a.startsAt.getTime() <= Date.now()) return null;
  return a;
}

const log = (shopId: string, customerId: string, body: string) =>
  prisma.customerActivity.create({ data: { shopId, customerId, type: "NOTE", body } });

export async function confirmByToken(token: string) {
  const a = await load(token);
  if (!a) return { error: "Esta cita ya no se puede modificar." };
  await prisma.appointment.update({ where: { id: a.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  await log(a.shopId, a.customerId, "Confirmó su cita desde su enlace.");
  revalidatePath(`/c/${token}`);
  return { ok: true };
}

export async function cancelByToken(token: string) {
  const a = await load(token);
  if (!a) return { error: "Esta cita ya no se puede modificar." };
  await prisma.appointment.update({ where: { id: a.id }, data: { status: "CANCELLED" } });
  await log(a.shopId, a.customerId, `Canceló su cita del ${dateLabel(toLocalDate(a.startsAt, a.shop.timezone), { day: "numeric", month: "short" })} desde su enlace.`);
  revalidatePath(`/c/${token}`);
  return { ok: true };
}

export async function slotsByToken(token: string, date: string) {
  const a = await load(token);
  if (!a || !isDate(date)) return [];
  const t = today(a.shop.timezone);
  if (date < t || date > addDays(t, a.shop.maxAdvanceDays)) return [];
  const slots = await slotsFor({
    shopId: a.shopId, staffId: a.staffId, serviceIds: a.services.map((s) => s.serviceId), date, excludeAppointmentId: a.id,
  });
  return slots.map((x) => new Date(x).toISOString());
}

export async function rescheduleByToken(token: string, at: string) {
  const a = await load(token);
  if (!a) return { error: "Esta cita ya no se puede modificar." };
  const start = new Date(at);
  if (Number.isNaN(start.getTime())) return { error: "Elige un horario." };
  const free = await slotsByToken(token, toLocalDate(start, a.shop.timezone));
  if (!free.includes(start.toISOString())) return { error: "Ese horario ya no está libre. Elige otro." };
  const minutes = (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000;
  try {
    await prisma.appointment.update({
      where: { id: a.id },
      data: { startsAt: start, endsAt: new Date(start.getTime() + minutes * 60_000), status: "CONFIRMED", confirmedAt: new Date() },
    });
  } catch (e) {
    if (String(e).includes("appointments_no_overlap")) return { error: "Ese horario se acaba de ocupar. Elige otro." };
    throw e;
  }
  // Los recordatorios ya preparados para el horario anterior dejan de valer
  await prisma.outboundMessage.updateMany({ where: { appointmentId: a.id, status: "PENDING" }, data: { status: "SKIPPED" } });
  const tz = a.shop.timezone;
  await log(a.shopId, a.customerId, `Cambió su cita al ${dateLabel(toLocalDate(start, tz), { day: "numeric", month: "short" })} a las ${timeLabel(start, tz)} desde su enlace.`);
  revalidatePath(`/c/${token}`);
  return { ok: true };
}
