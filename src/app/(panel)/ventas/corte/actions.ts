"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { openPeriod, periodTotals } from "@/lib/cash";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import * as v from "@/lib/validate";


export async function closeCash(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("ventas");
  if (me.role === "BARBER") return { error: "Solo recepción o encargados hacen el corte." };
  const vCounted = v.money(data.get("counted"), "el efectivo contado", { required: true });
  const vOpening = v.money(data.get("opening"), "el fondo inicial");
  const vWithdrawals = v.money(data.get("withdrawals"), "los retiros");
  const vNotes = v.text(data.get("notes"), "la nota", { max: 500 });
  const err = v.first(vCounted, vOpening, vWithdrawals, vNotes);
  if (err) return { error: err };
  const counted = vCounted.value!, opening = vOpening.value ?? 0, withdrawals = vWithdrawals.value ?? 0;

  const end = new Date();
  const { start } = await openPeriod(shop);
  const t = await periodTotals(shop.id, start, end);
  const expected = Math.round((opening + t.cash - withdrawals) * 100) / 100;
  const c = await prisma.cashClosure.create({
    data: {
      shopId: shop.id, closedById: me.id, periodStart: start, periodEnd: end,
      openingCash: opening, cashSales: t.cash, cardSales: t.card, transferSales: t.transfer, withdrawals,
      expectedCash: expected, countedCash: counted, difference: Math.round((counted - expected) * 100) / 100,
      tickets: t.tickets, notes: String(data.get("notes") ?? "").trim().slice(0, 500) || null,
    },
  });
  revalidatePath("/ventas/corte");
  await audit(shop.id, me.id, "caja.corte",
    `Hizo el corte: esperado $${expected.toFixed(2)}, contado $${counted.toFixed(2)}${counted !== expected ? ` (diferencia $${(counted - expected).toFixed(2)})` : ""}`, { type: "cash", id: c.id });
  redirect(`/ventas/corte?listo=${c.id}`);
}
