"use client";
import { useState } from "react";
import type { Me } from "../Panel";
import { Actions, api, dayLabel, Empty, Field, fmtDateTime, Loading, Modal, money, STATUS, useAction, useLoad } from "../ui";

type C = {
  id: string; name: string; phone: string; email: string | null; notes: string | null; favoriteBarber: { id: string; name: string } | null;
  totalSpent: number; visits: number; lastVisit: string | null; lastService: string | null; daysAway: number | null; noShows: number; cancelled: number;
  loyalty: { stamps: number; required: number; rewards: number; discountPercent: number };
  recover: boolean; recoveryMessage: string | null; recoveryLink: string | null; lastRecoverySent: string | null;
};
const wa = (phone: string) => `https://wa.me/${phone.length === 10 ? "52" + phone : phone}`;

export default function Clients({ me }: { me: Me }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const { data, error, reload } = useLoad<{ clients: C[] }>("/api/clients");
  const [edit, setEdit] = useState<C | "new" | null>(null);
  const [hist, setHist] = useState<string | null>(null);
  const { run } = useAction();
  const canRecover = me.perms.includes("reminders");

  const all = data?.clients ?? [];
  const FILTERS: [string, string, (c: C) => boolean][] = [
    ["all", "Todos", () => true],
    ["frequent", "Frecuentes · 3+ visitas", (c) => c.visits >= 3],
    ["recover", "Por recuperar · 30+ días sin venir", (c) => c.recover],
    ["reward", "Con recompensa de lealtad", (c) => c.loyalty.rewards > 0],
    ["noshow", "Con faltas", (c) => c.noShows > 0],
  ];
  const fn = FILTERS.find((f) => f[0] === filter)![2];
  const ql = q.trim().toLowerCase();
  const list = all.filter(fn).filter((c) => !ql || c.name.toLowerCase().includes(ql) || c.phone.includes(ql.replace(/\D/g, "") || "~"));

  return (
    <section className="panel">
      <div className="sec-head"><h1>Clientes</h1><span className="sub">Historial y frecuencia de visita, sin hojas de Excel</span></div>
      <div className="row mb" style={{ flexWrap: "nowrap" }}>
        <input className="grow" placeholder="Buscar nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn gold" style={{ flex: "0 0 auto" }} onClick={() => setEdit("new")}>+ Nuevo</button>
      </div>
      <div className="pills mb">
        {FILTERS.map(([k, label, f]) => <button key={k} className={`pill ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{label} ({all.filter(f).length})</button>)}
      </div>
      {filter === "recover" && <div className="notice mb">El botón abre WhatsApp con el mensaje armado; tú lo envías desde el número de la barbería y luego lo marcas como enviado. No es automático.</div>}
      {!data ? <Loading error={error} /> : !list.length ? <Empty title="Sin clientes aquí">{all.length ? "Ningún cliente cumple este filtro." : "Los clientes se crean al agendar o con “+ Nuevo”."}</Empty> : (
        <div className="cards2">
          {list.map((c) => (
            <div key={c.id} className="card stack">
              <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div className="grow">
                  <h3 className="wrap" style={{ fontSize: 18 }}>{c.name}</h3>
                  <div className="muted">{c.phone}</div>
                  {c.noShows > 0 && <span className="tag bad" style={{ marginTop: 6 }}>No se presentó ×{c.noShows}</span>}
                </div>
                <div className="right small muted" style={{ flex: "0 0 auto" }}>
                  <div><b style={{ color: "var(--text)", fontSize: 16 }}>{c.visits}</b> visita{c.visits === 1 ? "" : "s"}</div>
                  <div>Última: {c.lastVisit ? `${dayLabel(new Date(c.lastVisit).toLocaleDateString("en-CA", { timeZone: me.shop.timezone }))} · hace ${c.daysAway} días` : "—"}</div>
                  <div>Ha gastado <b style={{ color: "var(--text)" }}>{money(c.totalSpent)}</b></div>
                </div>
              </div>
              <div className="muted wrap">Barbero frecuente: <b style={{ color: "var(--text)" }}>{c.favoriteBarber?.name ?? "—"}</b>{c.lastService && <> · Último servicio: <b style={{ color: "var(--text)" }}>{c.lastService.toUpperCase()}</b></>}</div>
              <div className="card inset stack-s">
                <div className="row" style={{ gap: 10 }}>
                  <b>Lealtad</b>
                  <span className="stamps">{Array.from({ length: c.loyalty.required }, (_, i) => <i key={i} className={i < c.loyalty.stamps ? "f" : ""}>{i < c.loyalty.stamps ? "✓" : i + 1}</i>)}</span>
                  <span className="small muted">{c.loyalty.stamps} de {c.loyalty.required} sellos</span>
                </div>
                <div className="small muted">{c.loyalty.rewards ? <b className="gold">Tiene {c.loyalty.rewards} recompensa{c.loyalty.rewards > 1 ? "s" : ""} lista{c.loyalty.rewards > 1 ? "s" : ""} para canjear.</b> : `Al juntar ${c.loyalty.required} sellos gana ${c.loyalty.discountPercent}% de descuento en una visita.`}</div>
              </div>
              {c.notes && <div className="small muted wrap">Nota: {c.notes}</div>}
              {c.recover && <div className="bad small b">Por recuperar: {c.daysAway} días sin venir.</div>}
              {c.lastRecoverySent && <div className="small ok">Recuperación enviada {fmtDateTime(c.lastRecoverySent, me.shop.timezone)}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <button className="btn" onClick={() => setHist(c.id)}>Historial</button>
                <button className="btn" onClick={() => setEdit(c)}>Editar</button>
                {c.recover && canRecover && c.recoveryLink
                  ? <a className="btn wa" href={c.recoveryLink} target="_blank" rel="noreferrer">Recuperar</a>
                  : <a className="btn wa" href={wa(c.phone)} target="_blank" rel="noreferrer">WhatsApp</a>}
              </div>
              {c.recover && canRecover && <button className="btn block" onClick={() => run(() => api(`/api/clients/${c.id}/recovery`, { body: {} }), "Recuperación marcada como enviada").then((r) => r && reload())}>Marcar recuperación enviada</button>}
            </div>
          ))}
        </div>
      )}
      {edit && <ClientForm me={me} c={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {hist && <History id={hist} me={me} onClose={() => setHist(null)} />}
    </section>
  );
}

function History({ id, me, onClose }: { id: string; me: Me; onClose: () => void }) {
  const { data, error } = useLoad<{ client: C & { history: { id: string; startAt: string; status: string; service: string; barber: string; price: number; paid: number; loyaltyDiscount: number }[] } }>(`/api/clients/${id}`);
  if (!data) return <Modal title="Historial" onClose={onClose}><Loading error={error} /></Modal>;
  const c = data.client;
  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="card inset stack-s mb">
        <div className="row"><b>Tarjeta de lealtad</b><span className="stamps">{Array.from({ length: c.loyalty.required }, (_, i) => <i key={i} className={i < c.loyalty.stamps ? "f" : ""}>{i < c.loyalty.stamps ? "✓" : i + 1}</i>)}</span></div>
        <div className="small muted">{c.loyalty.stamps} de {c.loyalty.required} sellos · Recompensas disponibles: <b className="gold">{c.loyalty.rewards}</b> ({c.loyalty.discountPercent}% de descuento)</div>
        <div className="small muted">Total gastado <b style={{ color: "var(--text)" }}>{money(c.totalSpent)}</b> · Último servicio {c.lastService ?? "—"} · Barbero frecuente {c.favoriteBarber?.name ?? "—"}</div>
      </div>
      <div className="label-up mb">Historial de visitas</div>
      {!c.history.length ? <Empty title="Sin visitas todavía" /> : (
        <div className="lines">
          {c.history.map((h) => (
            <div key={h.id}>
              <div className="grow">
                <b>{fmtDateTime(h.startAt, me.shop.timezone)}</b>
                <div className="small muted wrap">{h.service} · {h.barber}</div>
                {h.loyaltyDiscount > 0 && <div className="small gold">Descuento de lealtad {money(h.loyaltyDiscount)}</div>}
              </div>
              <div className="right stack-s" style={{ justifyItems: "end" }}>
                <span className="n">{h.status === "CHARGED" ? money(h.paid) : money(h.price)}</span>
                <span className={`tag ${h.status === "CHARGED" ? "ok" : ["NO_SHOW", "CANCELLED"].includes(h.status) ? "bad" : ""}`}>{STATUS[h.status]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="actions mt"><button className="btn" onClick={onClose}>Cerrar</button></div>
    </Modal>
  );
}

function ClientForm({ me, c, onClose, onSaved }: { me: Me; c: C | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: c?.name ?? "", phone: c?.phone ?? "", email: c?.email ?? "", notes: c?.notes ?? "", favoriteBarberId: c?.favoriteBarber?.id ?? "" });
  const { run, busy } = useAction();
  return (
    <Modal title={c ? "Editar cliente" : "Nuevo cliente"} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        const body = { name: f.name, phone: f.phone, email: f.email || null, notes: f.notes || null, favoriteBarberId: f.favoriteBarberId || null };
        const r = await run(() => c ? api(`/api/clients/${c.id}`, { method: "PATCH", body }) : api("/api/clients", { body }), "Cliente guardado");
        if (r) onSaved();
      }}>
        <Field label="Nombre"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Teléfono"><input required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="312 000 0000" /></Field>
        <Field label="Correo (opcional)"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Notas (opcional)"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Ej. Le gusta el fade bajo, no le gusta la navaja" /></Field>
        <Field label="Barbero favorito (opcional)" hint="Se usa en el mensaje de recuperación y como referencia al agendarle.">
          <select value={f.favoriteBarberId} onChange={(e) => setF({ ...f, favoriteBarberId: e.target.value })}>
            <option value="">Sin favorito guardado</option>{me.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Actions onCancel={onClose} busy={busy} />
        {c && <button type="button" className="btn danger block" onClick={async () => {
          if (!confirm("¿Eliminar este cliente? Si tiene historial se archiva para no perder los cobros.")) return;
          const r = await run(() => api(`/api/clients/${c.id}`, { method: "DELETE" }), "Cliente eliminado/archivado");
          if (r) onSaved();
        }}>Eliminar cliente</button>}
      </form>
    </Modal>
  );
}
