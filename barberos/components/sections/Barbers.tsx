"use client";
import { useState } from "react";
import type { Me } from "../Panel";
import { Actions, api, Avatar, Empty, Field, Loading, Modal, money, ROLES, useAction, useLoad } from "../ui";

type Barber = {
  id: string; name: string; specialty: string | null; phone: string | null; email: string | null; commissionPct: number; active: boolean; hasMember: boolean;
  rating: { avg: number; count: number } | null;
  today?: { appointments: number; charged: number; revenue: number; commission: number; next: { time: string; client: string; service: string } | null };
};

export default function Barbers({ me }: { me: Me }) {
  const { data, error, reload } = useLoad<{ barbers: Barber[] }>("/api/barbers");
  const [edit, setEdit] = useState<Barber | "new" | null>(null);
  const { run } = useAction();
  return (
    <section className="panel">
      <div className="sec-head"><h1>Barberos</h1></div>
      <button className="btn gold block mb" onClick={() => setEdit("new")}>+ Nuevo barbero</button>
      {!data ? <Loading error={error} /> : !data.barbers.length ? <Empty title="Aún no hay barberos">Agrega a tu equipo para empezar a agendar.</Empty> : (
        <div className="cards2">
          {data.barbers.map((b) => (
            <div key={b.id} className={`card stack ${b.active ? "" : "inactive"}`}>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
                <Avatar name={b.name} color="auto" />
                <div className="grow">
                  <h3 className="wrap" style={{ textTransform: "uppercase", fontSize: 18 }}>{b.name}</h3>
                  {b.specialty && <div className="muted wrap" style={{ textTransform: "uppercase" }}>{b.specialty}</div>}
                  {b.phone && <div className="muted wrap">Tel. {b.phone}</div>}
                  {b.email && <div className="muted wrap">{b.email}</div>}
                  <div className="muted">Comisión {b.commissionPct}%</div>
                  <div className="gold b small">{b.rating ? `★ ${b.rating.avg.toFixed(1)} · ${b.rating.count} calificación${b.rating.count === 1 ? "" : "es"} de clientes` : <span className="dim">Sin calificaciones</span>}</div>
                  <div className="small" style={{ marginTop: 4 }}>{b.active ? <span className="ok">Activo</span> : <span className="bad">Inactivo</span>} · {b.hasMember ? <span className="muted">Entra con PIN</span> : <span className="dim">Sin acceso al sistema</span>}</div>
                </div>
              </div>
              <div className="grid2">
                <button className="btn" onClick={() => setEdit(b)}>Editar</button>
                <button className={`btn ${b.active ? "" : "wa"}`} onClick={() => run(() => api(`/api/barbers/${b.id}`, { method: "PATCH", body: { active: !b.active } }), b.active ? "Barbero desactivado" : "Barbero activado").then((r) => r && reload())}>{b.active ? "Desactivar" : "Activar"}</button>
              </div>
              {b.today && (
                <>
                  <hr className="dash-div" />
                  <div className="muted wrap">Hoy: <b style={{ color: "var(--text)" }}>{b.today.appointments} cita{b.today.appointments === 1 ? "" : "s"}</b> · {b.today.charged} cobrada{b.today.charged === 1 ? "" : "s"} · <b style={{ color: "var(--text)" }}>{money(b.today.revenue)}</b> · comisión {money(b.today.commission)} · {b.today.next ? <>siguiente <b style={{ color: "var(--text)" }}>{b.today.next.time} {b.today.next.client}</b></> : "sin citas pendientes hoy"}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {me.perms.includes("team") && <Team me={me} barbers={data?.barbers ?? []} onChanged={reload} />}
      {edit && <BarberForm b={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </section>
  );
}

function BarberForm({ b, onClose, onSaved }: { b: Barber | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: b?.name ?? "", specialty: b?.specialty ?? "", phone: b?.phone ?? "", email: b?.email ?? "", commissionPct: String(b?.commissionPct ?? 40) });
  const { run, busy } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={b ? "Editar barbero" : "Nuevo barbero"} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        const body = { name: f.name, specialty: f.specialty || null, phone: f.phone || null, email: f.email || "", commissionPct: Number(f.commissionPct) };
        const r = await run(() => b ? api(`/api/barbers/${b.id}`, { method: "PATCH", body }) : api("/api/barbers", { body }), "Barbero guardado");
        if (r) onSaved();
      }}>
        <Field label="Nombre"><input required value={f.name} onChange={set("name")} /></Field>
        <Field label="Especialidad"><input value={f.specialty} onChange={set("specialty")} placeholder="Ej. Fade, barba clásica" /></Field>
        <Field label="Teléfono"><input inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="312 000 0000" /></Field>
        <Field label="Correo"><input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Comisión (%)" hint="Porcentaje de lo que genera cada servicio cobrado."><input required type="number" min={0} max={100} value={f.commissionPct} onChange={set("commissionPct")} /></Field>
        <Actions onCancel={onClose} busy={busy} />
      </form>
    </Modal>
  );
}

type M = { id: string; name: string; email: string | null; role: string; active: boolean; barberId: string | null; lockedUntil: string | null; barber: { name: string } | null };

function Team({ me, barbers, onChanged }: { me: Me; barbers: Barber[]; onChanged: () => void }) {
  const { data, error, reload } = useLoad<{ members: M[]; me: string }>("/api/team");
  const [edit, setEdit] = useState<M | "new" | null>(null);
  const { run } = useAction();
  const isLocked = (m: M) => !!m.lockedUntil && new Date(m.lockedUntil) > new Date();
  return (
    <div className="mt" style={{ marginTop: 28 }}>
      <h1 className="mb" style={{ fontSize: 24 }}>Equipo y roles</h1>
      <button className="btn gold block mb" onClick={() => setEdit("new")}>+ Nuevo miembro</button>
      <p className="muted mb">Cada quien entra con su propio PIN desde la pantalla de bloqueo, y el panel le muestra solo lo que su rol permite: el barbero ve su agenda y su resumen; recepción no ve reportes, planes ni gastos de caja.</p>
      {!data ? <Loading error={error} /> : (
        <div className="cards2">
          {data.members.map((m) => (
            <div key={m.id} className={`card stack ${m.active ? "" : "inactive"}`}>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
                <Avatar name={m.name} />
                <div className="grow">
                  <h3 className="wrap" style={{ fontSize: 18 }}>{m.name}</h3>
                  <div className="muted wrap">{ROLES[m.role]}{m.email ? ` · ${m.email}` : ""}{m.barber ? ` · ${m.barber.name}` : ""}</div>
                </div>
              </div>
              <div className="row">
                {isLocked(m) ? <span className="tag bad">Bloqueado</span> : <span className="tag ok">Con PIN</span>}
                {m.id === data.me && <span className="tag gold">Tu sesión</span>}
                {!m.active && <span className="tag bad">Inactivo</span>}
              </div>
              <div className="grid2">
                <button className="btn" onClick={() => setEdit(m)}>Editar</button>
                {m.id !== data.me ? <button className={`btn ${m.active ? "" : "wa"}`} onClick={() => run(() => api(`/api/team/${m.id}`, { method: "PATCH", body: { active: !m.active } }), m.active ? "Miembro desactivado" : "Miembro activado").then((r) => r && reload())}>{m.active ? "Desactivar" : "Activar"}</button>
                  : <button className="btn" disabled>Desactivar</button>}
                {isLocked(m) && <button className="btn" style={{ gridColumn: "1 / -1" }} onClick={() => run(() => api(`/api/team/${m.id}`, { method: "PATCH", body: { unlock: true } }), "Perfil desbloqueado").then((r) => r && reload())}>Desbloquear</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <MemberForm me={me} m={edit === "new" ? null : edit} barbers={barbers} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); onChanged(); }} />}
    </div>
  );
}

function MemberForm({ me, m, barbers, onClose, onSaved }: { me: Me; m: M | null; barbers: Barber[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: m?.name ?? "", email: m?.email ?? "", role: m?.role ?? "RECEPTION", barberId: m?.barberId ?? "", pin: "", pin2: "" });
  const [err, setErr] = useState("");
  const { run, busy } = useAction();
  const avail = barbers.filter((b) => b.active && (!b.hasMember || b.id === m?.barberId));
  const roles = Object.entries(ROLES).filter(([k]) => k !== "OWNER" || me.member.role === "OWNER");
  return (
    <Modal title={m ? "Editar miembro" : "Nuevo miembro del equipo"} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setErr("");
        if ((!m || f.pin) && !/^\d{4,6}$/.test(f.pin)) return setErr("El PIN debe tener de 4 a 6 dígitos");
        if (f.pin !== f.pin2) return setErr("Los PIN no coinciden");
        if (f.role === "BARBER" && !f.barberId) return setErr("Vincula al miembro con su registro de barbero");
        const body: Record<string, unknown> = { name: f.name, email: f.email, role: f.role, barberId: f.role === "BARBER" ? f.barberId : null };
        if (m) { if (f.pin) body.newPin = f.pin; } else body.pin = f.pin;
        const r = await run(() => m ? api(`/api/team/${m.id}`, { method: "PATCH", body }) : api("/api/team", { body }), "Miembro guardado");
        if (r) onSaved();
      }}>
        <Field label="Nombre"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Correo"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Rol"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {f.role === "BARBER" && (
          <Field label="Registro de barbero vinculado" hint={!avail.length ? "No hay barberos sin acceso. Créalo primero arriba, en Barberos." : undefined}>
            <select value={f.barberId} onChange={(e) => setF({ ...f, barberId: e.target.value })}>
              <option value="">Elige al barbero</option>{avail.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={m ? "PIN nuevo (déjalo vacío para no cambiarlo)" : "PIN de acceso (4 a 6 dígitos)"} hint="Con su PIN entra en la pantalla de bloqueo y el panel le muestra solo lo que su rol permite.">
          <input type="password" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} placeholder="Ej. 1357" />
        </Field>
        <Field label="Repite el PIN"><input type="password" inputMode="numeric" maxLength={6} value={f.pin2} onChange={(e) => setF({ ...f, pin2: e.target.value })} /></Field>
        {err && <div className="notice red">{err}</div>}
        <Actions onCancel={onClose} busy={busy} />
      </form>
    </Modal>
  );
}
