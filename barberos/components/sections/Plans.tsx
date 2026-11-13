"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { api, fmtDateTime, Loading, money, useAction, useLoad } from "../ui";

const NAMES: Record<string, string> = { BASICO: "Básico", PRO: "Pro", PREMIUM: "Premium" };
const STATUS: Record<string, string> = { TRIALING: "Prueba gratuita", ACTIVE: "Activa (pagada)", PAST_DUE: "Pago vencido", CANCELED: "Cancelada" };
const INFO: Record<string, { pitch: string; feats: string[] }> = {
  BASICO: { pitch: "Para empezar a ordenar la agenda del local.", feats: ["Agenda por barbero sin choques de horario", "Reprogramar citas sin cancelarlas", "Reserva en línea con horarios libres reales", "Clientes con historial y notas", "Recordatorios por WhatsApp (los envías tú con un toque)"] },
  PRO: { pitch: "Para barberías con equipo que quieren ver sus números.", feats: ["Todo lo del Básico", "Roles con PIN por persona: dueño, recepción y barbero", "Reportes de ingresos por día, barbero y servicio", "Comisiones por barbero", "Anticipo al reservar", "Lealtad: sellos con recompensa automática y recuperación de clientes", "Corte de caja diario, gastos y venta de productos con inventario", "Pago en línea con tarjeta (requiere conectar Stripe)"] },
  PREMIUM: { pitch: "Para barberías que planean crecer a varias sucursales.", feats: ["Todo lo del Pro", "Varias sucursales en una sola cuenta (próximamente)"] },
};

export default function Plans() {
  const { data, error, reload } = useLoad<any>("/api/plan");
  const { run, busy } = useAction();
  const [payMsg, setPayMsg] = useState<Record<string, string>>({});
  if (!data) return <section className="panel"><Loading error={error} /></section>;
  const s = data.subscription;
  async function pay(plan: string) {
    setPayMsg({});
    if (plan !== s.plan) { const ok = await run(() => api("/api/plan", { body: { plan } })); if (!ok) return; reload(); }
    try { const r = await api<{ url: string }>("/api/plan/checkout", { body: {} }); window.location.href = r.url; }
    catch (e) { setPayMsg({ [plan]: (e as Error).message }); }
  }
  return (
    <section className="panel stack">
      <div className="sec-head" style={{ marginBottom: 0 }}><h1>Planes</h1><span className="sub">Precios en pesos, al mes</span></div>
      <div className="card inset">
        <div className="lines">
          <div><span className="muted">Plan</span><span className="n">{NAMES[s.plan]} · {money(data.plans.find((p: any) => p.id === s.plan)?.price)} MXN/mes</span></div>
          <div><span className="muted">Estado</span><span className="n wrap">{STATUS[s.status]}{s.status === "TRIALING" ? (data.trialExpired ? " · terminó" : ` · ${data.trialDaysLeft} días restantes`) : ""}</span></div>
          <div><span className="muted">Pago</span><span className="n wrap">{data.paid ? <span className="ok">Pagado hasta {fmtDateTime(s.currentPeriodEnd)}</span> : <span className="muted">Sin pagos registrados</span>}</span></div>
        </div>
      </div>
      <p className="small muted">Un pago solo se marca como hecho cuando Stripe lo confirma. Por ahora todas las funciones están activas en cualquier plan.</p>
      {data.plans.map((p: any) => {
        const mine = p.id === s.plan, rec = p.id === "PRO";
        return (
          <div key={p.id} className={`card plan stack ${mine || rec ? "hl" : ""}`} style={{ marginTop: rec || mine ? 14 : 0 }}>
            {(rec || mine) && <div className="badges">{rec ? <span className="tag gold" style={{ background: "var(--gold)", color: "var(--ink)" }}>RECOMENDADO</span> : <span />}{mine && <span className="tag ok" style={{ background: "var(--ok)", color: "var(--ink)" }}>TU PLAN</span>}</div>}
            <div className="b" style={{ fontSize: 18 }}>{NAMES[p.id]}</div>
            <div><span className="price">{money(p.price)}</span><span className="per">MXN / MES</span></div>
            <p className="muted">{INFO[p.id].pitch}</p>
            <ul className="feat">{INFO[p.id].feats.map((f) => <li key={f}><Check size={18} /><span>{f}</span></li>)}</ul>
            {mine ? <button className="btn gold block" disabled>Plan actual</button>
              : <button className="btn block" disabled={busy} onClick={() => run(() => api("/api/plan", { body: { plan: p.id } }), `Plan cambiado a ${NAMES[p.id]} (sin cobro)`).then((r) => r && reload())}>Cambiar a {NAMES[p.id]}</button>}
            <button className="btn cream block" onClick={() => pay(p.id)}>Pagar {NAMES[p.id]} en línea · {money(p.price)}/mes</button>
            {payMsg[p.id] && <div className="notice red wrap">{payMsg[p.id]}</div>}
          </div>
        );
      })}
    </section>
  );
}
