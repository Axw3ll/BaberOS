import { prisma, type Barbershop } from "../db";
import { addDays, localDate, zonedToUtc } from "../time";

type Methods = { CASH: number; TRANSFER: number; CARD: number };
const zero = (): Methods => ({ CASH: 0, TRANSFER: 0, CARD: 0 });

/** Totales reales para un rango de días locales [from, toExcl). Todo en centavos. */
export async function periodTotals(shop: Barbershop, from: string, toExcl: string) {
  const range = { gte: zonedToUtc(from, "00:00", shop.timezone), lt: zonedToUtc(toExcl, "00:00", shop.timezone) };
  const sid = shop.id;

  const [payments, deposits, sales, expenses, pendingDeps, redeemed, lost, barbers] = await Promise.all([
    prisma.payment.findMany({ where: { barbershopId: sid, createdAt: range }, include: { appointment: { include: { service: true, client: true, barber: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.deposit.findMany({ where: { barbershopId: sid, status: "PAID", paidAt: range } }),
    prisma.productSale.findMany({ where: { barbershopId: sid, createdAt: range }, include: { product: true } }),
    prisma.expense.findMany({ where: { barbershopId: sid, date: { gte: from, lt: toExcl } }, orderBy: { date: "desc" } }),
    prisma.deposit.findMany({ where: { barbershopId: sid, status: "PENDING", appointment: { status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } } } }),
    prisma.loyaltyReward.findMany({ where: { barbershopId: sid, redeemedAt: range } }),
    prisma.appointment.groupBy({ by: ["status"], where: { barbershopId: sid, startAt: range, status: { in: ["NO_SHOW", "CANCELLED"] } }, _count: true }),
    prisma.barber.findMany({ where: { barbershopId: sid } }),
  ]);

  const byMethod = zero();
  let services = 0, depositsIn = 0, products = 0, productsCost = 0;
  for (const p of payments) { services += p.amount; byMethod[p.method] += p.amount; }
  for (const d of deposits) { depositsIn += d.amount; if (d.method) byMethod[d.method] += d.amount; }
  for (const s of sales) { products += s.total; productsCost += s.unitCost * s.qty; byMethod[s.method] += s.total; }
  const income = services + depositsIn + products;
  const expenseTotal = expenses.reduce((a, e) => a + e.amount, 0);

  // Comisiones: % del barbero sobre lo que generó el servicio (precio - descuento de lealtad), al cobrarse
  const perBarber = new Map<string, { barberId: string; name: string; pct: number; revenue: number; commission: number; count: number }>();
  const perService = new Map<string, { name: string; count: number; revenue: number }>();
  for (const p of payments) {
    const a = p.appointment;
    const b = barbers.find((x) => x.id === a.barberId);
    const gen = p.amount + p.depositApplied;
    const cur = perBarber.get(a.barberId) ?? { barberId: a.barberId, name: b?.name ?? "—", pct: b?.commissionPct ?? 0, revenue: 0, commission: 0, count: 0 };
    cur.revenue += gen; cur.count++; cur.commission = Math.round((cur.revenue * cur.pct) / 100);
    perBarber.set(a.barberId, cur);
    const sv = perService.get(a.serviceId) ?? { name: a.service.name, count: 0, revenue: 0 };
    sv.count++; sv.revenue += gen; perService.set(a.serviceId, sv);
  }
  const commissions = [...perBarber.values()].sort((a, b) => b.revenue - a.revenue);
  const topServices = [...perService.values()].sort((a, b) => b.count - a.count);

  const cashSales = sales.filter((s) => s.method === "CASH");

  // Ingresos por día local (para la gráfica semanal)
  const byDay: Record<string, number> = {};
  for (let d = from; d < toExcl; d = addDays(d, 1)) byDay[d] = 0;
  const day = (t: Date) => localDate(t, shop.timezone);
  for (const p of payments) byDay[day(p.createdAt)] = (byDay[day(p.createdAt)] ?? 0) + p.amount;
  for (const d of deposits) if (d.paidAt) byDay[day(d.paidAt)] = (byDay[day(d.paidAt)] ?? 0) + d.amount;
  for (const s of sales) byDay[day(s.createdAt)] = (byDay[day(s.createdAt)] ?? 0) + s.total;

  const methodCount = { CASH: 0, TRANSFER: 0, CARD: 0 } as Methods;
  for (const p of payments) methodCount[p.method]++;
  for (const d of deposits) if (d.method) methodCount[d.method]++;
  for (const s of sales) methodCount[s.method]++;

  const expenseByCategory: Record<string, number> = {};
  for (const e of expenses) expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + e.amount;

  const chargedCount = payments.length;
  const ticketAvg = chargedCount ? Math.round(payments.reduce((a, p) => a + p.amount + p.depositApplied, 0) / chargedCount) : 0;
  return {
    from, toExcl,
    income, services, deposits: depositsIn, products, productsCost, byMethod,
    expenses: expenseTotal, expenseList: expenses, net: income - expenseTotal,
    commissions, commissionTotal: commissions.reduce((a, c) => a + c.commission, 0),
    bestBarber: commissions[0] ?? null, topService: topServices[0] ?? null, topServices,
    expectedCash: byMethod.CASH,
    pendingDeposits: { count: pendingDeps.length, amount: pendingDeps.reduce((a, d) => a + d.amount, 0) },
    depositsReceivedCount: deposits.length,
    loyalty: { redeemed: redeemed.length, discount: redeemed.reduce((a, r) => a + (r.discountAmount ?? 0), 0) },
    lost: { noShow: lost.find((l) => l.status === "NO_SHOW")?._count ?? 0, cancelled: lost.find((l) => l.status === "CANCELLED")?._count ?? 0 },
    productUnits: sales.reduce((a, s) => a + s.qty, 0),
    cashProductSales: cashSales.length,
    byDay, methodCount, expenseByCategory, chargedCount, ticketAvg,
    recentPayments: payments.slice(0, 8).map((p) => ({ id: p.id, client: p.appointment.client.name, service: p.appointment.service.name, barber: p.appointment.barber.name, amount: p.amount + p.depositApplied, method: p.method, discount: p.loyaltyDiscount, at: p.createdAt })),
    salesList: sales.map((s) => ({ id: s.id, product: s.product.name, qty: s.qty, total: s.total, method: s.method, at: s.createdAt })),
  };
}

export const dayTotals = (shop: Barbershop, date: string) => periodTotals(shop, date, addDays(date, 1));
