"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { readSchedule } from "@/lib/schedule";
import { slugify } from "@/lib/format";
import { localToUtc } from "@/lib/time";
import type { ActionResult } from "@/components/action-form";

const int = (v: FormDataEntryValue | null, min: number, max: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

export async function saveShop(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("ajustes");
  const name = String(data.get("name") ?? "").trim();
  if (!name) return { error: "Escribe el nombre de la barbería." };
  const slug = slugify(String(data.get("slug") ?? "") || name);
  if (slug !== shop.slug && (await prisma.barbershop.findUnique({ where: { slug } }))) return { error: "Esa dirección ya la usa otra barbería." };
  const tax = Number(data.get("taxRate"));
  await prisma.barbershop.update({
    where: { id: shop.id },
    data: {
      name, slug,
      phone: String(data.get("phone") ?? "").trim() || null,
      address: String(data.get("address") ?? "").trim() || null,
      taxRate: Number.isFinite(tax) && tax >= 0 && tax <= 30 ? tax / 100 : shop.taxRate,
      slotMinutes: [10, 15, 20, 30, 60].includes(Number(data.get("slotMinutes"))) ? Number(data.get("slotMinutes")) : shop.slotMinutes,
      minNoticeMinutes: int(data.get("minNoticeMinutes"), 0, 2880, shop.minNoticeMinutes),
      maxAdvanceDays: int(data.get("maxAdvanceDays"), 1, 180, shop.maxAdvanceDays),
    },
  });
  revalidatePath("/", "layout");
  return { ok: "Ajustes guardados." };
}

export async function saveShopHours(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("ajustes");
  const r = readSchedule(data);
  if ("error" in r) return { error: r.error };
  await prisma.$transaction([
    prisma.shopHours.deleteMany({ where: { shopId: shop.id } }),
    prisma.shopHours.createMany({ data: r.blocks.map((b) => ({ ...b, shopId: shop.id })) }),
  ]);
  revalidatePath("/agenda");
  revalidatePath("/ajustes");
  return { ok: "Horario guardado." };
}

export async function addClosure(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("ajustes");
  const from = String(data.get("from") ?? ""), to = String(data.get("to") ?? "") || from;
  if (!from) return { error: "Elige el día." };
  const startsAt = localToUtc(from, 0, shop.timezone), endsAt = localToUtc(to, 1440, shop.timezone);
  if (endsAt <= startsAt) return { error: "El último día debe ser igual o después del primero." };
  await prisma.closure.create({ data: { shopId: shop.id, startsAt, endsAt, reason: String(data.get("reason") ?? "").trim() || null } });
  revalidatePath("/ajustes");
  return { ok: "Cierre registrado." };
}

export async function removeClosure(data: FormData) {
  const { shop } = await requireSection("ajustes");
  await prisma.closure.deleteMany({ where: { id: String(data.get("id")), shopId: shop.id } });
  revalidatePath("/ajustes");
}

export async function saveCrm(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("ajustes");
  const on = data.get("loyalty") === "on";
  const perPeso = Number(data.get("pointsPerPeso"));
  const value = Number(data.get("pesoPerPoint"));
  if (on && !(perPeso > 0 && perPeso <= 10)) return { error: "Los puntos por peso deben ser entre 0.001 y 10." };
  if (on && !(value > 0 && value <= 100)) return { error: "El valor de cada punto debe ser mayor a 0." };
  await prisma.barbershop.update({
    where: { id: shop.id },
    data: {
      loyaltyPointsPerPeso: on ? perPeso : 0,
      ...(on && { loyaltyPesoPerPoint: value }),
      lostAfterDays: int(data.get("lostAfterDays"), 15, 730, shop.lostAfterDays),
    },
  });
  revalidatePath("/", "layout");
  return { ok: "Ajustes de clientes guardados." };
}
