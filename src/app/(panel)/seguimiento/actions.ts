"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { isDate, today } from "@/lib/time";
import type { ActionResult } from "@/components/action-form";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

function refresh(customerId?: string | null) {
  revalidatePath("/seguimiento");
  revalidatePath("/hoy");
  if (customerId) revalidatePath(`/clientes/${customerId}`);
}

export async function createTask(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("seguimiento");
  const title = str(data.get("title")).slice(0, 200);
  const due = str(data.get("dueOn")) || today(shop.timezone);
  if (!title) return { error: "Escribe qué hay que hacer." };
  if (!isDate(due)) return { error: "Elige la fecha." };

  let customerId = str(data.get("customerId")) || null;
  const phone = str(data.get("customerPhone")).replace(/\D/g, "");
  if (!customerId && phone) {
    const c = await prisma.customer.findUnique({ where: { shopId_phone: { shopId: shop.id, phone } } });
    if (!c) return { error: "No hay cliente con ese teléfono." };
    customerId = c.id;
  }
  if (customerId && !(await prisma.customer.findFirst({ where: { id: customerId, shopId: shop.id } }))) {
    return { error: "Cliente no encontrado." };
  }
  // Un barbero solo se asigna tareas a sí mismo
  let assignedToId = str(data.get("assignedToId")) || null;
  if (seesOnlyOwnAgenda(me.role)) assignedToId = me.id;
  else if (assignedToId && !(await prisma.staff.findFirst({ where: { id: assignedToId, shopId: shop.id, active: true } }))) {
    assignedToId = null;
  }

  await prisma.task.create({
    data: { shopId: shop.id, title, dueOn: new Date(`${due}T00:00:00Z`), customerId, assignedToId, createdById: me.id },
  });
  refresh(customerId);
  return { ok: "Seguimiento agendado." };
}

export async function toggleTask(data: FormData) {
  const { shop, me } = await requireSection("seguimiento");
  const t = await prisma.task.findFirst({
    where: { id: str(data.get("id")), shopId: shop.id,
      ...(seesOnlyOwnAgenda(me.role) && { OR: [{ assignedToId: me.id }, { assignedToId: null }] }) },
  });
  if (!t) return;
  await prisma.task.update({ where: { id: t.id }, data: { doneAt: t.doneAt ? null : new Date() } });
  refresh(t.customerId);
}

export async function deleteTask(data: FormData) {
  const { shop, me } = await requireSection("seguimiento");
  const t = await prisma.task.findFirst({ where: { id: str(data.get("id")), shopId: shop.id } });
  if (!t || (seesOnlyOwnAgenda(me.role) && t.createdById !== me.id)) return;
  await prisma.task.delete({ where: { id: t.id } });
  refresh(t.customerId);
}

/** Desde una sugerencia: crea el seguimiento para hoy con un clic. */
export async function quickTask(data: FormData) {
  const { shop, me } = await requireSection("seguimiento");
  const customerId = str(data.get("customerId"));
  const title = str(data.get("title")).slice(0, 200);
  if (!title || !(await prisma.customer.findFirst({ where: { id: customerId, shopId: shop.id } }))) return;
  await prisma.task.create({
    data: { shopId: shop.id, customerId, title, dueOn: new Date(`${today(shop.timezone)}T00:00:00Z`), assignedToId: me.id, createdById: me.id },
  });
  refresh(customerId);
}
