"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { barbersNow, joinQueue, QueueError, syncQueueMessages } from "@/lib/queue";
import { timeLabel } from "@/lib/time";
import { audit } from "@/lib/audit";
import { book, BookingError } from "@/lib/booking";
import { baseUrl } from "@/lib/messages";
import * as v from "@/lib/validate";
import type { ActionResult } from "@/components/action-form";

async function refresh(shop: Parameters<typeof syncQueueMessages>[0]) {
  await syncQueueMessages(shop, await baseUrl());
  revalidatePath("/fila");
  revalidatePath("/hoy");
}

/** Formar a alguien que llegó sin celular o lo pidió en persona. */
export async function addToQueue(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("fila");
  const name = v.text(data.get("name"), "el nombre", { required: true, max: 60 });
  const phone = v.phone(data.get("phone"));
  const err = v.first(name, phone);
  if (err) return { error: err };
  try {
    await joinQueue(shop, {
      name: name.value!, phone: phone.value ?? null, source: "PANEL",
      serviceId: String(data.get("serviceId") || "") || null, staffId: String(data.get("staffId") || "") || null,
    });
  } catch (e) {
    if (e instanceof QueueError) return { error: e.message };
    throw e;
  }
  await refresh(shop);
  return { ok: "Agregado a la fila." };
}

async function entryOf(id: string) {
  const { shop, me } = await requireSection("fila");
  const e = await prisma.queueEntry.findFirst({ where: { id, shopId: shop.id, status: { in: ["WAITING", "CALLED"] } } });
  return { shop, me, e };
}

export async function callEntry(data: FormData) {
  const { shop, e } = await entryOf(String(data.get("id")));
  if (!e) return;
  await prisma.queueEntry.update({ where: { id: e.id }, data: { status: "CALLED", calledAt: new Date(), staffId: String(data.get("staffId") || "") || e.staffId } });
  await refresh(shop);
}

export async function leftEntry(data: FormData) {
  const { shop, e } = await entryOf(String(data.get("id")));
  if (!e) return;
  await prisma.queueEntry.update({ where: { id: e.id }, data: { status: "LEFT", finishedAt: new Date() } });
  await refresh(shop);
}

/** Menos de esto no se ofrece "pasar de todos modos". */
const MIN_FIT = 10;

/** Pasa con un barbero: se crea su cita "en silla" desde este momento (o va directo a cobrar si no dejó teléfono). */
export async function serveEntry(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, e } = await entryOf(String(data.get("id")));
  if (!e) return { error: "Ya no está en la fila." };
  const staffId = String(data.get("staffId") || "");
  const serviceId = String(data.get("serviceId") || "") || e.serviceId;
  if (!staffId) return { error: "Elige qué barbero lo atiende." };
  if (!serviceId) return { error: "Elige el servicio." };

  // ¿Le alcanza el tiempo a ese barbero antes de su siguiente cita?
  const [who, svc] = await Promise.all([
    barbersNow(shop).then((l) => l.find((b) => b.id === staffId)),
    prisma.service.findFirst({ where: { id: serviceId, shopId: shop.id }, select: { name: true, minutes: true } }),
  ]);
  if (!who) return { error: "Ese barbero no está disponible." };
  if (!svc) return { error: "Elige el servicio." };
  const first = who.name.split(" ")[0];
  if (who.state === "busy") return { error: `${first} está atendiendo hasta las ${timeLabel(who.until!, shop.timezone)}. Elige otro barbero o espera.` };
  // "Pasar de todos modos": el barbero cree que alcanza; la cita se ajusta para terminar justo antes de la siguiente
  const tight = who.state === "free" && who.nextAppt && who.freeMinutes < svc.minutes;
  const fit = data.get("fit") === "1";
  if (tight && (!fit || who.freeMinutes < MIN_FIT)) {
    return { error: who.freeMinutes < MIN_FIT
      ? `A ${first} solo le quedan ${who.freeMinutes} min antes de su cita de las ${timeLabel(who.nextAppt!, shop.timezone)}: no alcanza. Elige otro barbero o pásalo cuando termine esa cita.`
      : `A ${first} le quedan ${who.freeMinutes} min antes de su cita de las ${timeLabel(who.nextAppt!, shop.timezone)} y ${svc.name} normalmente dura ${svc.minutes}. Si sí le alcanza, pásalo de todos modos.`,
      canForce: who.freeMinutes >= MIN_FIT };
  }
  // Desde el minuto en que empieza (el mismo que usa la cita) hasta la siguiente cita, exacto
  const startMin = Math.floor(Date.now() / 60_000) * 60_000;
  const maxMinutes = tight ? Math.round((who.nextAppt!.getTime() - startMin) / 60_000) : undefined;

  if (!e.phone) {
    await prisma.queueEntry.update({ where: { id: e.id }, data: { status: "DONE", finishedAt: new Date(), staffId } });
    await refresh(shop);
    redirect("/ventas/nueva");
  }
  let apptId: string;
  try {
    const now = new Date(startMin);
    const a = await book({
      shopId: shop.id, staffId, serviceIds: [serviceId], startsAt: now,
      customer: { name: e.name, phone: e.phone! }, source: "WALK_IN", notes: maxMinutes ? `Llegó por la fila (en ${maxMinutes} min, antes de su siguiente cita)` : "Llegó por la fila", maxMinutes,
    });
    await prisma.appointment.update({ where: { id: a.id }, data: { status: "IN_PROGRESS" } });
    apptId = a.id;
  } catch (err) {
    if (err instanceof BookingError) {
      return { error: err.message.includes("ocupar") ? "Ese barbero ya tiene algo en la agenda en ese horario. Revisa su agenda o elige otro." : err.message };
    }
    throw err;
  }
  await prisma.queueEntry.update({ where: { id: e.id }, data: { status: "DONE", finishedAt: new Date(), staffId, appointmentId: apptId, serviceId } });
  await refresh(shop);
  redirect(`/citas/${apptId}`);
}

/** El barbero terminó antes de la hora agendada (aunque aún no se cobre): queda libre desde ya. */
export async function finishNow(data: FormData) {
  const { shop, me } = await requireSection("fila");
  const staffId = String(data.get("staffId"));
  const nowMin = Math.floor(Date.now() / 60_000) * 60_000;
  const current = await prisma.appointment.findFirst({
    where: { shopId: shop.id, staffId, status: { notIn: ["CANCELLED", "NO_SHOW"] }, startsAt: { lt: new Date(nowMin) }, endsAt: { gt: new Date(nowMin) } },
    include: { customer: { select: { name: true } }, staff: { select: { name: true } } },
  });
  if (!current) return;
  await prisma.appointment.update({ where: { id: current.id }, data: { endsAt: new Date(nowMin) } });
  await audit(shop.id, me.id, "cita.termino_antes", `${current.staff.name} terminó antes con ${current.customer.name}`, { type: "appointment", id: current.id });
  revalidatePath("/fila");
  revalidatePath("/agenda");
}
