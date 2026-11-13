"use server";
import { after } from "next/server";
import { baseUrl } from "@/lib/messages";
import { notifyWaitlist } from "@/lib/waitlist";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { book, BookingError, slotsFor } from "@/lib/booking";
import { addDays, isDate, toLocalDate, today } from "@/lib/time";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import * as v from "@/lib/validate";
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

/** Al escribir el teléfono: si ya es cliente, devuelve su nombre y lo que suele pedir. */
export async function findCustomer(phone: string) {
  const { shop } = await requireSection("agenda");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const c = await prisma.customer.findUnique({ where: { shopId_phone: { shopId: shop.id, phone: digits } } });
  if (!c) return null;
  // Su última cita terminada: mismos servicios y, si no tiene barbero de confianza, el mismo barbero
  const last = await prisma.appointment.findFirst({
    where: { customerId: c.id, status: "COMPLETED" }, orderBy: { startsAt: "desc" },
    include: { services: { select: { serviceId: true } } },
  });
  return {
    id: c.id, name: c.name,
    serviceIds: last?.services.map((s) => s.serviceId) ?? [],
    staffId: c.preferredStaffId ?? last?.staffId ?? null,
  };
}

/** Los siguientes horarios libres (hasta 14 días) para esos servicios, con un barbero o con cualquiera. */
export async function nextSlots(input: { serviceIds: string[]; staffId?: string | null; limit?: number }) {
  const { shop, me } = await requireSection("agenda");
  if (input.serviceIds.length === 0) return [];
  const own = seesOnlyOwnAgenda(me.role);
  const staff = await prisma.staff.findMany({
    where: {
      shopId: shop.id, active: true, takesAppointments: true,
      ...(own ? { id: me.id } : input.staffId ? { id: input.staffId } : {}),
      AND: input.serviceIds.map((id) => ({ services: { some: { serviceId: id } } })),
    },
    select: { id: true, name: true },
  });
  const limit = input.limit ?? 6;
  const found: { at: string; staffId: string; staffName: string }[] = [];
  const day0 = today(shop.timezone);
  for (let i = 0; i < 14 && found.length < limit; i++) {
    const date = addDays(day0, i);
    const perStaff = await Promise.all(staff.map(async (s) => {
      try {
        return (await slotsFor({ shopId: shop.id, staffId: s.id, serviceIds: input.serviceIds, date, ignoreNotice: true }))
          .filter((t) => t > Date.now()).map((t) => ({ at: t, staffId: s.id, staffName: s.name }));
      } catch { return []; }
    }));
    // Por hora; si dos barberos tienen la misma hora, solo se muestra una vez
    const seen = new Set<number>();
    for (const x of perStaff.flat().sort((a, b) => a.at - b.at)) {
      if (seen.has(x.at)) continue;
      seen.add(x.at);
      found.push({ at: new Date(x.at).toISOString(), staffId: x.staffId, staffName: x.staffName });
      if (found.length >= limit) break;
    }
  }
  return found;
}

export async function createAppointment(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("agenda");
  const staffId = String(data.get("staffId") ?? "");
  const startsAt = new Date(String(data.get("startsAt") ?? ""));
  const serviceIds = data.getAll("serviceId").map(String);
  if (seesOnlyOwnAgenda(me.role) && staffId !== me.id) return { error: "Solo puedes agendar en tu propia agenda." };
  if (Number.isNaN(startsAt.getTime())) return { error: "Elige un horario." };
  const vNotes = v.text(data.get("notes"), "la nota", { max: 300 });
  const vName = v.text(data.get("name"), "el nombre del cliente", { required: true, max: 80 });
  const vPhone = v.phone(data.get("phone"), { required: true });
  const err = v.first(vNotes, vName, vPhone);
  if (err) return { error: err };

  let id: string;
  try {
    const a = await book({
      shopId: shop.id, staffId, serviceIds, startsAt,
      customer: { name: String(data.get("name") ?? ""), phone: String(data.get("phone") ?? "") },
      source: data.get("source") === "PHONE" ? "PHONE" : "WALK_IN",
      notes: vNotes.value ?? undefined,
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
    const a = await prisma.appointment.update({
      where: { id, shopId: shop.id, ...(seesOnlyOwnAgenda(me.role) && { staffId: me.id }), status: { not: "COMPLETED" } },
      data: { status },
      include: { customer: { select: { name: true } } },
    });
    if (status === "CANCELLED" || status === "NO_SHOW") {
      await audit(shop.id, me.id, status === "CANCELLED" ? "cita.cancelada" : "cita.no_llego",
        `${status === "CANCELLED" ? "Canceló" : "Marcó que no llegó"} la cita de ${a.customer.name}`, { type: "appointment", id });
    }
    if (status === "CANCELLED") {
      const base = await baseUrl();
      after(() => notifyWaitlist(shop, a, base).catch((e) => console.error("waitlist", e)));
    }
  } catch (e) {
    if (String(e).includes("appointments_no_overlap")) redirect(`/citas/${id}?error=ocupado`);
    throw e;
  }
  revalidatePath(`/citas/${id}`);
  revalidatePath("/agenda");
}

export async function saveNotes(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("agenda");
  const vNotes = v.longText(data.get("notes"), "la nota", 1000);
  if (vNotes.error) return { error: vNotes.error };
  await prisma.appointment.update({
    where: { id: String(data.get("id")), shopId: shop.id },
    data: { notes: vNotes.value },
  });
  revalidatePath(`/citas/${String(data.get("id"))}`);
  return { ok: "Nota guardada." };
}
