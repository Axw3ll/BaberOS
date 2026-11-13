import Link from "next/link";
import { CalendarClock, HandCoins, TrendingUp } from "lucide-react";
import { FREQUENCY_LABEL, payrollInfo, WEEKDAYS } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection } from "@/lib/auth";
import { unpaidCommissions } from "@/lib/cash";
import { dateLabel, dateTimeLabel, toLocalDate } from "@/lib/time";
import { initials, money } from "@/lib/format";
import { Empty, Figure, Figures, PageHeader, SectionTitle } from "@/components/ui";
import { payCommissions } from "./actions";

export const metadata = { title: "Comisiones" };

export default async function ComisionesPage() {
  const { shop, me } = await requireSection("ventas");
  const admin = canAccess(me.role, "ajustes");
  const onlyMe = me.role === "BARBER" ? me.id : undefined;
  const tz = shop.timezone;
  const pay = payrollInfo(shop);
  const [pending, history] = await Promise.all([
    unpaidCommissions(shop.id, onlyMe, pay.cutoff),
    prisma.commissionPayout.findMany({
      where: { shopId: shop.id, ...(onlyMe && { staffId: onlyMe }) },
      include: { staff: true, paidBy: true }, orderBy: { createdAt: "desc" }, take: 30,
    }),
  ]);
  const due = pending.reduce((a, p) => a + Number(p.due), 0);
  const running = pending.reduce((a, p) => a + Number(p.running), 0);
  const overdue = due > 0 && !pay.isPayday;

  return (
    <>
      <PageHeader back={{ href: "/ventas", label: "Ventas" }} title="Comisiones"
        subtitle={`Se pagan ${FREQUENCY_LABEL[shop.payoutFrequency].toLowerCase()}${shop.payoutFrequency === "WEEKLY" ? ` los ${WEEKDAYS[shop.payoutWeekday].toLowerCase().replace(/o$/, "os")}` : ""}.`}
        actions={admin && <Link href="/ajustes#comisiones" className="btn-ghost">Cambiar calendario</Link>} />

      {pay.isPayday && due > 0 && (
        <p className="mb-6 flex items-center gap-2 rounded-xl bg-warning/10 px-4 py-3 font-medium text-warning">
          <CalendarClock className="size-5" />Hoy es día de pago: {money(due)} del periodo {pay.periodLabel}.
        </p>
      )}
      {overdue && (
        <p className="mb-6 flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-3 font-medium text-danger">
          <CalendarClock className="size-5" />Hay {money(due)} de periodos anteriores sin pagar.
        </p>
      )}

      <Figures>
        <Figure icon={HandCoins} tone={due > 0 ? "warning" : "success"} value={money(due)} label={onlyMe ? "Te deben ya" : pay.isPayday ? "A pagar hoy" : "Atrasado"} />
        <Figure icon={CalendarClock} value={pay.paydayLabel} label={`Próximo pago (${pay.periodLabel})`} />
        <Figure icon={TrendingUp} value={money(running)} label={pay.isPayday ? "Ya cuenta para el siguiente" : onlyMe ? "Llevas en este periodo" : "Se junta para ese día"} />
      </Figures>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section>
          <SectionTitle>Por persona</SectionTitle>
          {pending.length === 0 ? <Empty title="Todo pagado">Las comisiones de cada venta aparecerán aquí hasta que las marques como pagadas.</Empty> : (
            <ul className="divide-y divide-line-soft">
              {pending.map((p) => (
                <li key={p.staffId} className="flex flex-wrap items-center gap-4 py-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{initials(p.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-sm text-muted">
                      Servicios {money(p.services)} · productos {money(p.products)} · desde el {dateLabel(toLocalDate(p.since, tz), { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`block font-display text-xl tnum ${Number(p.due) > 0 ? "" : "text-muted"}`}>{money(p.due)}</span>
                    <span className="block text-xs text-muted">{Number(p.running) > 0 ? `+ ${money(p.running)} en curso` : "a pagar"}</span>
                  </span>
                  {admin && (Number(p.due) > 0 || Number(p.running) > 0) && (
                    <form action={payCommissions} className="flex w-full flex-wrap justify-end gap-2 sm:pl-14">
                      <input type="hidden" name="staffId" value={p.staffId} />
                      <input name="note" className="field w-36 py-1.5 text-sm" placeholder="Nota (opcional)" aria-label="Nota del pago" />
                      {Number(p.due) > 0 && <button name="scope" value="periodo" className="btn-primary">Pagar {money(p.due, true)}</button>}
                      {Number(p.running) > 0 && (
                        <button name="scope" value="todo" className={Number(p.due) > 0 ? "btn-ghost text-sm" : "btn-quiet"}>
                          {Number(p.due) > 0 ? `Todo (${money(Number(p.commission), true)})` : `Adelantar ${money(p.running, true)}`}
                        </button>
                      )}
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Pagos hechos</SectionTitle>
          {history.length === 0 ? <p className="text-sm text-muted">Aún no hay pagos registrados.</p> : (
            <ul className="divide-y divide-line-soft text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span>
                    <span className="block font-medium">{h.staff.name}</span>
                    <span className="block text-muted">{dateTimeLabel(h.createdAt, tz)} · {h.items} ventas{h.paidBy && ` · pagó ${h.paidBy.name}`}{h.note && ` · ${h.note}`}</span>
                  </span>
                  <span className="shrink-0 font-medium tnum">{money(h.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
