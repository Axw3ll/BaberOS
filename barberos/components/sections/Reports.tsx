"use client";
import { useState } from "react";
import type { Me } from "../Panel";
import { addDays, CATS, dayLabel, Empty, HBar, Kpi, Loading, METHODS, money, useLoad } from "../ui";

export default function Reports({ me }: { me: Me }) {
  const [week, setWeek] = useState<string | null>(null);
  const { data, error } = useLoad<any>(`/api/reports${week ? `?week=${week}` : ""}`);
  if (!data) return <section className="panel"><Loading error={error} /></section>;
  const w = data.week;
  const days: [string, number][] = Object.entries(w.byDay as Record<string, number>);
  const maxDay = Math.max(1, ...days.map(([, v]) => v));
  const maxBarber = Math.max(1, ...w.commissions.map((c: any) => c.revenue));
  const maxSvc = Math.max(1, ...w.topServices.map((s: any) => s.count));
  const methods = Object.keys(METHODS).filter((k) => w.byMethod[k] > 0);
  const maxMethod = Math.max(1, ...methods.map((k) => w.byMethod[k]));
  const cats = Object.entries(w.expenseByCategory as Record<string, number>);
  const maxCat = Math.max(1, ...cats.map(([, v]) => v));

  return (
    <section className="panel stack">
      <div className="sec-head" style={{ marginBottom: 0 }}><h1>Reportes</h1><span className="sub">Semana del {dayLabel(data.weekStart)} al {dayLabel(data.weekEnd)}</span></div>
      <div className="row end">
        <button className="btn icon-btn" onClick={() => setWeek(addDays(data.weekStart, -7))} aria-label="Semana anterior">←</button>
        <button className="btn" onClick={() => setWeek(null)}>Esta semana</button>
        <button className="btn icon-btn" onClick={() => setWeek(addDays(data.weekStart, 7))} aria-label="Semana siguiente">→</button>
      </div>
      <div className="kpis">
        <Kpi label="Ingresos de la semana" value={money(w.income)} />
        <Kpi label="Citas completadas" value={w.chargedCount} />
        <Kpi label="Ticket promedio" value={money(w.ticketAvg)} />
        <Kpi label="Citas perdidas" value={w.lost.noShow + w.lost.cancelled} />
      </div>
      <div className="kpis k3">
        <Kpi label="Gastos de la semana" value={money(w.expenses)} />
        <Kpi label="Neto de la semana" value={money(w.net)} cls={w.net >= 0 ? "ok" : "bad"} />
        <Kpi label="Venta de productos" value={money(w.products)} />
      </div>

      <div className="card">
        <div className="card-title">Ingresos por día</div>
        <div className="card-sub">Total cobrado en la semana: <b style={{ color: "var(--text)" }}>{money(w.income)}</b></div>
        <div className="cols mt">
          {days.map(([d, v]) => (
            <div key={d} className={`c ${d === data.today ? "today" : ""}`}>
              <span className="amt">{money(v)}</span>
              <span className="bar" style={{ height: `${(v / maxDay) * 120}px` }} />
            </div>
          ))}
        </div>
        <div className="cols-labels">{days.map(([d]) => <span key={d}>{dayLabel(d).split(" ").slice(0, 2).join(" ")}</span>)}</div>
      </div>

      <div className="card stack-s">
        <div className="card-title">Ingresos por barbero</div>
        <div className="card-sub mb">Quién está generando más esta semana, y su comisión</div>
        {!w.commissions.length ? <p className="muted">Sin servicios cobrados esta semana.</p> : w.commissions.map((c: any) => (
          <HBar key={c.barberId} name={c.name.toUpperCase()} value={c.revenue} max={maxBarber} label={money(c.revenue)} sub={`Comisión ${c.pct}%: ${money(c.commission)}`} />
        ))}
      </div>

      <div className="card stack-s">
        <div className="card-title">Servicios más vendidos</div>
        <div className="card-sub mb">Citas cobradas en la semana</div>
        {!w.topServices.length ? <p className="muted">Sin servicios cobrados esta semana.</p> : w.topServices.map((s: any) => (
          <HBar key={s.name} name={s.name.toUpperCase()} value={s.count} max={maxSvc} label={`${s.count} cita${s.count === 1 ? "" : "s"}`} />
        ))}
      </div>

      <div className="card stack-s">
        <div className="card-title">Ingresos por método de pago</div>
        <div className="card-sub mb">Para tu corte de caja: cuánto entró en efectivo, tarjeta y transferencia</div>
        {!methods.length ? <p className="muted">Sin cobros esta semana.</p> : methods.map((k) => (
          <HBar key={k} name={METHODS[k]} value={w.byMethod[k]} max={maxMethod} label={money(w.byMethod[k])} sub={`${w.methodCount[k]} cobro${w.methodCount[k] === 1 ? "" : "s"}`} />
        ))}
      </div>

      <div className="card stack-s">
        <div className="card-title">Gastos por categoría</div>
        <div className="card-sub mb">Lo que salió en la semana: <b style={{ color: "var(--text)" }}>{money(w.expenses)}</b> · Neto: <b className={w.net >= 0 ? "ok" : "bad"}>{money(w.net)}</b></div>
        {!cats.length ? <p className="muted">Sin gastos registrados en la semana. Regístralos desde la sección Caja para ver tu neto real.</p> : cats.map(([k, v]) => <HBar key={k} name={CATS[k]} value={v} max={maxCat} label={money(v)} />)}
        <p className="mt">Productos: <b>{money(w.products)}</b> en {w.productUnits} pieza{w.productUnits === 1 ? "" : "s"} vendida{w.productUnits === 1 ? "" : "s"} esta semana.</p>
      </div>

      <div className="card stack-s">
        <div className="card-title">Anticipos y lealtad</div>
        <div className="lines mt">
          <div><span>Anticipos recibidos ({w.depositsReceivedCount})</span><span className="n">{money(w.deposits)}</span></div>
          <div><span>Citas que aún deben anticipo ({w.pendingDeposits.count})</span><span className="n warn">{money(w.pendingDeposits.amount)}</span></div>
          <div><span>Recompensas de lealtad canjeadas</span><span className="n">{w.loyalty.redeemed}</span></div>
          <div><span>Descuento total por lealtad</span><span className="n gold">{money(w.loyalty.discount)}</span></div>
          <div><span>No se presentaron · Canceladas</span><span className="n bad">{w.lost.noShow} · {w.lost.cancelled}</span></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Últimos cobros</div>
        <div className="card-sub">Pagos registrados en el panel</div>
        {!w.recentPayments.length ? <div className="mt"><Empty title="Sin cobros esta semana" /></div> : (
          <div className="lines mt">
            {w.recentPayments.map((p: any) => (
              <div key={p.id} style={{ alignItems: "center" }}>
                <div className="grow"><b className="wrap">{p.client}</b><div className="small muted wrap">{p.service.toUpperCase()}</div></div>
                <span className="tag ok">{METHODS[p.method]}</span>
                <span className="n">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {me.shop.isDemo && <p className="small dim">Datos de ejemplo de la barbería demo.</p>}
    </section>
  );
}
