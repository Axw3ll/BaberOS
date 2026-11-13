"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyWaitlist } from "@/lib/waitlist";
import { baseUrl } from "@/lib/messages";
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
  const base = await baseUrl();
  after(() => notifyWaitlist(a.shop, a, base).catch((e) => console.error("waitlist", e)));
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

/** Calificación de 1 a 5 después de la visita. Una por cita. */
export async function rateByToken(token: string, rating: number, comment: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "Enlace no válido." };
  if (!(await allow(`rate:${token}`, 10, 3600))) return { error: "Demasiados intentos. Intenta más tarde." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Elige de 1 a 5 estrellas." };
  const text = comment.trim().replace(/\s+/g, " ");
  if (text.length > 500) return { error: "El comentario puede tener hasta 500 letras." };
  const a = await prisma.appointment.findUnique({ where: { token }, include: { shop: true, customer: true, staff: true, review: true } });
  if (!a || a.status !== "COMPLETED") return { error: "Podrás calificar cuando termine tu visita." };
  if (a.review) return { error: "Ya calificaste esta visita. ¡Gracias!" };
  if (a.endsAt.getTime() < Date.now() - 30 * 86_400_000) return { error: "Esta visita ya es de hace más de un mes." };
  try {
    await prisma.review.create({
      data: { shopId: a.shopId, appointmentId: a.id, customerId: a.customerId, staffId: a.staffId, rating, comment: text || null },
    });
  } catch (e) {
    if (String(e).includes("Unique")) return { error: "Ya calificaste esta visita. ¡Gracias!" };
    throw e;
  }
  await log(a.shopId, a.customerId, `Calificó su visita con ${a.staff.name}: ${"★".repeat(rating)}${text ? ` — “${text}”` : ""}`);
  // Calificación baja: queda una tarea para llamarle hoy mismo (antes de que lo cuente en otro lado)
  if (rating <= 3) {
    await prisma.task.create({
      data: {
        shopId: a.shopId, customerId: a.customerId, dueOn: new Date(`${today(a.shop.timezone)}T00:00:00Z`),
        title: `Calificación baja (${rating}★) con ${a.staff.name.split(" ")[0]}: llamarle y preguntar qué pasó`,
      },
    });
  }
  revalidatePath(`/c/${token}`);
  return { ok: true, googleUrl: a.shop.googleReviewUrl };
}
