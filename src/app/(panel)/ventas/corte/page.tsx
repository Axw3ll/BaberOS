import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, CreditCard, Landmark, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { openPeriod, periodTotals } from "@/lib/cash";
import { dateTimeLabel } from "@/lib/time";
import { money } from "@/lib/format";
import { Field, Figure, Figures, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { CashCount } from "./count";
import { closeCash } from "./actions";

export const metadata = { title: "Corte de caja" };

export default async function CortePage({ searchParams }: { searchParams: Promise<{ listo?: string }> }) {
  const { shop, me } = await requireSection("ventas");
  if (me.role === "BARBER") redirect("/ventas");
  const { listo } = await searchParams;
  const tz = shop.timezone;
  const { start, last } = await openPeriod(shop);
  const [t, cashExpenses, history] = await Promise.all([
    periodTotals(shop.id, start, new Date()),
    prisma.expense.aggregate({ where: { shopId: shop.id, method: "CASH", createdAt: { gte: start } }, _sum: { amount: true } }),
    prisma.cashClosure.findMany({ where: { shopId: shop.id }, include: { closedBy: true }, orderBy: { periodEnd: "desc" }, take: 20 }),
  ]);
  const done = listo ? history.find((h) => h.id === listo) : null;

  return (
    <>
      <PageHeader back={{ href: "/ventas", label: "Ventas" }} title="Corte de caja"
        subtitle={`Desde ${last ? "el último corte" : "el inicio del día"}: ${dateTimeLabel(start, tz)}`} />

      {done && (
        <div className={`mb-6 rounded-2xl p-4 ${Number(done.difference) === 0 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`} role="status">
          <p className="font-semibold">Corte guardado.</p>
          <p className="text-sm">
            {Number(done.difference) === 0 ? "La caja cuadra exacto." : Number(done.difference) > 0 ? `Sobran ${money(done.difference)} en caja.` : `Faltan ${money(-Number(done.difference))} en caja.`}
          </p>
        </div>
      )}

      <Figures>
        <Figure icon={Banknote} tone="success" value={money(t.cash)} label="Efectivo" />
        <Figure icon={CreditCard} value={money(t.card)} label="Tarjeta" />
        <Figure icon={Landmark} value={money(t.transfer)} label="Transferencia" />
        <Figure icon={Receipt} value={t.tickets} label="Tickets" />
      </Figures>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section>
          <SectionTitle>Cerrar turno</SectionTitle>
          <ActionForm action={closeCash}>
            <CashCount cashSales={t.cash} cashExpenses={Number(cashExpenses._sum.amount ?? 0)} />
            <Field label="Nota" className="mt-4"><input name="notes" className="field" placeholder="Opcional: quién recibió el dinero, pagos a proveedor…" /></Field>
            <div className="mt-6"><Submit pending="Guardando…">Hacer corte</Submit></div>
          </ActionForm>
        </section>

        <section>
          <SectionTitle>Cortes anteriores</SectionTitle>
          {history.length === 0 ? <p className="text-sm text-muted">Aún no hay cortes.</p> : (
            <ul className="divide-y divide-line-soft text-sm">
              {history.map((h) => {
                const d = Number(h.difference);
                return (
                  <li key={h.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span>
                      <span className="block font-medium">{dateTimeLabel(h.periodEnd, tz)}</span>
                      <span className="block text-muted">{h.tickets} tickets · efectivo {money(h.cashSales, true)}{h.closedBy && ` · ${h.closedBy.name}`}</span>
                    </span>
                    <span className={`shrink-0 font-medium tnum ${d === 0 ? "text-success" : d > 0 ? "text-warning" : "text-danger"}`}>
                      {d === 0 ? "Cuadra" : `${d > 0 ? "+" : "−"}${money(Math.abs(d))}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/ventas/comisiones" className="link mt-4 inline-block text-sm">Pagar comisiones</Link>
        </section>
      </div>
    </>
  );
}
