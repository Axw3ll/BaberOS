"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import type { ActionResult } from "@/components/action-form";

function read(data: FormData) {
  const name = String(data.get("name") ?? "").trim();
  const minutes = Math.floor(Number(data.get("minutes")));
  const price = Number(String(data.get("price") ?? "").replace(",", "."));
  if (!name) return { error: "Escribe el nombre del servicio." } as const;
  if (!(minutes > 0 && minutes <= 480)) return { error: "La duración debe estar entre 5 y 480 minutos." } as const;
  if (!(price >= 0)) return { error: "Escribe un precio válido." } as const;
  return {
    data: { name, minutes, price, description: String(data.get("description") ?? "").trim() || null, bookableOnline: data.get("bookableOnline") === "on" },
    staffIds: data.getAll("staffId").map(String),
  } as const;
}

export async function createService(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("servicios");
  const r = read(data);
  if ("error" in r) return { error: r.error };
  const valid = await prisma.staff.findMany({ where: { shopId: shop.id, id: { in: r.staffIds } }, select: { id: true } });
  const count = await prisma.service.count({ where: { shopId: shop.id } });
  await prisma.service.create({
    data: { ...r.data, shopId: shop.id, position: count, staff: { create: valid.map((s) => ({ staffId: s.id })) } },
  });
  revalidatePath("/servicios");
  redirect("/servicios");
}

export async function updateService(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("servicios");
  const id = String(data.get("id"));
  const r = read(data);
  if ("error" in r) return { error: r.error };
  const valid = await prisma.staff.findMany({ where: { shopId: shop.id, id: { in: r.staffIds } }, select: { id: true } });
  await prisma.$transaction([
    prisma.service.update({ where: { id, shopId: shop.id }, data: r.data }),
    prisma.staffService.deleteMany({ where: { serviceId: id } }),
    prisma.staffService.createMany({ data: valid.map((s) => ({ staffId: s.id, serviceId: id })) }),
  ]);
  revalidatePath("/servicios");
  revalidatePath(`/servicios/${id}`);
  return { ok: "Cambios guardados." };
}

export async function toggleService(data: FormData) {
  const { shop } = await requireSection("servicios");
  const id = String(data.get("id"));
  const s = await prisma.service.findFirstOrThrow({ where: { id, shopId: shop.id } });
  await prisma.service.update({ where: { id }, data: { active: !s.active } });
  revalidatePath("/servicios");
  redirect("/servicios");
}
