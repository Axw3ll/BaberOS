"use client";
import { useEffect, useState } from "react";
import type { Me, SectionId } from "../Panel";
import { api, Field, Loading, pesos, toCents, useAction, useLoad } from "../ui";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const PLAN: Record<string, string> = { BASICO: "Básico · $299 MXN/mes", PRO: "Pro · $499 MXN/mes", PREMIUM: "Premium · $899 MXN/mes" };

export default function Settings({ me, onSaved, go }: { me: Me; onSaved: () => void; go: (s: SectionId) => void }) {
  const { data, error, reload } = useLoad<{ settings: any }>("/api/settings");
  const [f, setF] = useState<any>(null);
  const [sk, setSk] = useState(""); const [wh, setWh] = useState("");
  const { run, busy } = useAction();
  useEffect(() => { if (data) setF({ ...data.settings, depositValueUi: data.settings.depositMode === "FIXED" ? pesos(data.settings.depositValue) : String(data.settings.depositValue) }); }, [data]);
  if (!data || !f) return <section className="panel"><Loading error={error} /></section>;
  const s = data.settings;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function save(fields: string[], msg: string) {
    const body: Record<string, unknown> = {};
    for (const k of fields) body[k] = f[k];
    if (fields.includes("depositValue")) body.depositValue = f.depositMode === "FIXED" ? toCents(f.depositValueUi) : Number(f.depositValueUi);
    for (const k of ["slotMinutes", "loyaltyStampsRequired", "loyaltyDiscountPercent"]) if (k in body) body[k] = Number(body[k]);
    if ("ownerEmail" in body) body.ownerEmail = f.ownerEmail ?? "";
    const r = await run(() => api("/api/settings", { method: "PATCH", body }), msg);
    if (r) { reload(); onSaved(); }
  }

  return (
    <section className="panel stack">
      <div className="card stack">
        <div>
          <div className="card-title">Datos de la barbería</div>
          <div className="card-sub wrap">Página de reserva: <b style={{ color: "var(--text)" }}>/{s.slug}/reservar</b></div>
        </div>
        <Field label="Nombre"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Teléfono"><input value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        <Field label="Dirección"><input value={f.address ?? ""} onChange={set("address")} placeholder="Calle y número" /></Field>
        <Field label="Ciudad"><input value={f.city} onChange={set("city")} /></Field>
        <div className="grid2">
          <Field label="Apertura"><input type="time" value={f.openTime} onChange={set("openTime")} /></Field>
          <Field label="Cierre"><input type="time" value={f.closeTime} onChange={set("closeTime")} /></Field>
        </div>
        <div className="f"><span className="b small">Días que abre</span>
          <div className="chips">{DAYS.map((d, i) => <button key={d} type="button" className={`pill ${f.workDays.includes(i) ? "on" : ""}`} style={{ paddingInline: 14 }} onClick={() => setF({ ...f, workDays: f.workDays.includes(i) ? f.workDays.filter((x: number) => x !== i) : [...f.workDays, i] })}>{d}</button>)}</div>
        </div>
        <div className="grid2">
          <Field label="Zona horaria"><input value={f.timezone} onChange={set("timezone")} /></Field>
          <Field label="Intervalo en reserva (min)"><input type="number" min={5} step={5} value={f.slotMinutes} onChange={set("slotMinutes")} /></Field>
        </div>
        <Field label="Dueño"><input value={f.ownerName} onChange={set("ownerName")} /></Field>
        <Field label="Correo del dueño"><input type="email" value={f.ownerEmail ?? ""} onChange={set("ownerEmail")} /></Field>
        <div><button className="btn gold" disabled={busy} onClick={() => save(["name", "phone", "address", "city", "openTime", "closeTime", "workDays", "timezone", "slotMinutes", "ownerName", "ownerEmail"], "Datos guardados")}>Guardar cambios</button></div>
      </div>

      {me.perms.includes("plans") && (
        <div className="card stack">
          <div className="card-title">Suscripción</div>
          <div className="lines">
            <div><span className="muted">Plan</span><span className="n">{PLAN[me.shop.plan]}</span></div>
            <div><span className="muted">Estado</span><span className="n">{me.trial?.status === "TRIALING" ? `En prueba · ${me.trial.daysLeft} días restantes` : me.trial?.status === "ACTIVE" ? "Activa" : me.trial?.status ?? "—"}</span></div>
          </div>
          <p className="muted">La mensualidad se paga en línea desde Planes cuando el cobro con Stripe esté conectado. El estado solo pasa a «Activa» cuando Stripe confirma el pago.</p>
          <div><button className="btn" onClick={() => go("plans")}>Ver planes</button></div>
        </div>
      )}

      <div className="card stack">
        <div className="card-title">Recordatorios, anticipo y lealtad</div>
        <p className="muted">Los recordatorios se envían desde la sección Avisos: BarberOS abre WhatsApp con el mensaje escrito y tú lo envías desde tu número. El anticipo se pide al reservar y se registra cuando el cliente lo paga; al completar la cita se cobra solo el resto. La lealtad suma un sello por cada visita completada y cobrada; al juntar los sellos, el cliente gana su recompensa, que se aplica al cobrar desde el detalle de su cita.</p>
        <div className="label-up">Anticipo para apartar</div>
        <label className="check"><input type="checkbox" checked={f.depositEnabled} onChange={set("depositEnabled")} /><span>Pedir anticipo en las citas nuevas y en la reserva en línea</span></label>
        <div className="grid2">
          <Field label="Tipo"><select value={f.depositMode} onChange={set("depositMode")}><option value="FIXED">Monto fijo</option><option value="PERCENT">Porcentaje</option></select></Field>
          <Field label={f.depositMode === "FIXED" ? "Monto (MXN)" : "Porcentaje (%)"}><input inputMode="decimal" value={f.depositValueUi} onChange={set("depositValueUi")} /></Field>
        </div>
        <div className="label-up">Tarjeta de lealtad</div>
        <div className="grid2">
          <Field label="Sellos para ganar la recompensa"><input type="number" min={1} value={f.loyaltyStampsRequired} onChange={set("loyaltyStampsRequired")} /></Field>
          <Field label="Descuento de la recompensa (%)"><input type="number" min={1} max={100} value={f.loyaltyDiscountPercent} onChange={set("loyaltyDiscountPercent")} /></Field>
        </div>
        <p className="small muted">Ejemplo: con {f.loyaltyStampsRequired} sellos y {f.loyaltyDiscountPercent}% de descuento, el cliente paga {Number(f.loyaltyDiscountPercent) >= 100 ? "gratis" : `${100 - Number(f.loyaltyDiscountPercent)}%`} en la visita número {Number(f.loyaltyStampsRequired) + 1}.</p>
        <div><button className="btn gold" disabled={busy} onClick={() => save(["depositEnabled", "depositMode", "depositValue", "loyaltyStampsRequired", "loyaltyDiscountPercent"], "Anticipo y lealtad guardados")}>Guardar anticipo y lealtad</button></div>
      </div>

      <div className="card stack">
        <div className="card-title">Pagos en línea (Stripe)</div>
        <p>{s.stripeConnected ? <span className="ok b">Llave secreta configurada.</span> : <span className="warn">Stripe no está conectado: los botones de pago con tarjeta avisan que no está conectado y no cobran nada.</span>}</p>
        <div className="small muted">URL del webhook (evento <code>checkout.session.completed</code>):<b className="url" style={{ color: "var(--text)", marginTop: 4 }}>{origin}{s.webhookPath}</b></div>
        <Field label="Llave secreta (sk_test_… o sk_live_…)"><input type="password" value={sk} onChange={(e) => setSk(e.target.value)} placeholder={s.stripeConnected ? "•••••• guardada" : ""} /></Field>
        <Field label="Secreto del webhook (whsec_…)"><input type="password" value={wh} onChange={(e) => setWh(e.target.value)} placeholder={s.stripeWebhookConfigured ? "•••••• guardado" : ""} /></Field>
        <div className="row">
          <button className="btn gold" disabled={busy || (!sk && !wh)} onClick={() => run(() => api("/api/settings", { method: "PATCH", body: { ...(sk ? { stripeSecretKey: sk } : {}), ...(wh ? { stripeWebhookSecret: wh } : {}) } }), "Llaves guardadas cifradas").then((r) => { if (r) { setSk(""); setWh(""); reload(); } })}>Guardar llaves</button>
          {s.stripeConnected && <button className="btn danger" onClick={() => confirm("¿Desconectar Stripe?") && run(() => api("/api/settings", { method: "PATCH", body: { disconnectStripe: true } }), "Stripe desconectado").then((r) => r && reload())}>Desconectar</button>}
        </div>
      </div>
    </section>
  );
}
