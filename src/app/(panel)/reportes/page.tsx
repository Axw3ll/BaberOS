import Link from "next/link";
import { Globe, HandCoins, Receipt, Repeat, RotateCcw, TrendingUp, UserPlus, UserX, Users, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { addDays, dateLabel, localToUtc, today } from "@/lib/time";
import { money, pct } from "@/lib/format";
import { customerStats, ORIGIN, STAGE, type Stage } from "@/lib/crm";
import { Bar, Dot, Figure, PageHeader, SectionTitle } from "@/components/ui";
import type { CustomerOrigin } from "@/generated/prisma/enums";

export const metadata = { title: "Reportes" };

const PERIODS = { "7": "7 días", "30": "30 días", "90": "90 días", mes: "Este mes", anterior: "Mes pasado" } as const;
type Period = keyof typeof PERIODS;

function range(p: Period, day: string): [string, string] {
  const [y, m] = day.split("-").map(Number);
  const first = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
  if (p === "mes") return [first(y, m), addDays(day, 1)];
  if (p === "anterior") return [first(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1), first(y, m)];
  return [addDays(day, -Number(p) + 1), addDays(day, 1)];
}

const delta = (now: number, before: number) => {
  if (!before) return null;
  const d = (now - before) / before;
  return <span className={d >= 0 ? "text-success" : "text-danger"}>{d >= 0 ? "▲" : "▼"} {Math.abs(Math.round(d * 100))}%</span>;
};

type Agg = { revenue: number; tickets: number; tips: number; customers: number };

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { shop } = await requireSection("reportes");
  const sp = await searchParams;
  const p: Period = sp.p && sp.p in PERIODS ? (sp.p as Period) : "30";
  const tz = shop.timezone, day = today(tz);
  const [fromD, toD] = range(p, day);
  const lengthDays = Math.round((Date.parse(toD) - Date.parse(fromD)) / 86_400_000);
  const prevFromD = addDays(fromD, -lengthDays);
  const from = localToUtc(fromD, 0, tz), to = localToUtc(toD, 0, tz), prevFrom = localToUtc(prevFromD, 0, tz);
  const S = shop.id;

  const visitsCte = (a: Date, b: Date) => prisma.$queryRaw<{ cid: string; first_ever: Date }[]>`
    WITH v AS (
      SELECT "customerId" AS cid, "startsAt" AS at FROM appointments WHERE "shopId" = ${S}::uuid AND status = 'COMPLETED'
      UNION ALL
      SELECT "customerId", "createdAt" FROM sales WHERE "shopId" = ${S}::uuid AND status = 'PAID' AND "appointmentId" IS NULL AND "customerId" IS NOT NULL
    )
    SELECT cid, min(at) AS first_ever FROM v GROUP BY cid HAVING bool_or(at >= ${a} AND at < ${b})`;

  const agg = (a: Date, b: Date) => prisma.$queryRaw<{ revenue: string | null; tickets: number; tips: string | null; customers: number }[]>`
    SELECT sum(total)::text AS revenue, count(*)::int AS tickets, sum(tip)::text AS tips, count(DISTINCT "customerId")::int AS customers
      FROM sales WHERE "shopId" = ${S}::uuid AND status = 'PAID' AND "createdAt" >= ${a} AND "createdAt" < ${b}`;

  const [[cur], [prev], visited, visitedPrev, byStaff, topServices, topProducts, topClients, appts, newByOrigin, stats] = await Promise.all([
    agg(from, to), agg(prevFrom, from),
    visitsCte(from, to), visitsCte(prevFrom, from),
    prisma.$queryRaw<{ id: string; name: string; services: number; svc: string; prod: string; commission: string; customers: number }[]>`
      SELECT st.id, st.name,
             count(*) FILTER (WHERE i.kind = 'SERVICE')::int AS services,
             COALESCE(sum(i.total) FILTER (WHERE i.kind = 'SERVICE'), 0)::text AS svc,
             COALESCE(sum(i.total) FILTER (WHERE i.kind = 'PRODUCT'), 0)::text AS prod,
             sum(i.commission)::text AS commission,
             count(DISTINCT s."customerId")::int AS customers
        FROM sale_items i JOIN sales s ON s.id = i."saleId" JOIN staff st ON st.id = i."staffId"
       WHERE s."shopId" = ${S}::uuid AND s.status = 'PAID' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
       GROUP BY st.id, st.name ORDER BY sum(i.total) DESC`,
    prisma.$queryRaw<{ name: string; qty: number; total: string }[]>`
      SELECT i.name, sum(i.quantity)::int AS qty, sum(i.total)::text AS total
        FROM sale_items i JOIN sales s ON s.id = i."saleId"
       WHERE s."shopId" = ${S}::uuid AND s.status = 'PAID' AND i.kind = 'SERVICE' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
       GROUP BY 1 ORDER BY sum(i.total) DESC LIMIT 8`,
    prisma.$queryRaw<{ name: string; qty: number; total: string }[]>`
      SELECT i.name, sum(i.quantity)::int AS qty, sum(i.total)::text AS total
        FROM sale_items i JOIN sales s ON s.id = i."saleId"
       WHERE s."shopId" = ${S}::uuid AND s.status = 'PAID' AND i.kind = 'PRODUCT' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
       GROUP BY 1 ORDER BY sum(i.total) DESC LIMIT 8`,
    prisma.$queryRaw<{ id: string; name: string; tickets: number; total: string }[]>`
      SELECT c.id, c.name, count(*)::int AS tickets, sum(s.total)::text AS total
        FROM sales s JOIN customers c ON c.id = s."customerId"
       WHERE s."shopId" = ${S}::uuid AND s.status = 'PAID' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
       GROUP BY c.id, c.name ORDER BY sum(s.total) DESC LIMIT 8`,
    prisma.appointment.groupBy({
      by: ["status", "source"], where: { shopId: S, startsAt: { gte: from, lt: to } }, _count: true,
    }),
    prisma.customer.groupBy({ by: ["origin"], where: { shopId: S, createdAt: { gte: from, lt: to } }, _count: true }),
    customerStats(S, { lostAfterDays: shop.lostAfterDays }),
  ]);

  const n = (v: string | null) => Number(v ?? 0);
  const [ratings, latestReviews] = await Promise.all([
    prisma.review.groupBy({ by: ["staffId"], where: { shopId: S, createdAt: { gte: from, lt: to } }, _avg: { rating: true }, _count: true }),
    prisma.review.findMany({ where: { shopId: S, createdAt: { gte: from, lt: to } }, include: { customer: true, staff: true }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const ratingOf = new Map(ratings.map((x) => [x.staffId, x]));
  const c: Agg = { revenue: n(cur.revenue), tickets: cur.tickets, tips: n(cur.tips), customers: cur.customers };
  const b: Agg = { revenue: n(prev.revenue), tickets: prev.tickets, tips: n(prev.tips), customers: prev.customers };
  const avg = c.tickets ? c.revenue / c.tickets : 0, avgPrev = b.tickets ? b.revenue / b.tickets : 0;

  const newOnes = visited.filter((v) => v.first_ever >= from).length;
  const returning = visited.length - newOnes;
  const prevSet = new Set(visitedPrev.map((v) => v.cid));
  const retained = visited.filter((v) => prevSet.has(v.cid)).length;
  const retention = prevSet.size ? retained / prevSet.size : null;

  const count = (f: (r: (typeof appts)[number]) => boolean) => appts.filter(f).reduce((a, r) => a + r._count, 0);
  const booked = count((r) => r.status !== "CANCELLED");
  const noShows = count((r) => r.status === "NO_SHOW");
  const cancelled = count((r) => r.status === "CANCELLED");
  const online = count((r) => r.source === "ONLINE");
  const totalAppts = count(() => true);

  const stageCount = (s: Stage) => stats.filter((x) => x.stage === s).length;
  const base = stats.length;
  const origins = newByOrigin.map((o) => ({ label: o.origin ? ORIGIN[o.origin as CustomerOrigin] : "Sin dato", n: o._count })).sort((x, y) => y.n - x.n);
  const newCustomers = origins.reduce((a, o) => a + o.n, 0);

  const toLabel = addDays(toD, -1);
  const fmt = (d: string) => dateLabel(d, { day: "numeric", month: "short" });

  const Ranked = ({ rows, empty }: { rows: { key: string; label: React.ReactNode; value: number; text: React.ReactNode }[]; empty: string }) => {
    const max = Math.max(0, ...rows.map((r) => r.value));
    return rows.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="mb-1 flex justify-between gap-4 text-sm"><span className="truncate">{r.label}</span><span className="shrink-0 text-muted tnum">{r.text}</span></div>
            <Bar value={r.value} max={max} />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <PageHeader title="Reportes" subtitle={`Del ${fmt(fromD)} al ${fmt(toLabel)} · comparado con los ${lengthDays} días anteriores`}
        actions={
          <nav aria-label="Periodo" className="flex flex-wrap items-center rounded-md border border-line text-sm">
            {(Object.keys(PERIODS) as Period[]).map((k, i) => (
              <Link key={k} href={k === "30" ? "/reportes" : `/reportes?p=${k}`} aria-current={k === p ? "true" : undefined}
                className={`px-3 py-2 ${i ? "border-l border-line" : ""} ${k === p ? "bg-hover text-fg" : "text-muted hover:text-fg"}`}>
                {PERIODS[k]}
              </Link>
            ))}
          </nav>
        } />

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg">Ventas</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
          <Figure value={money(c.revenue, true)} label="Ingresos" icon={Wallet} />
          <Figure value={c.tickets} label="Tickets" icon={Receipt} />
          <Figure value={money(avg, true)} label="Ticket promedio" icon={TrendingUp} />
          <Figure value={money(c.tips, true)} label="Propinas" icon={HandCoins} tone="success" />
        </div>
        <p className="mt-4 flex flex-wrap gap-x-6 text-sm text-muted">
          {delta(c.revenue, b.revenue) && <span>Ingresos {delta(c.revenue, b.revenue)}</span>}
          {delta(c.tickets, b.tickets) && <span>Tickets {delta(c.tickets, b.tickets)}</span>}
          {delta(avg, avgPrev) && <span>Ticket promedio {delta(avg, avgPrev)}</span>}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg">Clientes</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
          <Figure value={visited.length} label="Atendidos" icon={Users} />
          <Figure value={newOnes} label="Primera vez" icon={UserPlus} tone="success" />
          <Figure value={visited.length ? pct(returning / visited.length) : "—"} label="Ya habían venido" icon={Repeat} />
          <Figure value={retention === null ? "—" : pct(retention)} label="Regresaron del periodo anterior" icon={RotateCcw} tone="success" />
          <Figure value={booked ? pct(noShows / booked) : "—"} label="No llegaron" icon={UserX} tone="danger" />
          <Figure value={totalAppts ? pct(online / totalAppts) : "—"} label="Reservaron en línea" icon={Globe} />
        </div>
        {cancelled > 0 && <p className="mt-4 text-sm text-muted">{cancelled} {cancelled === 1 ? "cita cancelada" : "citas canceladas"} en el periodo.</p>}
      </section>

      <section className="mb-8">
        <SectionTitle aside="Comisión calculada al momento de cada venta">Por barbero</SectionTitle>
        {byStaff.length === 0 ? <p className="text-muted">Sin ventas en el periodo.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="text-sm text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-normal">Barbero</th>
                  <th className="py-2 pr-4 text-right font-normal">Servicios</th>
                  <th className="py-2 pr-4 text-right font-normal">Clientes</th>
                  <th className="py-2 pr-4 text-right font-normal">En servicios</th>
                  <th className="py-2 pr-4 text-right font-normal">En productos</th>
                  <th className="py-2 pr-4 text-right font-normal">Calificación</th>
                  <th className="py-2 text-right font-normal">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {byStaff.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 pr-4"><Link href={`/equipo/${s.id}`} className="hover:text-fg">{s.name}</Link></td>
                    <td className="py-3 pr-4 text-right tnum">{s.services}</td>
                    <td className="py-3 pr-4 text-right tnum">{s.customers}</td>
                    <td className="py-3 pr-4 text-right tnum">{money(n(s.svc))}</td>
                    <td className="py-3 pr-4 text-right tnum">{money(n(s.prod))}</td>
                    <td className="py-3 pr-4 text-right tnum">
                      {ratingOf.get(s.id) ? <><span className="text-warning">★</span> {ratingOf.get(s.id)!._avg.rating!.toFixed(1)} <span className="text-sm text-muted">({ratingOf.get(s.id)!._count})</span></> : <span className="text-faint">—</span>}
                    </td>
                    <td className="py-3 text-right tnum">{money(n(s.commission))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm text-muted">
                <tr className="border-t border-line">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4 text-right tnum">{byStaff.reduce((a, s) => a + s.services, 0)}</td>
                  <td className="py-2 pr-4" />
                  <td className="py-2 pr-4 text-right tnum">{money(byStaff.reduce((a, s) => a + n(s.svc), 0))}</td>
                  <td className="py-2 pr-4 text-right tnum">{money(byStaff.reduce((a, s) => a + n(s.prod), 0))}</td>
                  <td className="py-2 pr-4" />
                  <td className="py-2 text-right tnum">{money(byStaff.reduce((a, s) => a + n(s.commission), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {latestReviews.length > 0 && (
        <section className="mb-8">
          <SectionTitle aside="Llegan solas: el mensaje de después de la visita pide calificar">Lo que dicen tus clientes</SectionTitle>
          <ul className="grid gap-4 sm:grid-cols-2">
            {latestReviews.map((r) => (
              <li key={r.id} className="text-sm">
                <span className={r.rating <= 3 ? "text-danger" : "text-warning"}>{"★".repeat(r.rating)}</span>
                <span className="text-muted"> <Link href={`/clientes/${r.customerId}`} className="hover:text-fg">{r.customer.name}</Link> con {r.staff.name}</span>
                {r.comment && <p className="mt-1">“{r.comment}”</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <section>
          <SectionTitle>Servicios más vendidos</SectionTitle>
          <Ranked empty="Sin servicios vendidos." rows={topServices.map((s) => ({ key: s.name, label: s.name, value: n(s.total), text: <>{s.qty} · {money(n(s.total), true)}</> }))} />
        </section>
        <section>
          <SectionTitle>Productos más vendidos</SectionTitle>
          <Ranked empty="Sin productos vendidos." rows={topProducts.map((s) => ({ key: s.name, label: s.name, value: n(s.total), text: <>{s.qty} {s.qty === 1 ? "pza" : "pzas"} · {money(n(s.total), true)}</> }))} />
        </section>
        <section>
          <SectionTitle>Mejores clientes del periodo</SectionTitle>
          <Ranked empty="Sin ventas con cliente registrado." rows={topClients.map((s) => ({
            key: s.id, label: <Link href={`/clientes/${s.id}`} className="hover:text-fg">{s.name}</Link>, value: n(s.total),
            text: <>{s.tickets} {s.tickets === 1 ? "visita" : "visitas"} · {money(n(s.total), true)}</>,
          }))} />
        </section>
        <section>
          <SectionTitle aside={`${newCustomers} nuevos`}>Cómo llegaron los clientes nuevos</SectionTitle>
          <Ranked empty="Sin clientes nuevos en el periodo." rows={origins.map((o) => ({ key: o.label, label: o.label, value: o.n, text: o.n }))} />
        </section>
      </div>

      <section>
        <SectionTitle aside="Hoy, sin importar el periodo">Tu cartera de clientes</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["nuevo", "activo", "en_riesgo", "perdido", "sin_visitas"] as Stage[]).map((s) => (
            <Link key={s} href={`/clientes?seg=${s}`} className="rounded-xl border border-line-soft p-4 transition-colors hover:bg-hover">
              <div className="mb-1 font-display text-2xl tnum">{stageCount(s)}</div>
              <Dot color={STAGE[s].color}>{STAGE[s].label}{base > 0 && ` · ${pct(stageCount(s) / base)}`}</Dot>
              <p className="mt-1 text-xs text-faint">{STAGE[s].hint}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
