import "server-only";
import { prisma } from "./prisma";

/**
 * Categorías de gasto. Las compras de producto para vender NO van aquí: se registran como entrada en Productos
 * y cuentan como "costo de lo vendido" al venderse (si se registraran aquí también, se contarían dos veces).
 * Las comisiones tampoco: ya se restan solas.
 */
export const EXPENSE_CATEGORIES = [
  "Renta", "Luz, agua y gas", "Internet y teléfono", "Insumos y material", "Sueldos y pagos fijos",
  "Publicidad", "Mantenimiento y equipo", "Impuestos y comisiones bancarias", "Otros",
] as const;

/** Utilidad de un periodo: ventas (sin propina) − costo de productos vendidos − comisiones − gastos. */
export async function profitFor(shopId: string, from: Date, to: Date, fromDate: string, toDate: string) {
  const [[sales], [cogs], [expenses], byCategory] = await Promise.all([
    prisma.$queryRaw<{ revenue: string | null; tips: string | null; commissions: string | null; tickets: number }[]>`
      SELECT sum(s.total - s.tip)::text AS revenue, sum(s.tip)::text AS tips,
             (SELECT sum(i.commission) FROM sale_items i JOIN sales x ON x.id = i."saleId"
               WHERE x."shopId" = ${shopId}::uuid AND x.status = 'PAID' AND x."createdAt" >= ${from} AND x."createdAt" < ${to})::text AS commissions,
             count(*)::int AS tickets
        FROM sales s WHERE s."shopId" = ${shopId}::uuid AND s.status = 'PAID' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}`,
    // Costo con el costo actual de cada producto (los productos sin costo capturado cuentan como 0)
    prisma.$queryRaw<{ cost: string | null; missing: number }[]>`
      SELECT sum(i.quantity * COALESCE(p.cost, 0))::text AS cost, count(*) FILTER (WHERE p.cost IS NULL)::int AS missing
        FROM sale_items i JOIN sales s ON s.id = i."saleId" LEFT JOIN products p ON p.id = i."productId"
       WHERE s."shopId" = ${shopId}::uuid AND s.status = 'PAID' AND i.kind = 'PRODUCT' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}`,
    prisma.$queryRaw<{ total: string | null }[]>`
      SELECT sum(amount)::text AS total FROM expenses
       WHERE "shopId" = ${shopId}::uuid AND date >= ${fromDate}::date AND date <= ${toDate}::date`,
    prisma.$queryRaw<{ category: string; total: string }[]>`
      SELECT category, sum(amount)::text AS total FROM expenses
       WHERE "shopId" = ${shopId}::uuid AND date >= ${fromDate}::date AND date <= ${toDate}::date
       GROUP BY category ORDER BY sum(amount) DESC`,
  ]);
  const n = (x: string | null | undefined) => Number(x ?? 0);
  const revenue = n(sales.revenue), cost = n(cogs.cost), commissions = n(sales.commissions), spent = n(expenses.total);
  const profit = revenue - cost - commissions - spent;
  return {
    revenue, tips: n(sales.tips), tickets: sales.tickets, cost, missingCost: cogs.missing, commissions, expenses: spent, profit,
    margin: revenue > 0 ? profit / revenue : null,
    byCategory: byCategory.map((c) => ({ category: c.category, total: n(c.total) })),
  };
}
