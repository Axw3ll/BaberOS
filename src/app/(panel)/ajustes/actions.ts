"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { readSchedule } from "@/lib/schedule";
import { slugify } from "@/lib/format";
import { isDate, localToUtc } from "@/lib/time";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import * as v from "@/lib/validate";

const int = (v: FormDataEntryValue | null, min: number, max: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

export async function saveShop(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("ajustes");
  const vName = v.text(data.get("name"), "el nombre de la barbería", { required: true, max: 80 });
  const vPhone = v.phone(data.get("phone"));
  const vAddress = v.text(data.get("address"), "la dirección", { max: 160 });
  const vTax = v.int(String(data.get("taxRate") ?? "").replace(/\.0+$/, ""), "el IVA (%)", { required: true, min: 0, max: 30 });
  const vNotice = v.int(data.get("minNoticeMinutes"), "la anticipación mínima", { required: true, min: 0, max: 2880 });
  const vAdvance = v.int(data.get("maxAdvanceDays"), "los días para reservar", { required: true, min: 1, max: 180 });
  const err = v.first(vName, vPhone, vAddress, vTax, vNotice, vAdvance);
  if (err) return { error: err };
  const name = vName.value!;
  const slug = slugify(String(data.get("slug") ?? "") || name);
  if (slug !== shop.slug && (await prisma.barbershop.findUnique({ where: { slug } }))) return { error: "Esa dirección ya la usa otra barbería." };
  await prisma.barbershop.update({
    where: { id: shop.id },
    data: {
      name, slug,
      phone: vPhone.value,
      address: vAddress.value,
      taxRate: vTax.value! / 100,
      slotMinutes: [10, 15, 20, 30, 60].includes(Number(data.get("slotMinutes"))) ? Number(data.get("slotMinutes")) : shop.slotMinutes,
      minNoticeMinutes: vNotice.value!,
      maxAdvanceDays: vAdvance.value!,
    },
  });
  revalidatePath("/", "layout");
  await audit(shop.id, me.id, "ajustes.cambio", "Ajustes guardados");
  return { ok: "Ajustes guardados." };
}

export async function saveShopHours(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("ajustes");
  const r = readSchedule(data);
  if ("error" in r) return { error: r.error };
  await prisma.$transaction([
    prisma.shopHours.deleteMany({ where: { shopId: shop.id } }),
    prisma.shopHours.createMany({ data: r.blocks.map((b) => ({ ...b, shopId: shop.id })) }),
  ]);
  revalidatePath("/agenda");
  revalidatePath("/ajustes");
  await audit(shop.id, me.id, "ajustes.cambio", "Horario guardado");
  return { ok: "Horario guardado." };
}

export async function addClosure(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("ajustes");
  const from = String(data.get("from") ?? ""), to = String(data.get("to") ?? "") || from;
  if (!from) return { error: "Elige el día." };
  if (!isDate(from) || !isDate(to)) return { error: "La fecha no es válida." };
  if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) return { error: "Un cierre no puede durar más de un año." };
  const vReason = v.text(data.get("reason"), "el motivo", { max: 120 });
  if (vReason.error) return { error: vReason.error };
  const startsAt = localToUtc(from, 0, shop.timezone), endsAt = localToUtc(to, 1440, shop.timezone);
  if (endsAt <= startsAt) return { error: "El último día debe ser igual o después del primero." };
  await prisma.closure.create({ data: { shopId: shop.id, startsAt, endsAt, reason: vReason.value } });
  revalidatePath("/ajustes");
  await audit(shop.id, me.id, "ajustes.cambio", "Cierre registrado");
  return { ok: "Cierre registrado." };
}

export async function removeClosure(data: FormData) {
  const { shop } = await requireSection("ajustes");
  await prisma.closure.deleteMany({ where: { id: String(data.get("id")), shopId: shop.id } });
  revalidatePath("/ajustes");
}

export async function saveCrm(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("ajustes");
  const mode = String(data.get("loyaltyMode"));
  const lost = v.int(data.get("lostAfterDays"), "los días para cliente perdido", { required: true, min: 15, max: 730 });
  if (lost.error) return { error: lost.error };
  if (!["OFF", "POINTS", "STAMPS"].includes(mode)) return { error: "Elige un programa de lealtad." };
  const num = (k: string) => Number(String(data.get(k) ?? "").replace(/[$,%\s]/g, "") || 0);
  const extra: Record<string, unknown> = {};

  if (mode === "POINTS") {
    const perPeso = num("pointsPerPeso"), value = num("pesoPerPoint");
    if (!(perPeso > 0 && perPeso <= 10)) return { error: "Los puntos por peso deben ser entre 0.001 y 10." };
    if (!(value > 0 && value <= 100)) return { error: "El valor de cada punto debe ser mayor a 0." };
    Object.assign(extra, { loyaltyPointsPerPeso: perPeso, loyaltyPesoPerPoint: value });
  }
  if (mode === "STAMPS") {
    const required = Math.trunc(num("stampsRequired"));
    const reward = String(data.get("stampReward"));
    const value = num("stampRewardValue"), min = num("stampMinAmount");
    if (!(required >= 2 && required <= 50)) return { error: "Los sellos para el premio deben ser entre 2 y 50." };
    if (!["FREE_SERVICE", "PERCENT", "AMOUNT"].includes(reward)) return { error: "Elige el premio." };
    if (reward === "PERCENT" && !(value > 0 && value <= 100)) return { error: "El porcentaje debe ser entre 1 y 100." };
    if (reward === "AMOUNT" && !(value > 0)) return { error: "Escribe cuántos pesos de descuento da el premio." };
    if (value < 0 || min < 0) return { error: "Los montos no pueden ser negativos." };
    Object.assign(extra, {
      stampsRequired: required, stampReward: reward, stampRewardValue: value, stampMinAmount: min,
      autoLoyaltyMsgs: data.get("autoLoyaltyMsgs") === "on",
    });
  }

  await prisma.barbershop.update({
    where: { id: shop.id },
    data: { loyaltyMode: mode as "OFF" | "POINTS" | "STAMPS", ...extra, lostAfterDays: lost.value! },
  });
  revalidatePath("/", "layout");
  await audit(shop.id, me.id, "ajustes.cambio", "Ajustes de clientes guardados");
  return { ok: "Ajustes de clientes guardados." };
}

export async function savePolicies(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("ajustes");
  const barber = v.int(data.get("maxDiscountBarber"), "el descuento máximo del barbero", { required: true, min: 0, max: 100 });
  const reception = v.int(data.get("maxDiscountReception"), "el descuento máximo de recepción", { required: true, min: 0, max: 100 });
  const limit = v.int(data.get("noShowLimit"), "el número de faltas", { required: true, min: 1, max: 20 });
  const queueMax = v.int(data.get("queueMax"), "el máximo de la fila", { required: true, min: 1, max: 100 });
  const err = v.first(barber, reception, limit, queueMax);
  if (err) return { error: err };
  const policy = data.get("noShowPolicy") === "BLOCK" ? "BLOCK" : "WARN";
  await prisma.barbershop.update({
    where: { id: shop.id },
    data: {
      maxDiscountBarber: barber.value!, maxDiscountReception: reception.value!, noShowLimit: limit.value!, noShowPolicy: policy,
      queueEnabled: data.get("queueEnabled") === "on", queueMax: queueMax.value!,
    },
  });
  await audit(shop.id, me.id, "ajustes.cambio", `Reglas: descuento barbero ${barber.value}%, recepción ${reception.value}%, faltas ${limit.value} (${policy === "BLOCK" ? "bloquear" : "avisar"})`);
  revalidatePath("/", "layout");
  return { ok: "Reglas guardadas." };
}

export async function savePayroll(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("ajustes");
  const freq = String(data.get("payoutFrequency"));
  if (!["WEEKLY", "BIWEEKLY", "MONTHLY"].includes(freq)) return { error: "Elige cada cuánto pagas." };
  await prisma.barbershop.update({
    where: { id: shop.id },
    data: { payoutFrequency: freq as "WEEKLY" | "BIWEEKLY" | "MONTHLY", payoutWeekday: int(data.get("payoutWeekday"), 0, 6, shop.payoutWeekday) },
  });
  revalidatePath("/", "layout");
  await audit(shop.id, me.id, "ajustes.cambio", "Calendario de pago guardado");
  return { ok: "Calendario de pago guardado." };
}

export async function saveMessages(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("ajustes");
  const url = String(data.get("googleReviewUrl") ?? "").trim();
  if (url && !/^https:\/\/\S+$/.test(url)) return { error: "El enlace de reseñas debe empezar con https://" };
  const on = (k: string) => data.get(k) === "on";
  await prisma.barbershop.update({
    where: { id: shop.id },
    data: {
      googleReviewUrl: url || null,
      autoReminder24h: on("autoReminder24h"), autoReminder2h: on("autoReminder2h"), autoNoShow: on("autoNoShow"),
      autoReview: on("autoReview"), autoRebook: on("autoRebook"), autoBirthday: on("autoBirthday"),
    },
  });
  revalidatePath("/ajustes");
  revalidatePath("/seguimiento/mensajes");
  await audit(shop.id, me.id, "ajustes.cambio", "Mensajes automáticos guardados");
  return { ok: "Mensajes automáticos guardados." };
}
