"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import type { ActionResult } from "@/components/action-form";

const num = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Number(String(v).replace(",", ".")));
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

function readProduct(data: FormData) {
  const price = num(data.get("price"));
  const name = text(data.get("name"));
  if (!name) return { error: "Escribe el nombre del producto." } as const;
  if (price === null || Number.isNaN(price) || price < 0) return { error: "Escribe un precio válido." } as const;
  const cost = num(data.get("cost"));
  return {
    data: {
      name, price, cost: cost !== null && !Number.isNaN(cost) ? cost : null,
      brand: text(data.get("brand")), category: text(data.get("category")), sku: text(data.get("sku")),
      minStock: Math.max(0, Math.floor(num(data.get("minStock")) ?? 3)),
    },
  } as const;
}

export async function createProduct(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("productos");
  const r = readProduct(data);
  if ("error" in r) return { error: r.error };
  const stock = Math.max(0, Math.floor(num(data.get("stock")) ?? 0));
  let id: string;
  try {
    const p = await prisma.product.create({
      data: {
        ...r.data, shopId: shop.id, stock,
        ...(stock > 0 && { moves: { create: { shopId: shop.id, type: "PURCHASE", quantity: stock, stockAfter: stock, unitCost: r.data.cost, note: "Inventario inicial" } } }),
      },
    });
    id = p.id;
  } catch (e) {
    if (String(e).includes("Unique constraint")) return { error: "Ya hay un producto con ese código." };
    throw e;
  }
  revalidatePath("/productos");
  redirect(`/productos/${id}`);
}

export async function updateProduct(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("productos");
  const r = readProduct(data);
  if ("error" in r) return { error: r.error };
  const id = String(data.get("id"));
  await prisma.product.update({ where: { id, shopId: shop.id }, data: r.data });
  revalidatePath("/productos");
  revalidatePath(`/productos/${id}`);
  return { ok: "Cambios guardados." };
}

export async function moveStock(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("productos");
  const id = String(data.get("id"));
  const type = String(data.get("type"));
  const qty = Math.floor(num(data.get("quantity")) ?? 0);
  if (!qty) return { error: "Escribe una cantidad." };

  try {
    await prisma.$transaction(async (tx) => {
      const p = await tx.product.findFirstOrThrow({ where: { id, shopId: shop.id } });
      let delta: number;
      if (type === "PURCHASE") delta = Math.abs(qty);
      else if (type === "INTERNAL_USE") delta = -Math.abs(qty);
      else if (type === "COUNT") delta = qty - p.stock; // conteo físico: qty es la existencia real
      else throw new Error("tipo");
      if (p.stock + delta < 0) throw new RangeError(`Solo hay ${p.stock} en existencia.`);
      const updated = await tx.product.update({ where: { id }, data: { stock: { increment: delta } } });
      const cost = num(data.get("unitCost"));
      await tx.stockMovement.create({
        data: {
          shopId: shop.id, productId: id, type: type === "COUNT" ? "ADJUSTMENT" : (type as "PURCHASE" | "INTERNAL_USE"),
          quantity: delta, stockAfter: updated.stock, unitCost: type === "PURCHASE" ? cost : null, note: text(data.get("note")),
        },
      });
      if (type === "PURCHASE" && cost !== null && !Number.isNaN(cost)) await tx.product.update({ where: { id }, data: { cost } });
    });
  } catch (e) {
    if (e instanceof RangeError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/productos/${id}`);
  return { ok: "Inventario actualizado." };
}

export async function toggleProduct(data: FormData) {
  const { shop } = await requireSection("productos");
  const id = String(data.get("id"));
  const p = await prisma.product.findFirstOrThrow({ where: { id, shopId: shop.id } });
  await prisma.product.update({ where: { id }, data: { active: !p.active } });
  revalidatePath(`/productos/${id}`);
  revalidatePath("/productos");
}
