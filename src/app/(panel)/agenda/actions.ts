"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { book, BookingError, slotsFor } from "@/lib/booking";
import { isDate, toLocalDate } from "@/lib/time";
import type { ActionResult } from "@/components/action-form";
import type { AppointmentStatus } from "@/generated/prisma/enums";

export async function getSlots(input: { staffId: string; serviceIds: string[]; date: string }) {
  const { shop, me } = await requireSection("agenda");
  if (!isDate(input.date) || input.serviceIds.length === 0 || !input.staffId) return [];
  if (seesOnlyOwnAgenda(me.role) && input.staffId !== me.id) return [];
  try {
    const slots = await slotsFor({ shopId: shop.id, staffId: input.staffId, serviceIds: input.serviceIds, date: input.date, ignoreNotice: true });
    return slots.map((t) => new Date(t).toISOString());
  } catch {
    return [];
  }
}

export async function findCustomer(phone: string) {
  const { shop } = await requireSection("agenda");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const c = await prisma.customer.findUnique({ where: { shopId_phone: { shopId: shop.id, phone: digits } } });
  return c && { id: c.id, name: c.name };
}

export async function createAppointment(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("agenda");
  const staffId = String(data.get("staffId") ?? "");
  const startsAt = new Date(String(data.get("startsAt") ?? ""));
  const serviceIds = data.getAll("serviceId").map(String);
  if (seesOnlyOwnAgenda(me.role) && staffId !== me.id) return { error: "Solo puedes agendar en tu propia agenda." };
  if (Number.isNaN(startsAt.getTime())) return { error: "Elige un horario." };

  let id: string;
  try {
    const a = await book({
      shopId: shop.id, staffId, serviceIds, startsAt,
      customer: { name: String(data.get("name") ?? ""), phone: String(data.get("phone") ?? "") },
      source: data.get("source") === "PHONE" ? "PHONE" : "WALK_IN",
      notes: String(data.get("notes") ?? "").trim(),
      checkAvailability: { ignoreNotice: true, date: toLocalDate(startsAt, shop.timezone) },
    });
    id = a.id;
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  revalidatePath("/agenda");
  redirect(`/citas/${id}`);
}

const ALLOWED: AppointmentStatus[] = ["CONFIRMED", "IN_PROGRESS", "NO_SHOW", "CANCELLED", "PENDING"];

export async function setStatus(data: FormData) {
  const { shop, me } = await requireSection("agenda");
  const id = String(data.get("id"));
  const status = String(data.get("status")) as AppointmentStatus;
  if (!ALLOWED.includes(status)) return;
  try {
    await prisma.appointment.update({
      where: { id, shopId: shop.id, ...(seesOnlyOwnAgenda(me.role) && { staffId: me.id }), status: { not: "COMPLETED" } },
      data: { status },
    });
  } catch (e) {
    if (String(e).includes("appointments_no_overlap")) redirect(`/citas/${id}?error=ocupado`);
    throw e;
  }
  revalidatePath(`/citas/${id}`);
  revalidatePath("/agenda");
}

export async function saveNotes(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("agenda");
  await prisma.appointment.update({
    where: { id: String(data.get("id")), shopId: shop.id },
    data: { notes: String(data.get("notes") ?? "").trim() || null },
  });
  revalidatePath(`/citas/${String(data.get("id"))}`);
  return { ok: "Nota guardada." };
}
