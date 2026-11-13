"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection } from "@/lib/auth";
import { ACTIVITY, ORIGIN, parseBirthday, TAG_COLORS } from "@/lib/crm";
import type { ActionResult } from "@/components/action-form";
import * as v from "@/lib/validate";
import type { ActivityType, CustomerOrigin } from "@/generated/prisma/enums";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const opt = (v: FormDataEntryValue | null) => str(v) || null;

async function customerFields(shopId: string, data: FormData, selfId?: string) {
  const vEmail = v.email(data.get("email"));
  const vNotes = v.longText(data.get("notes"), "la nota", 1000);
  const err = v.first(vEmail, vNotes);
  if (err) return { error: err } as const;
  const birthday = parseBirthday(data.get("birthday"));
  if (birthday === "invalid") return { error: "La fecha de cumpleaños no es válida." } as const;
  const originRaw = str(data.get("origin"));
  const origin = originRaw in ORIGIN ? (originRaw as CustomerOrigin) : null;

  const staffId = str(data.get("preferredStaffId"));
  const preferredStaffId = staffId && (await prisma.staff.findFirst({ where: { id: staffId, shopId } })) ? staffId : null;

  // "Lo recomendó": por teléfono, debe ser otro cliente de la barbería
  let referredById: string | null | undefined = undefined;
  if (data.has("referredByPhone")) {
    const refPhone = str(data.get("referredByPhone")).replace(/\D/g, "");
    if (!refPhone) referredById = null;
    else {
      const ref = await prisma.customer.findUnique({ where: { shopId_phone: { shopId, phone: refPhone } } });
      if (!ref) return { error: "No encontramos a quien lo recomendó con ese teléfono." } as const;
      if (ref.id === selfId) return { error: "Un cliente no puede recomendarse a sí mismo." } as const;
      referredById = ref.id;
    }
  }

  return {
    data: {
      email: vEmail.value,
      notes: vNotes.value,
      birthday, origin: referredById ? "REFERRAL" as const : origin, preferredStaffId,
      ...(referredById !== undefined && { referredById }),
      ...(data.has("marketingShown") && { acceptsMarketing: data.get("acceptsMarketing") === "on" }),
    },
  } as const;
}

export async function createCustomer(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("clientes");
  const vName = v.text(data.get("name"), "el nombre", { required: true, max: 80 });
  const vPhone = v.phone(data.get("phone"), { required: true });
  const err = v.first(vName, vPhone);
  if (err) return { error: err };
  const name = vName.value!, phone = vPhone.value!;
  const exists = await prisma.customer.findUnique({ where: { shopId_phone: { shopId: shop.id, phone } } });
  if (exists) redirect(`/clientes/${exists.id}`);
  const f = await customerFields(shop.id, data);
  if ("error" in f) return { error: f.error };
  const c = await prisma.customer.create({ data: { shopId: shop.id, name, phone, ...f.data } });
  revalidatePath("/clientes");
  redirect(`/clientes/${c.id}`);
}

export async function updateCustomer(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("clientes");
  const id = str(data.get("id"));
  const vName = v.text(data.get("name"), "el nombre", { required: true, max: 80 });
  const vPhone = v.phone(data.get("phone"), { required: true });
  const err = v.first(vName, vPhone);
  if (err) return { error: err };
  const name = vName.value!, phone = vPhone.value!;
  const dup = await prisma.customer.findUnique({ where: { shopId_phone: { shopId: shop.id, phone } } });
  if (dup && dup.id !== id) return { error: `Ese teléfono ya es de ${dup.name}.` };
  const f = await customerFields(shop.id, data, id);
  if ("error" in f) return { error: f.error };
  await prisma.customer.update({ where: { id, shopId: shop.id }, data: { name, phone, ...f.data } });
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return { ok: "Cambios guardados." };
}

/** Solo dueño o encargado. Las ventas quedan, sin cliente. */
export async function deleteCustomer(data: FormData) {
  const { shop, me } = await requireSection("clientes");
  if (!canAccess(me.role, "ajustes")) return;
  const id = str(data.get("id"));
  const appts = await prisma.appointment.count({ where: { customerId: id, shopId: shop.id } });
  if (appts > 0) redirect(`/clientes/${id}?error=citas`);
  await prisma.customer.deleteMany({ where: { id, shopId: shop.id } });
  revalidatePath("/clientes");
  redirect("/clientes");
}

// ── Etiquetas ────────────────────────────────────────────────────────

export async function toggleTag(data: FormData) {
  const { shop } = await requireSection("clientes");
  const customerId = str(data.get("customerId")), tagId = str(data.get("tagId"));
  const [c, t] = await Promise.all([
    prisma.customer.findFirst({ where: { id: customerId, shopId: shop.id } }),
    prisma.tag.findFirst({ where: { id: tagId, shopId: shop.id } }),
  ]);
  if (!c || !t) return;
  const key = { customerId_tagId: { customerId, tagId } };
  if (await prisma.customerTag.findUnique({ where: key })) await prisma.customerTag.delete({ where: key });
  else await prisma.customerTag.create({ data: { customerId, tagId } });
  revalidatePath(`/clientes/${customerId}`);
}

export async function createTag(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("clientes");
  const name = str(data.get("name")).slice(0, 30);
  if (!name) return { error: "Escribe el nombre de la etiqueta." };
  const color = (TAG_COLORS as readonly string[]).includes(str(data.get("color"))) ? str(data.get("color")) : "nickel";
  const tag = await prisma.tag.upsert({
    where: { shopId_name: { shopId: shop.id, name } }, update: {}, create: { shopId: shop.id, name, color },
  });
  const customerId = str(data.get("customerId"));
  if (customerId && (await prisma.customer.findFirst({ where: { id: customerId, shopId: shop.id } }))) {
    await prisma.customerTag.upsert({
      where: { customerId_tagId: { customerId, tagId: tag.id } }, update: {}, create: { customerId, tagId: tag.id },
    });
    revalidatePath(`/clientes/${customerId}`);
  }
  revalidatePath("/ajustes");
  return { ok: `Etiqueta “${tag.name}” lista.` };
}

export async function deleteTag(data: FormData) {
  const { shop } = await requireSection("ajustes");
  await prisma.tag.deleteMany({ where: { id: str(data.get("id")), shopId: shop.id } });
  revalidatePath("/ajustes");
  revalidatePath("/clientes");
}

// ── Bitácora ─────────────────────────────────────────────────────────

export async function addActivity(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("clientes");
  const customerId = str(data.get("customerId"));
  const type = str(data.get("type")) as ActivityType;
  const vBody = v.longText(data.get("body"), "la nota", 2000);
  if (vBody.error) return { error: vBody.error };
  const body = vBody.value ?? "";
  if (!(type in ACTIVITY)) return { error: "Elige el tipo." };
  if (!body) return { error: "Escribe qué pasó." };
  if (!(await prisma.customer.findFirst({ where: { id: customerId, shopId: shop.id } }))) return { error: "Cliente no encontrado." };
  await prisma.customerActivity.create({ data: { shopId: shop.id, customerId, staffId: me.id, type, body } });
  revalidatePath(`/clientes/${customerId}`);
  return { ok: "Registrado." };
}

/** Lo usa el botón de WhatsApp: deja constancia del mensaje enviado. */
export async function logMessage(customerId: string, body: string) {
  const { shop, me } = await requireSection("clientes");
  if (!(await prisma.customer.findFirst({ where: { id: customerId, shopId: shop.id } }))) return;
  await prisma.customerActivity.create({
    data: { shopId: shop.id, customerId, staffId: me.id, type: "WHATSAPP", body: body.slice(0, 2000) },
  });
  revalidatePath(`/clientes/${customerId}`);
}

export async function deleteActivity(data: FormData) {
  const { shop, me } = await requireSection("clientes");
  const id = str(data.get("id"));
  const a = await prisma.customerActivity.findFirst({ where: { id, shopId: shop.id } });
  if (!a || (a.staffId !== me.id && !canAccess(me.role, "ajustes"))) return;
  await prisma.customerActivity.delete({ where: { id } });
  revalidatePath(`/clientes/${a.customerId}`);
}

// ── Puntos ───────────────────────────────────────────────────────────

/** Ajuste manual (regalo, corrección o canje fuera de caja). Dueño, encargado o recepción. */
export async function adjustPoints(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("clientes");
  if (me.role === "BARBER") return { error: "Solo recepción o encargados ajustan puntos." };
  const customerId = str(data.get("customerId"));
  const vPts = v.int(data.get("points"), "los puntos", { required: true, min: -100_000, max: 100_000 });
  const vNote = v.text(data.get("note"), "el motivo", { max: 200 });
  const err = v.first(vPts, vNote);
  if (err) return { error: err };
  const points = vPts.value!, note = vNote.value;
  if (points === 0) return { error: "Escribe cuántos puntos (negativo para quitar)." };
  try {
    await prisma.$transaction(async (tx) => {
      const ok = await tx.customer.updateMany({
        where: { id: customerId, shopId: shop.id, ...(points < 0 && { points: { gte: -points } }) },
        data: { points: { increment: points } },
      });
      if (ok.count === 0) throw new Error("saldo");
      const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
      await tx.loyaltyMovement.create({
        data: { shopId: shop.id, customerId, kind: points < 0 ? "REDEEM" : "ADJUST", points, balance: c.points, note },
      });
    });
  } catch {
    return { error: "No tiene puntos suficientes." };
  }
  revalidatePath(`/clientes/${customerId}`);
  return { ok: points > 0 ? `Se sumaron ${points} puntos.` : `Se descontaron ${-points} puntos.` };
}

/** Sellos a mano: reconocer visitas anteriores, regalar o corregir. Al completar la tarjeta se convierte en premio. */
export async function adjustStamps(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("clientes");
  if (me.role === "BARBER") return { error: "Solo recepción o encargados ajustan sellos." };
  const customerId = str(data.get("customerId"));
  const vSt = v.int(data.get("stamps"), "los sellos", { required: true, min: -100, max: 100 });
  const vNote = v.text(data.get("note"), "el motivo", { max: 200 });
  const err = v.first(vSt, vNote);
  if (err) return { error: err };
  const delta = vSt.value!, note = vNote.value;
  if (delta === 0) return { error: "Escribe cuántos sellos (negativo para quitar)." };
  const c = await prisma.customer.findFirst({ where: { id: customerId, shopId: shop.id } });
  if (!c) return { error: "Cliente no encontrado." };
  const req = shop.stampsRequired;
  // Se trabaja con el total (premios × sellos por tarjeta + sellos) para que sumar o quitar cruce tarjetas sin errores
  const total = c.stampRewards * req + c.stamps + delta;
  if (total < 0) return { error: "No tiene tantos sellos para quitar." };
  const stampRewards = Math.floor(total / req), stamps = total % req;
  await prisma.$transaction([
    prisma.customer.update({ where: { id: c.id }, data: { stamps, stampRewards } }),
    prisma.loyaltyMovement.create({
      data: { shopId: shop.id, customerId: c.id, kind: "STAMP", points: delta, balance: stamps, note: note ?? (delta > 0 ? "Sellos agregados a mano" : "Sellos quitados a mano") },
    }),
  ]);
  revalidatePath(`/clientes/${c.id}`);
  return { ok: stampRewards > c.stampRewards ? "¡Completó la tarjeta! Ya tiene su premio." : delta > 0 ? `Se agregaron ${delta} sellos.` : `Se quitaron ${-delta} sellos.` };
}
