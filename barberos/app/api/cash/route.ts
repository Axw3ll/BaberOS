import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { handle, json, bad } from "@/lib/http";
import { dayTotals } from "@/lib/domain/finance";
import { isValidDate, todayLocal } from "@/lib/time";

/** Corte del día. Solo dueño/admin (incluye gastos y neto). */
export const GET = handle(async (req: Request) => {
  const c = await requireCtx("cash.view");
  const date = new URL(req.url).searchParams.get("date") ?? todayLocal(c.shop.timezone);
  if (!isValidDate(date)) throw bad("Fecha inválida");
  const [totals, closure] = await Promise.all([
    dayTotals(c.shop, date),
    prisma.cashClosure.findUnique({ where: { barbershopId_date: { barbershopId: c.shopId, date } } }),
  ]);
  return json({ date, totals, closure });
});
