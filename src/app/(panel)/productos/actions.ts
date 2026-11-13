"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import type { ActionResult } from "@/components/action-form";
import * as v from "@/lib/validate";


function readProduct(data: FormData) {
  const name = v.text(data.get("name"), "el nombre del producto", { required: true, max: 80 });
  const price = v.money(data.get("price"), "el precio", { required: true, max: 100_000 });
  const cost = v.money(data.get("cost"), "el costo", { max: 100_000 });
  const minStock = v.int(data.get("minStock"), "el mínimo para avisar", { min: 0, max: 10_000 });
  const brand = v.text(data.get("brand"), "la marca", { max: 60 });
  const category = v.text(data.get("category"), "la categoría", { max: 40 });
  const sku = v.text(data.get("sku"), "el código", { max: 40 });
  const error = v.first(name, price, cost, minStock, brand, category, sku);
  if (error) return { error } as const;
  if (cost.value !== null && cost.value! > price.value!) {
    return { error: "El costo es mayor al precio: lo venderías con pérdida. Revisa los montos." } as const;
  }
  return {
    data: {
      name: name.value!, price: price.value!, cost: cost.value,
      brand: brand.value, category: category.value, sku: sku.value,
      minStock: minStock.value ?? 3,
    },
  } as const;
}

export async function createProduct(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop } = await requireSection("productos");
  const r = readProduct(data);
  if ("error" in r) return { error: r.error };
  const st = v.int(data.get("stock"), "la existencia inicial", { min: 0, max: 100_000 });
  if (st.error) return { error: st.error };
  const stock = st.value ?? 0;
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
  // Conteo físico: la existencia real puede ser 0; entradas y uso interno: al menos 1
  const q = v.int(data.get("quantity"), type === "COUNT" ? "la existencia contada" : "la cantidad", { required: true, min: type === "COUNT" ? 0 : 1, max: 100_000 });
  if (q.error) return { error: q.error };
  const qty = q.value!;
  const costCheck = v.money(data.get("unitCost"), "el costo unitario", { max: 100_000 });
  if (costCheck.error) return { error: costCheck.error };
  const noteCheck = v.text(data.get("note"), "la nota", { max: 200 });
  if (noteCheck.error) return { error: noteCheck.error };

  try {
    await prisma.$transaction(async (tx) => {
      const p = await tx.product.findFirstOrThrow({ where: { id, shopId: shop.id } });
      let delta: number;
      if (type === "PURCHASE") delta = Math.abs(qty);
      else if (type === "INTERNAL_USE") delta = -Math.abs(qty);
      else if (type === "COUNT") delta = qty - p.stock; // conteo físico: qty es la existencia real
      else throw new Error("tipo");
      if (p.stock + delta < 0) throw new RangeError(`Solo hay ${p.stock} en existencia.`);
      if (delta === 0) throw new RangeError("La existencia contada es igual a la registrada: no hay nada que ajustar.");
      const updated = await tx.product.update({ where: { id }, data: { stock: { increment: delta } } });
      const cost = costCheck.value;
      await tx.stockMovement.create({
        data: {
          shopId: shop.id, productId: id, type: type === "COUNT" ? "ADJUSTMENT" : (type as "PURCHASE" | "INTERNAL_USE"),
          quantity: delta, stockAfter: updated.stock, unitCost: type === "PURCHASE" ? cost : null, note: noteCheck.value,
        },
      });
      if (type === "PURCHASE" && cost !== null) await tx.product.update({ where: { id }, data: { cost } });
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
