import { HandCoins } from "lucide-react";
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
  const [pending, history] = await Promise.all([
    unpaidCommissions(shop.id, onlyMe),
    prisma.commissionPayout.findMany({
      where: { shopId: shop.id, ...(onlyMe && { staffId: onlyMe }) },
      include: { staff: true, paidBy: true }, orderBy: { createdAt: "desc" }, take: 30,
    }),
  ]);
  const total = pending.reduce((a, p) => a + Number(p.commission), 0);

  return (
    <>
      <PageHeader back={{ href: "/ventas", label: "Ventas" }} title="Comisiones"
        subtitle={admin ? "Lo que se le debe a cada quien desde su último pago." : "Tu comisión pendiente y tus pagos."} />

      <Figures>
        <Figure icon={HandCoins} tone="warning" value={money(total)} label={onlyMe ? "Te deben" : "Por pagar en total"} />
      </Figures>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section>
          <SectionTitle>Pendiente</SectionTitle>
          {pending.length === 0 ? <Empty title="Todo pagado">Las comisiones de cada venta aparecerán aquí hasta que las marques como pagadas.</Empty> : (
            <ul className="divide-y divide-line-soft">
              {pending.map((p) => (
                <li key={p.staffId} className="flex flex-wrap items-center gap-4 py-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{initials(p.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-sm text-muted">
                      Servicios {money(p.services)} · productos {money(p.products)} · {p.items} {p.items === 1 ? "venta" : "ventas"} desde el {dateLabel(toLocalDate(p.since, tz), { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <span className="font-display text-xl tnum">{money(p.commission)}</span>
                  {admin && (
                    <form action={payCommissions} className="flex gap-2">
                      <input type="hidden" name="staffId" value={p.staffId} />
                      <input name="note" className="field w-36 py-1.5 text-sm" placeholder="Nota (opcional)" aria-label="Nota del pago" />
                      <button className="btn-primary">Marcar pagado</button>
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
