"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { openPeriod, periodTotals } from "@/lib/cash";
import type { ActionResult } from "@/components/action-form";

const amount = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export async function closeCash(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("ventas");
  if (me.role === "BARBER") return { error: "Solo recepción o encargados hacen el corte." };
  const counted = amount(data.get("counted"));
  const opening = amount(data.get("opening")) ?? 0;
  const withdrawals = amount(data.get("withdrawals")) ?? 0;
  if (counted === null || String(data.get("counted") ?? "").trim() === "") return { error: "Escribe cuánto efectivo contaste en caja." };

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
  redirect(`/ventas/corte?listo=${c.id}`);
}
