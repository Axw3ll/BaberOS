"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isDate, today } from "@/lib/time";
import * as v from "@/lib/validate";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import type { ActionResult } from "@/components/action-form";

export async function addExpense(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("gastos");
  const date = String(data.get("date") ?? "") || today(shop.timezone);
  if (!isDate(date)) return { error: "La fecha no es válida." };
  if (date > today(shop.timezone)) return { error: "No puedes registrar gastos con fecha futura." };
  const category = String(data.get("category") ?? "");
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return { error: "Elige una categoría." };
  const method = String(data.get("method") ?? "CASH");
  if (!["CASH", "CARD", "TRANSFER"].includes(method)) return { error: "Elige cómo se pagó." };
  const amount = v.money(data.get("amount"), "el monto", { required: true, allowZero: false, max: 500_000 });
  const note = v.text(data.get("note"), "la nota", { max: 200 });
  const err = v.first(amount, note);
  if (err) return { error: err };

  const e = await prisma.expense.create({
    data: { shopId: shop.id, createdById: me.id, date: new Date(`${date}T00:00:00Z`), category, amount: amount.value!, method: method as "CASH", note: note.value },
  });
  await audit(shop.id, me.id, "gasto.registro", `Registró un gasto de $${amount.value!.toFixed(2)} en ${category}${note.value ? ` (${note.value})` : ""}`, { type: "expense", id: e.id });
  revalidatePath("/gastos");
  revalidatePath("/ventas/corte");
  return { ok: "Gasto registrado." };
}

export async function deleteExpense(data: FormData) {
  const { shop, me } = await requireSection("gastos");
  const e = await prisma.expense.findFirst({ where: { id: String(data.get("id")), shopId: shop.id } });
  if (!e) return;
  await prisma.expense.delete({ where: { id: e.id } });
  await audit(shop.id, me.id, "gasto.borrado", `Borró un gasto de $${Number(e.amount).toFixed(2)} en ${e.category}`);
  revalidatePath("/gastos");
  revalidatePath("/ventas/corte");
}
