"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { readSchedule } from "@/lib/schedule";
import { localToUtc, parseHHMM } from "@/lib/time";
import type { ActionResult } from "@/components/action-form";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { baseUrl } from "@/lib/messages";
import type { Role } from "@/generated/prisma/enums";

const ROLES: Role[] = ["MANAGER", "BARBER", "RECEPTIONIST"];
const rate = (v: FormDataEntryValue | null, fallback: number) => {
  const n = Number(String(v ?? "").replace("%", ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : fallback;
};

async function editable(id: string) {
  const ctx = await requireSection("equipo");
  const s = await prisma.staff.findFirst({ where: { id, shopId: ctx.shop.id } });
  if (!s) throw new Error("No encontrado");
  if (s.role === "OWNER" && ctx.me.role !== "OWNER") throw new Error("Solo el dueño puede editar su perfil.");
  return { ctx, s };
}

export async function addStaff(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("equipo");
  const name = String(data.get("name") ?? "").trim();
  const email = String(data.get("email") ?? "").trim().toLowerCase() || null;
  const role = String(data.get("role")) as Role;
  if (!name) return { error: "Escribe el nombre." };
  if (!ROLES.includes(role)) return { error: "Elige un rol." };
  if (email && (await prisma.staff.findFirst({ where: { shopId: shop.id, email } }))) return { error: "Ya hay alguien con ese email en el equipo." };

  const existingUser = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const takes = role !== "RECEPTIONIST";
  const hours = await prisma.shopHours.findMany({ where: { shopId: shop.id } });
  const services = takes ? await prisma.service.findMany({ where: { shopId: shop.id, active: true }, select: { id: true } }) : [];

  const s = await prisma.staff.create({
    data: {
      shopId: shop.id, name, email, role, phone: String(data.get("phone") ?? "").trim() || null,
      userId: existingUser?.id ?? null, takesAppointments: takes,
      ...(takes && {
        schedule: { create: hours.map((h) => ({ weekday: h.weekday, startMinute: h.startMinute, endMinute: h.endMinute })) },
        services: { create: services.map((x) => ({ serviceId: x.id })) },
      }),
    },
  });
  revalidatePath("/equipo");
  const sent = email && !existingUser ? await sendInvite(email, name) : null;
  redirect(`/equipo/${s.id}${sent === null ? "" : sent ? "?invitacion=enviada" : "?invitacion=error"}`);
}

/** Correo de invitación de Supabase. Devuelve null si no está configurado. */
async function sendInvite(email: string, name: string) {
  const admin = supabaseAdmin();
  if (!admin) return null;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name }, redirectTo: `${await baseUrl()}/auth/confirm`,
  });
  // Si ya tenía cuenta en Supabase, basta con que entre: se liga solo al equipo
  return !error || /already|registered|exists/i.test(error.message);
}

export async function resendInvite(data: FormData) {
  const { shop } = await requireSection("equipo");
  const s = await prisma.staff.findFirst({ where: { id: String(data.get("id")), shopId: shop.id, userId: null } });
  if (!s?.email) return;
  const sent = await sendInvite(s.email, s.name);
  redirect(`/equipo/${s.id}?invitacion=${sent ? "enviada" : "error"}`);
}

export async function updateStaff(_: ActionResult, data: FormData): Promise<ActionResult> {
  try {
    const { ctx, s } = await editable(String(data.get("id")));
    const name = String(data.get("name") ?? "").trim();
    if (!name) return { error: "Escribe el nombre." };
    const role = s.role === "OWNER" ? "OWNER" : (String(data.get("role")) as Role);
    if (!ROLES.includes(role) && role !== "OWNER") return { error: "Rol no válido." };
    const email = String(data.get("email") ?? "").trim().toLowerCase() || null;
    if (email && email !== s.email && (await prisma.staff.findFirst({ where: { shopId: ctx.shop.id, email } })))
      return { error: "Ya hay alguien con ese email en el equipo." };

    await prisma.staff.update({
      where: { id: s.id },
      data: {
        name, role, phone: String(data.get("phone") ?? "").trim() || null,
        ...(!s.userId && { email }),
        takesAppointments: data.get("takesAppointments") === "on",
        serviceCommission: rate(data.get("serviceCommission"), Number(s.serviceCommission)),
        productCommission: rate(data.get("productCommission"), Number(s.productCommission)),
      },
    });
    revalidatePath("/equipo");
    revalidatePath(`/equipo/${s.id}`);
    return { ok: "Perfil guardado." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function saveStaffServices(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { ctx, s } = await editable(String(data.get("id")));
  const ids = data.getAll("serviceId").map(String);
  const valid = await prisma.service.findMany({ where: { shopId: ctx.shop.id, id: { in: ids } }, select: { id: true } });
  await prisma.$transaction([
    prisma.staffService.deleteMany({ where: { staffId: s.id } }),
    prisma.staffService.createMany({ data: valid.map((v) => ({ staffId: s.id, serviceId: v.id })) }),
  ]);
  revalidatePath(`/equipo/${s.id}`);
  return { ok: "Servicios guardados." };
}

export async function saveStaffSchedule(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { s } = await editable(String(data.get("id")));
  const r = readSchedule(data);
  if ("error" in r) return { error: r.error };
  await prisma.$transaction([
    prisma.staffHours.deleteMany({ where: { staffId: s.id } }),
    prisma.staffHours.createMany({ data: r.blocks.map((b) => ({ ...b, staffId: s.id })) }),
  ]);
  revalidatePath("/agenda");
  revalidatePath(`/equipo/${s.id}`);
  return { ok: "Horario guardado." };
}

export async function addTimeOff(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { ctx, s } = await editable(String(data.get("id")));
  const tz = ctx.shop.timezone;
  const from = String(data.get("from") ?? ""), to = String(data.get("to") ?? "") || from;
  const allDay = !data.get("start") && !data.get("end");
  if (!from) return { error: "Elige el día." };
  const startsAt = localToUtc(from, allDay ? 0 : parseHHMM(String(data.get("start") || "00:00")), tz);
  const endsAt = localToUtc(to, allDay ? 1440 : parseHHMM(String(data.get("end") || "23:59")), tz);
  if (endsAt <= startsAt) return { error: "El final debe ser después del inicio." };
  await prisma.timeOff.create({ data: { staffId: s.id, startsAt, endsAt, reason: String(data.get("reason") ?? "").trim() || null } });
  revalidatePath(`/equipo/${s.id}`);
  revalidatePath("/agenda");
  return { ok: "Ausencia registrada." };
}

export async function removeTimeOff(data: FormData) {
  const { s } = await editable(String(data.get("id")));
  await prisma.timeOff.deleteMany({ where: { id: String(data.get("timeOffId")), staffId: s.id } });
  revalidatePath(`/equipo/${s.id}`);
}

export async function toggleStaff(data: FormData) {
  const { ctx, s } = await editable(String(data.get("id")));
  if (s.role === "OWNER") return;
  if (s.id === ctx.me.id) return;
  await prisma.staff.update({ where: { id: s.id }, data: { active: !s.active } });
  revalidatePath("/equipo");
  redirect("/equipo");
}
