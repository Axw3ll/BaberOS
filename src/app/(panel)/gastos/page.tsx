import Link from "next/link";
import { ChevronLeft, ChevronRight, HandCoins, Package, Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { EXPENSE_CATEGORIES, profitFor } from "@/lib/expenses";
import { addDays, dateLabel, localToUtc, today } from "@/lib/time";
import { money, pct } from "@/lib/format";
import { Bar, Empty, Field, Figure, Figures, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { addExpense, deleteExpense } from "./actions";

export const metadata = { title: "Gastos y utilidad" };
const METHOD = { CASH: "Efectivo de caja", CARD: "Tarjeta", TRANSFER: "Transferencia" } as const;

export default async function GastosPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { shop } = await requireSection("gastos");
  const tz = shop.timezone, day = today(tz);
  const sp = await searchParams;
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : day.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const last = addDays(next, -1);
  const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const nextMonth = next.slice(0, 7);
  const isCurrent = month === day.slice(0, 7);

  const [p, list] = await Promise.all([
    profitFor(shop.id, localToUtc(first, 0, tz), localToUtc(next, 0, tz), first, last),
    prisma.expense.findMany({
      where: { shopId: shop.id, date: { gte: new Date(`${first}T00:00:00Z`), lte: new Date(`${last}T00:00:00Z`) } },
      include: { createdBy: { select: { name: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const maxCat = Math.max(0, ...p.byCategory.map((c) => c.total));
  const title = dateLabel(first, { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Gastos y utilidad" subtitle={`Cuánto entró, cuánto salió y cuánto ganaste en ${title.toLowerCase()}.`}
        actions={
          <nav aria-label="Mes" className="flex items-center rounded-lg border border-line bg-surface">
            <Link href={`/gastos?m=${prevMonth}`} className="px-2.5 py-2 text-muted hover:text-fg" aria-label="Mes anterior"><ChevronLeft className="size-4" /></Link>
            <span className="border-x border-line px-3 py-1.5 text-sm font-medium">{title}</span>
            {isCurrent ? <span className="px-2.5 py-2 text-faint"><ChevronRight className="size-4" /></span>
              : <Link href={`/gastos?m=${nextMonth}`} className="px-2.5 py-2 text-muted hover:text-fg" aria-label="Mes siguiente"><ChevronRight className="size-4" /></Link>}
          </nav>
        } />

      <Figures>
        <Figure icon={Receipt} value={money(p.revenue, true)} label="Ventas (sin propinas)" />
        <Figure icon={Package} value={money(p.cost, true)} label="Costo de productos vendidos" />
        <Figure icon={HandCoins} value={money(p.commissions, true)} label="Comisiones" />
        <Figure icon={Wallet} tone="warning" value={money(p.expenses, true)} label="Gastos" />
        <Figure icon={p.profit >= 0 ? TrendingUp : TrendingDown} tone={p.profit >= 0 ? "success" : "danger"}
          value={money(p.profit, true)} label={`Utilidad${p.margin !== null ? ` (${pct(p.margin)} de lo vendido)` : ""}`} />
      </Figures>
      {p.missingCost > 0 && (
        <p className="-mt-4 mb-6 text-sm text-warning">
          {p.missingCost} {p.missingCost === 1 ? "venta de producto no tiene" : "ventas de producto no tienen"} costo capturado y cuentan como $0.{" "}
          <Link href="/productos" className="underline">Captura el costo en Productos</Link> para una utilidad exacta.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section>
            <SectionTitle aside={`${list.length} ${list.length === 1 ? "gasto" : "gastos"}`}>Gastos del mes</SectionTitle>
            {list.length === 0 ? <Empty title="Sin gastos en este mes">Registra la renta, la luz, los insumos… para saber tu utilidad real.</Empty> : (
              <ul className="divide-y divide-line-soft">
                {list.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <span className="w-16 shrink-0 text-sm text-muted tnum">{dateLabel(e.date.toISOString().slice(0, 10), { day: "numeric", month: "short" })}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{e.category}</span>
                      <span className="block truncate text-sm text-muted">{METHOD[e.method]}{e.note && ` · ${e.note}`}{e.createdBy && ` · ${e.createdBy.name}`}</span>
                    </span>
                    <span className="font-medium tnum">{money(e.amount)}</span>
                    <form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><button className="btn-ghost text-xs text-faint hover:text-danger" aria-label="Borrar gasto">Borrar</button></form>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {p.byCategory.length > 0 && (
            <section>
              <SectionTitle>Por categoría</SectionTitle>
              <ul className="space-y-3">
                {p.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className="mb-1 flex justify-between text-sm"><span>{c.category}</span><span className="text-muted tnum">{money(c.total, true)}</span></div>
                    <Bar value={c.total} max={maxCat} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section>
            <SectionTitle>Registrar gasto</SectionTitle>
            <ActionForm action={addExpense} resetOnOk className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha"><input type="date" name="date" defaultValue={day} max={day} className="field" /></Field>
                <Field label="Monto"><input name="amount" inputMode="decimal" required placeholder="0.00" className="field tnum" /></Field>
              </div>
              <Field label="Categoría">
                <select name="category" required className="field" defaultValue="">
                  <option value="" disabled>Elige…</option>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Cómo se pagó" hint="“Efectivo de caja” se descuenta solo en el corte de caja">
                <select name="method" className="field" defaultValue="CASH">
                  {Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label="Nota"><input name="note" maxLength={200} className="field" placeholder="Ej. recibo de luz de octubre" /></Field>
              <Submit className="btn-primary w-full">Registrar gasto</Submit>
            </ActionForm>
            <p className="mt-4 text-xs text-muted">
              Las compras de producto para vender regístralas como entrada en <Link href="/productos" className="link">Productos</Link>: cuentan al venderse.
              Las comisiones ya se restan solas.
            </p>
          </section>
          <section>
            <SectionTitle>Cómo se calcula</SectionTitle>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Ventas sin propinas</dt><dd className="tnum">{money(p.revenue)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">− Costo de productos</dt><dd className="tnum">{money(p.cost)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">− Comisiones</dt><dd className="tnum">{money(p.commissions)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">− Gastos</dt><dd className="tnum">{money(p.expenses)}</dd></div>
              <div className="flex justify-between border-t border-line-soft pt-1.5 font-semibold"><dt>= Utilidad</dt><dd className={`tnum ${p.profit < 0 ? "text-danger" : "text-success"}`}>{money(p.profit)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">Las propinas ({money(p.tips)}) son de los barberos y no cuentan como venta.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
