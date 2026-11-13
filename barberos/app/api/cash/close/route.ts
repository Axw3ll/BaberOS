import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, conflict } from "@/lib/http";
import { dayTotals } from "@/lib/domain/finance";

const Schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), countedCash: z.number().int().min(0), notes: z.string().max(500).optional() });

/** Cerrar caja: el esperado se recalcula en el servidor en el momento del cierre. Un solo cierre por día. */
export const POST = handle(async (req: Request) => {
  const c = await requireCtx("cash.close");
  const d = Schema.parse(await body(req));
  const existing = await prisma.cashClosure.findUnique({ where: { barbershopId_date: { barbershopId: c.shopId, date: d.date } } });
  if (existing) throw conflict("La caja de ese día ya fue cerrada", "ALREADY_CLOSED");
  const t = await dayTotals(c.shop, d.date);
  const closure = await prisma.cashClosure.create({
    data: {
      barbershopId: c.shopId, date: d.date, expectedCash: t.expectedCash, countedCash: d.countedCash, difference: d.countedCash - t.expectedCash,
      totalIncome: t.income, totalExpense: t.expenses, net: t.net, notes: d.notes, memberId: c.memberId,
    },
  });
  return json({ closure }, 201);
});
