"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { joinQueue, QueueError, syncQueueMessages } from "@/lib/queue";
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

/** Pasa con un barbero: se crea su cita "en silla" desde este momento (o va directo a cobrar si no dejó teléfono). */
export async function serveEntry(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, e } = await entryOf(String(data.get("id")));
  if (!e) return { error: "Ya no está en la fila." };
  const staffId = String(data.get("staffId") || "");
  const serviceId = String(data.get("serviceId") || "") || e.serviceId;
  if (!staffId) return { error: "Elige qué barbero lo atiende." };
  if (!serviceId) return { error: "Elige el servicio." };

  if (!e.phone) {
    await prisma.queueEntry.update({ where: { id: e.id }, data: { status: "DONE", finishedAt: new Date(), staffId } });
    await refresh(shop);
    redirect("/ventas/nueva");
  }
  let apptId: string;
  try {
    const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const a = await book({
      shopId: shop.id, staffId, serviceIds: [serviceId], startsAt: now,
      customer: { name: e.name, phone: e.phone! }, source: "WALK_IN", notes: "Llegó por la fila",
    });
    await prisma.appointment.update({ where: { id: a.id }, data: { status: "IN_PROGRESS" } });
    apptId = a.id;
  } catch (err) {
    if (err instanceof BookingError) {
      return { error: err.message.includes("ocupar") ? "Ese barbero tiene una cita en este momento. Elige otro o espera a que termine." : err.message };
    }
    throw err;
  }
  await prisma.queueEntry.update({ where: { id: e.id }, data: { status: "DONE", finishedAt: new Date(), staffId, appointmentId: apptId, serviceId } });
  await refresh(shop);
  redirect(`/citas/${apptId}`);
}
