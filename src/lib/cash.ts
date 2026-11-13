import "server-only";
import { prisma } from "./prisma";
import { localToUtc, today } from "./time";

/** Desde cuándo va el turno: el último corte o, si no hay, el inicio del día. */
export async function openPeriod(shop: { id: string; timezone: string }) {
  const last = await prisma.cashClosure.findFirst({ where: { shopId: shop.id }, orderBy: { periodEnd: "desc" } });
  const start = last?.periodEnd ?? localToUtc(today(shop.timezone), 0, shop.timezone);
  return { start, last };
}

/** Totales cobrados en el periodo, por forma de pago (ventas canceladas no cuentan). */
export async function periodTotals(shopId: string, start: Date, end: Date) {
  const [byMethod, tickets] = await Promise.all([
    prisma.payment.groupBy({
      by: ["method"], _sum: { amount: true },
      where: { sale: { shopId, status: "PAID", createdAt: { gte: start, lt: end } } },
    }),
    prisma.sale.count({ where: { shopId, status: "PAID", createdAt: { gte: start, lt: end } } }),
  ]);
  const get = (m: "CASH" | "CARD" | "TRANSFER") => Number(byMethod.find((x) => x.method === m)?._sum.amount ?? 0);
  return { cash: get("CASH"), card: get("CARD"), transfer: get("TRANSFER"), tickets };
}

/** Comisiones aún no pagadas, por persona. */
export async function unpaidCommissions(shopId: string, staffId?: string, cutoff: Date = new Date(8.64e15)) {
  return prisma.$queryRaw<{ staffId: string; name: string; items: number; services: string; products: string; commission: string; since: Date; due: string; dueItems: number; running: string }[]>`
    SELECT st.id AS "staffId", st.name, count(*)::int AS items,
           COALESCE(sum(i.commission) FILTER (WHERE i.kind = 'SERVICE'), 0)::text AS services,
           COALESCE(sum(i.commission) FILTER (WHERE i.kind = 'PRODUCT'), 0)::text AS products,
           sum(i.commission)::text AS commission, min(s."createdAt") AS since,
           COALESCE(sum(i.commission) FILTER (WHERE s."createdAt" < ${cutoff}), 0)::text AS due,
           count(*) FILTER (WHERE s."createdAt" < ${cutoff})::int AS "dueItems",
           COALESCE(sum(i.commission) FILTER (WHERE s."createdAt" >= ${cutoff}), 0)::text AS running
      FROM sale_items i JOIN sales s ON s.id = i."saleId" JOIN staff st ON st.id = i."staffId"
     WHERE s."shopId" = ${shopId}::uuid AND s.status = 'PAID' AND i."payoutId" IS NULL AND i.commission > 0
       AND (${staffId ?? null}::uuid IS NULL OR st.id = ${staffId ?? null}::uuid)
     GROUP BY st.id, st.name ORDER BY sum(i.commission) DESC`;
}
