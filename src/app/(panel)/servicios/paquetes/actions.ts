"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import * as v from "@/lib/validate";
import type { ActionResult } from "@/components/action-form";

export async function savePackage(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("servicios");
  const id = String(data.get("id") || "");
  const kind = data.get("kind") === "MEMBERSHIP" ? "MEMBERSHIP" : "BUNDLE";
  const name = v.text(data.get("name"), "el nombre", { required: true, max: 60 });
  const price = v.money(data.get("price"), "el precio", { required: true, max: 100_000 });
  const days = v.int(data.get("days"), "la vigencia en días", { required: true, min: 1, max: 730 });
  const uses = kind === "BUNDLE" ? v.int(data.get("uses"), "cuántos servicios incluye", { required: true, min: 1, max: 100 }) : { value: null };
  const err = v.first(name, price, days, uses as v.Check<unknown>);
  if (err) return { error: err };
  const serviceIds = data.getAll("serviceId").map(String);
  const valid = await prisma.service.findMany({ where: { shopId: shop.id, id: { in: serviceIds } }, select: { id: true } });
  if (!valid.length) return { error: "Elige al menos un servicio que cubra." };

  const fields = { name: name.value!, kind, price: price.value!, days: days.value!, uses: uses.value ?? null } as const;
  if (id) {
    const before = await prisma.package.findFirst({ where: { id, shopId: shop.id } });
    if (!before) return { error: "Paquete no encontrado." };
    await prisma.$transaction([
      prisma.package.update({ where: { id }, data: fields }),
      prisma.packageService.deleteMany({ where: { packageId: id } }),
      prisma.packageService.createMany({ data: valid.map((s) => ({ packageId: id, serviceId: s.id })) }),
    ]);
    if (Number(before.price) !== price.value) await audit(shop.id, me.id, "precio.cambio", `Cambió el precio del paquete ${fields.name}: $${Number(before.price)} → $${price.value}`);
  } else {
    await prisma.package.create({ data: { ...fields, shopId: shop.id, services: { create: valid.map((s) => ({ serviceId: s.id })) } } });
  }
  revalidatePath("/servicios/paquetes");
  return { ok: id ? "Paquete guardado. Los que ya se vendieron conservan sus condiciones." : "Paquete creado. Ya aparece en la caja." };
}

export async function togglePackage(data: FormData) {
  const { shop } = await requireSection("servicios");
  const p = await prisma.package.findFirst({ where: { id: String(data.get("id")), shopId: shop.id } });
  if (!p) return;
  await prisma.package.update({ where: { id: p.id }, data: { active: !p.active } });
  revalidatePath("/servicios/paquetes");
}
