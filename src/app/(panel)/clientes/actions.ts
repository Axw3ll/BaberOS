"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import type { ActionResult } from "@/components/action-form";

export async function createCustomer(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("clientes");
  const name = String(data.get("name") ?? "").trim();
  const phone = String(data.get("phone") ?? "").replace(/\D/g, "");
  if (!name) return { error: "Escribe el nombre." };
  if (phone.length < 10) return { error: "El teléfono debe tener 10 dígitos." };
  const exists = await prisma.customer.findUnique({ where: { shopId_phone: { shopId: shop.id, phone } } });
  if (exists) redirect(`/clientes/${exists.id}`);
  const c = await prisma.customer.create({
    data: { shopId: shop.id, name, phone, email: String(data.get("email") ?? "").trim() || null, notes: String(data.get("notes") ?? "").trim() || null },
  });
  revalidatePath("/clientes");
  redirect(`/clientes/${c.id}`);
}

export async function updateCustomer(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("clientes");
  const name = String(data.get("name") ?? "").trim();
  if (!name) return { error: "Escribe el nombre." };
  const id = String(data.get("id"));
  revalidatePath(`/clientes/${id}`);
  await prisma.customer.update({
    where: { id, shopId: shop.id },
    data: { name, email: String(data.get("email") ?? "").trim() || null, notes: String(data.get("notes") ?? "").trim() || null },
  });
  return { ok: "Cambios guardados." };
}
