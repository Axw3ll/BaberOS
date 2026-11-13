"use client";
import { useEffect, useState } from "react";
import type { Me } from "../Panel";
import { Actions, addDays, api, dayLabel, Field, Kpi, Loading, longDate, MethodPicker, METHODS, Modal, mondayOf, money, Stars, STATUS, useAction, useLoad } from "../ui";

type Appt = {
  id: string; status: string; source: string; notes: string | null; time: string; endTime: string; durationMin: number; price: number;
  barber: { id: string; name: string }; service: { id: string; name: string }; client: { id: string; name: string; phone: string; stamps: number };
  deposit: { amount: number; status: string; method: string | null } | null;
  payment: { amount: number; method: string; discount: number; depositApplied: number } | null;
  rating: number | null;
};
type Day = { date: string; appointments: Appt[]; summary: Record<string, { appointments: number; charged: number; revenue: number; commission: number; next: { time: string; client: string; service: string } | null }>; lost?: number };

const TAG: Record<string, string> = { PENDING: "orange", CONFIRMED: "blue", COMPLETED: "gold", CHARGED: "ok", CANCELLED: "bad", NO_SHOW: "bad" };
const WD = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export default function Agenda({ me }: { me: Me }) {
  const [date, setDate] = useState(me.shop.today);
  const { data, error, reload } = useLoad<Day>(`/api/appointments?date=${date}`);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ time?: string; barberId?: string } | null>(null);
  const isBarber = me.member.role === "BARBER";
  const canBook = me.perms.includes("booking");
  const barbers = isBarber ? me.barbers.filter((b) => b.id === me.member.barberId) : me.barbers;
  const [focus, setFocus] = useState<string>(barbers[0]?.id ?? "");
  const monday = mondayOf(date);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const openMin = toMin(me.shop.openTime), closeMin = toMin(me.shop.closeTime);
  const hours: number[] = [];
  for (let h = Math.floor(openMin / 60); h * 60 < closeMin; h++) hours.push(h);

  let kpis = null;
  if (data && !isBarber) {
    const live = data.appointments.filter((a) => !["CANCELLED", "NO_SHOW"].includes(a.status));
    const charged = data.appointments.filter((a) => a.status === "CHARGED");
    const revenue = charged.reduce((s, a) => s + (a.payment ? a.payment.amount + a.payment.depositApplied : 0), 0);
    const cap = (closeMin - openMin) * Math.max(1, barbers.length);
    const occ = cap > 0 ? Math.round((live.reduce((s, a) => s + a.durationMin, 0) / cap) * 100) : 0;
    kpis = (
      <div className="kpis k4 mb">
        <Kpi label="Ingresos de hoy" value={money(revenue)} />
        <Kpi label="Citas del día" value={live.length} />
        <Kpi label="Ticket promedio" value={money(charged.length ? Math.round(revenue / charged.length) : 0)} />
        <Kpi label="Ocupación" value={`${occ}%`} />
      </div>
    );
  }

  return (
    <section className="panel">
      {kpis}
      {data && isBarber && me.member.barberId && data.summary[me.member.barberId] && <MyDay s={data.summary[me.member.barberId]} isToday={date === me.shop.today} />}
      <div className="week mb">
        <button className="arrow" onClick={() => setDate(addDays(date, -7))} aria-label="Semana anterior">←</button>
        {week.map((d) => {
          const wd = new Date(d + "T12:00:00Z").getUTCDay();
          return (
            <button key={d} className={`day ${d === date ? "on" : ""}`} onClick={() => setDate(d)}>
              <span className="wd">{WD[wd]}</span><b>{Number(d.slice(8))}</b>{d === me.shop.today && <span className="hoy">hoy</span>}
            </button>
          );
        })}
        <button className="arrow" onClick={() => setDate(addDays(date, 7))} aria-label="Semana siguiente">→</button>
      </div>
      <div className="row between mb">
        <h3 className="muted" style={{ fontSize: 18 }}>{longDate(date)}</h3>
        {date !== me.shop.today && <button className="btn sm" onClick={() => setDate(me.shop.today)}>Hoy</button>}
      </div>
      <div className="legend mb">
        <span><i style={{ background: "var(--blue)" }} />Confirmada</span>
        <span><i style={{ background: "var(--orange)" }} />Pendiente</span>
        <span><i style={{ background: "var(--ok)" }} />Completada y cobrada</span>
      </div>
      <p className="right small muted mb">Toca una cita para cobrarla o cancelarla{canBook ? "; toca “Libre” para agendar" : ""}.</p>
      {data?.lost ? <div className="notice mb">Citas perdidas este día (no-show + canceladas): <b className="bad">{data.lost}</b></div> : null}

      {!data ? <Loading error={error} /> : !barbers.length ? <div className="empty"><h3>Sin barberos activos</h3><p>{me.perms.includes("barbers") ? "Agrégalos en la sección Barberos." : ""}</p></div> : (
        <>
          {barbers.length > 1 && (
            <div className="pills mb only-m">
              {barbers.map((b) => <button key={b.id} className={`pill ${focus === b.id ? "on" : ""}`} onClick={() => setFocus(b.id)}>{b.name.split(" ")[0]}</button>)}
            </div>
          )}
          <div className={`agenda-cols ${barbers.length > 1 ? "multi" : ""}`}>
            {barbers.map((b) => {
              const list = data.appointments.filter((a) => a.barber.id === b.id);
              return (
                <div key={b.id} className={`grid-col ${barbers.length > 1 && focus !== b.id ? "hide-m" : ""}`}>
                  {barbers.length > 1 && <h3 className="wrap">{b.name}</h3>}
                  <div className="tgrid">
                    {hours.map((h) => {
                      const starts = list.filter((a) => toMin(a.time) >= h * 60 && toMin(a.time) < h * 60 + 60);
                      const active = list.filter((a) => !["CANCELLED", "NO_SHOW"].includes(a.status));
                      const busy = !starts.some((a) => !["CANCELLED", "NO_SHOW"].includes(a.status)) && active.some((a) => toMin(a.time) < h * 60 + 60 && toMin(a.endTime) > h * 60 && toMin(a.time) < h * 60);
                      const hh = `${String(h).padStart(2, "0")}:00`;
                      return (
                        <div key={h} className="trow">
                          <div className="h">{hh}</div>
                          <div className="slot">
                            {starts.map((a) => (
                              <button key={a.id} className={`ablock st-${a.status}`} onClick={() => setOpen(a.id)}>
                                <b className="wrap">{a.client.name}</b>
                                <span className="meta">{a.service.name.toUpperCase()} · {a.time}–{a.endTime} · {money(a.price)}{a.status === "NO_SHOW" ? " · No se presentó" : a.status === "CANCELLED" ? " · Cancelada" : ""}</span>
                                {a.deposit && a.deposit.status !== "VOID" && <span className="meta">Anticipo {money(a.deposit.amount)} · {a.deposit.status === "PAID" ? "pagado" : "pendiente"}</span>}
                              </button>
                            ))}
                            {!starts.filter((a) => !["CANCELLED", "NO_SHOW"].includes(a.status)).length && (
                              busy ? <span className="free busy">Ocupado (continúa la cita anterior)</span>
                                : <button className="free" disabled={!canBook} onClick={() => canBook && setCreating({ time: hh, barberId: b.id })}>Libre</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {canBook && <button className="btn gold fab" onClick={() => setCreating({ barberId: focus })}>+ Nueva cita</button>}
      {open && <ApptDetail id={open} me={me} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <ApptForm me={me} date={date} preset={creating} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); reload(); }} />}
    </section>
  );
}

function MyDay({ s, isToday }: { s: Day["summary"][string]; isToday: boolean }) {
  return (
    <div className="card hl mb stack">
      <div className="card-title">Mi jornada{isToday ? "" : " · día seleccionado"}</div>
      <div className="kpis">
        <Kpi label="Mis citas" value={s.appointments} />
        <Kpi label="Cobradas" value={s.charged} />
        <Kpi label="Lo cobrado" value={money(s.revenue)} cls="ok" />
        <Kpi label="Mi comisión" value={money(s.commission)} cls="gold" />
      </div>
      <div className="wrap"><span className="muted">Siguiente cliente: </span>{s.next ? <b>{s.next.time} · {s.next.client} · {s.next.service}</b> : "ninguno pendiente"}</div>
    </div>
  );
}

// ---------- Detalle de cita: estado, anticipo, cobro, reprogramar, calificar ----------
function ApptDetail({ id, me, onClose, onChanged }: { id: string; me: Me; onClose: () => void; onChanged: () => void }) {
  const { data, error, reload } = useLoad<{ appointment: any }>(`/api/appointments/${id}`);
  const { run, busy } = useAction();
  const [mode, setMode] = useState<"view" | "charge" | "edit">("view");
  const [depMethod, setDepMethod] = useState("CASH");
  const [cardMsg, setCardMsg] = useState("");
  const refresh = () => { reload(); onChanged(); };
  if (!data) return <Modal title="Cita" onClose={onClose}><Loading error={error} /></Modal>;
  const a = data.appointment;
  const isBarber = me.member.role === "BARBER";
  const can = (p: string) => me.perms.includes(p);
  const open = ["PENDING", "CONFIRMED", "COMPLETED"].includes(a.status);

  const status = (s: string, msg: string) => run(() => api(`/api/appointments/${id}/status`, { body: { status: s } }), msg).then((r) => r && refresh());

  return (
    <Modal title={`${a.client.name}`} onClose={onClose}>
      {mode === "charge" ? <ChargeBox a={a} onDone={() => { setMode("view"); refresh(); }} onCancel={() => setMode("view")} />
        : mode === "edit" ? <ApptForm me={me} date={a.date} existing={a} onClose={() => setMode("view")} onSaved={() => { setMode("view"); refresh(); }} inline />
        : (
        <div className="stack">
          <div className="row"><span className={`tag ${TAG[a.status]}`}>{STATUS[a.status]}</span>{a.source === "ONLINE" && <span className="tag">Reserva en línea</span>}</div>
          <div className="lines">
            <div><span className="muted">Día y hora</span><span className="n">{dayLabel(a.date)} · {a.time}</span></div>
            <div><span className="muted">Servicio</span><span className="n wrap">{a.service.name}</span></div>
            <div><span className="muted">Barbero</span><span className="n wrap">{a.barber.name}</span></div>
            <div><span className="muted">Precio</span><span className="n">{money(a.price)}</span></div>
            <div><span className="muted">Teléfono</span><a className="n" href={`tel:${a.client.phone}`}>{a.client.phone}</a></div>
            <div><span className="muted">Lealtad</span><span className="n">{a.client.loyaltyStamps} sellos · {a.availableRewards} recompensa(s)</span></div>
            {a.notes && <div><span className="muted">Notas</span><span className="wrap right">{a.notes}</span></div>}
            {a.payment && <div><span className="muted">Cobrado</span><span className="wrap ok right b">{money(a.payment.amount)} {METHODS[a.payment.method]}{a.payment.depositApplied ? ` + anticipo ${money(a.payment.depositApplied)}` : ""}{a.payment.loyaltyDiscount ? ` · lealtad −${money(a.payment.loyaltyDiscount)}` : ""}</span></div>}
          </div>

          {a.deposit && (
            <div className="card inset stack">
              <div className="row between"><b>Anticipo {money(a.deposit.amount)}</b>
                <span className={a.deposit.status === "PAID" ? "ok" : a.deposit.status === "PENDING" ? "warn" : "muted"}>{a.deposit.status === "PAID" ? `Pagado · ${METHODS[a.deposit.method]}` : a.deposit.status === "PENDING" ? "Pendiente" : "No aplica"}</span>
              </div>
              {a.deposit.status === "PENDING" && open && can("charge") && (
                <>
                  <div className="small muted">Registrar anticipo recibido en el local:</div>
                  <MethodPicker value={depMethod} onChange={setDepMethod} />
                  <button className="btn block" disabled={busy} onClick={() => run(() => api(`/api/appointments/${id}/deposit`, { body: { method: depMethod } }), "Anticipo registrado").then((r) => r && refresh())}>Registrar anticipo {money(a.deposit.amount)}</button>
                  <button className="btn ghost block" onClick={async () => {
                    setCardMsg("");
                    try { const r = await api<{ url: string }>(`/api/appointments/${id}/deposit-checkout`, { body: {} }); window.location.href = r.url; }
                    catch (e) { setCardMsg((e as Error).message); }
                  }}>Cobrar anticipo con tarjeta en línea</button>
                  {cardMsg && <div className="notice red wrap">{cardMsg}</div>}
                </>
              )}
            </div>
          )}

          {open && can("charge") && <button className="btn gold block" onClick={() => setMode("charge")}>Cobrar</button>}
          <div className="grid2">
            {a.status === "PENDING" && <button className="btn" disabled={busy} onClick={() => status("CONFIRMED", "Cita confirmada")}>Confirmar</button>}
            {["PENDING", "CONFIRMED"].includes(a.status) && <button className="btn" disabled={busy} onClick={() => status("COMPLETED", "Marcada como completada")}>Completar</button>}
            {a.status === "COMPLETED" && <button className="btn" disabled={busy} onClick={() => status("CONFIRMED", "Se deshizo completada")}>Deshacer completada</button>}
            {["PENDING", "CONFIRMED"].includes(a.status) && can("booking") && <button className="btn" onClick={() => setMode("edit")}>Reprogramar / editar</button>}
            {["PENDING", "CONFIRMED"].includes(a.status) && <button className="btn danger" disabled={busy} onClick={() => confirm("¿Marcar que el cliente no se presentó?") && status("NO_SHOW", "Marcada como no-show")}>No se presentó</button>}
            {["PENDING", "CONFIRMED"].includes(a.status) && !isBarber && <button className="btn danger" disabled={busy} onClick={() => confirm("¿Cancelar esta cita?") && status("CANCELLED", "Cita cancelada")}>Cancelar cita</button>}
          </div>
          <button className="btn ghost block" onClick={onClose}>Cerrar</button>

          {["COMPLETED", "CHARGED"].includes(a.status) && !isBarber && (
            <div className="card inset stack">
              <b>Calificación del barbero</b>
              {a.rating ? <Stars value={a.rating.stars} /> : <>
                <div className="small muted">¿Cómo le fue al cliente con {a.barber.name}?</div>
                <Stars value={0} onChange={(n) => run(() => api(`/api/appointments/${id}/rating`, { body: { stars: n } }), "¡Gracias por calificar!").then((r) => r && refresh())} />
              </>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ChargeBox({ a, onDone, onCancel }: { a: any; onDone: () => void; onCancel: () => void }) {
  const [useReward, setUseReward] = useState(false);
  const [method, setMethod] = useState("CASH");
  const { data, error } = useLoad<{ price: number; depositPaid: number; depositPending: number; discount: number; remaining: number; availableRewards: number; rewardPercent: number | null }>(`/api/appointments/${a.id}/charge?useReward=${useReward ? 1 : 0}`);
  const { run, busy } = useAction();
  const [done, setDone] = useState<any>(null);
  if (done) return (
    <div className="stack">
      <div className="card hl stack">
        <h2 className="ok">✓ Cobro registrado</h2>
        <div>Cobrado ahora: <b>{money(done.charged)}</b></div>
        {done.depositApplied > 0 && <div className="small">Anticipo aplicado: {money(done.depositApplied)}</div>}
        {done.discount > 0 && <div className="small">Descuento de lealtad: {money(done.discount)}</div>}
        <div className="small">Sellos del cliente: {done.stamps}{done.rewardEarned ? " · 🎉 ¡Ganó una recompensa!" : ""}</div>
      </div>
      <button className="btn block" onClick={onDone}>Listo</button>
    </div>
  );
  if (!data) return <Loading error={error} />;
  return (
    <div className="stack">
      <h3>Cobrar a {a.client.name}</h3>
      <div className="lines">
        <div><span>Precio del servicio</span><span className="n">{money(data.price)}</span></div>
        <div><span>Anticipo ya pagado</span><span className="n">− {money(data.depositPaid)}</span></div>
        <div><span>Descuento de lealtad</span><span className="n">− {money(data.discount)}</span></div>
        <div style={{ alignItems: "center" }}><b>Resto a cobrar</b><span className="display gold" style={{ fontSize: 40 }}>{money(data.remaining)}</span></div>
      </div>
      {data.depositPending > 0 && <div className="notice">El anticipo de {money(data.depositPending)} sigue pendiente: se cobra completo ahora.</div>}
      {data.availableRewards > 0 ? (
        <label className="check card inset">
          <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} />
          <span className="grow wrap">Usar recompensa de lealtad ({data.rewardPercent}% de descuento). Tiene {data.availableRewards} disponible(s).</span>
        </label>
      ) : <div className="small muted">Sin recompensas de lealtad disponibles.</div>}
      <div className="small muted">Método de pago del resto</div>
      <MethodPicker value={method} onChange={setMethod} />
      <button className="btn gold block" disabled={busy} onClick={() => run(() => api<{ result: any }>(`/api/appointments/${a.id}/charge`, { body: { method, useReward, expectedRemaining: data.remaining } })).then((r) => r && setDone(r.result))}>
        {busy ? "Cobrando…" : `Cobrar ${money(data.remaining)}`}
      </button>
      <button className="btn ghost block" onClick={onCancel}>Volver</button>
    </div>
  );
}

// ---------- Crear / editar cita ----------
function ApptForm({ me, date: initialDate, existing, preset, onClose, onSaved, inline }: { me: Me; date: string; existing?: any; preset?: { time?: string; barberId?: string }; onClose: () => void; onSaved: () => void; inline?: boolean }) {
  const svcs = useLoad<{ services: { id: string; name: string; price: number; durationMin: number; active: boolean }[] }>("/api/services");
  const clients = useLoad<{ clients: { id: string; name: string; phone: string }[] }>(existing ? null : "/api/clients");
  const [barberId, setBarber] = useState(existing?.barberId ?? preset?.barberId ?? me.barbers[0]?.id ?? "");
  const [serviceId, setService] = useState(existing?.serviceId ?? "");
  const [date, setDate] = useState(existing?.date ?? initialDate);
  const [time, setTime] = useState(existing?.time ?? preset?.time ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [clientMode, setClientMode] = useState<"pick" | "new">("pick");
  const [clientId, setClientId] = useState("");
  const [q, setQ] = useState("");
  const [nc, setNc] = useState({ name: "", phone: "" });
  const [slots, setSlots] = useState<string[] | null>(null);
  const { run, busy } = useAction();

  useEffect(() => {
    if (!serviceId && svcs.data?.services.length) setService(svcs.data.services.find((s) => s.active)?.id ?? "");
  }, [svcs.data, serviceId]);
  useEffect(() => {
    setSlots(null);
    if (!barberId || !serviceId || !date) return;
    api<{ slots: string[] }>(`/api/slots?barberId=${barberId}&serviceId=${serviceId}&date=${date}`).then((r) => setSlots(r.slots)).catch(() => setSlots([]));
  }, [barberId, serviceId, date]);

  async function save() {
    if (existing) {
      const r = await run(() => api(`/api/appointments/${existing.id}`, { method: "PATCH", body: { barberId, serviceId, date, time, notes: notes || null } }), "Cita reprogramada (sin cancelarla)");
      if (r) onSaved();
    } else {
      const r = await run(() => api("/api/appointments", { body: { barberId, serviceId, date, time, notes: notes || null, ...(clientMode === "pick" ? { clientId } : { newClient: nc }) } }), "Cita creada");
      if (r) onSaved();
    }
  }
  const filtered = (clients.data?.clients ?? []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q)).slice(0, 8);
  const svc = svcs.data?.services.find((s) => s.id === serviceId);
  const body = (
    <div className="stack">
      {existing && <div className="notice">Reprogramar mueve esta misma cita: no se cancela ni se crea de nuevo.</div>}
      <div className="grid2">
        <Field label="Barbero"><select value={barberId} onChange={(e) => setBarber(e.target.value)}>{me.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Servicio"><select value={serviceId} onChange={(e) => setService(e.target.value)}>{svcs.data?.services.filter((s) => s.active || s.id === serviceId).map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.price)} · {s.durationMin} min</option>)}</select></Field>
        <Field label="Día"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Hora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={300} /></Field>
      </div>
      {slots && slots.length > 0 && <div><div className="small muted mb">Horarios libres de {me.barbers.find((b) => b.id === barberId)?.name}:</div><div className="slots">{slots.slice(0, 16).map((t) => <button key={t} type="button" className={`slot-btn ${time === t ? "on" : ""}`} onClick={() => setTime(t)}>{t}</button>)}</div></div>}
      {slots && !slots.length && <div className="small muted">Sin horarios libres dentro del horario del local ese día (puedes capturar la hora a mano; el sistema rechaza choques).</div>}
      {!existing && (
        <div className="card inset stack">
          <div className="seg"><button type="button" className={`pill ${clientMode === "pick" ? "on" : ""}`} onClick={() => setClientMode("pick")}>Existente</button><button type="button" className={`pill ${clientMode === "new" ? "on" : ""}`} onClick={() => setClientMode("new")}>Nuevo</button></div>
          {clientMode === "pick" ? (
            <>
              <input placeholder="Buscar por nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="stack-s">{filtered.map((c) => <button type="button" key={c.id} className={`opt ${clientId === c.id ? "on" : ""}`} style={{ minHeight: 56 }} onClick={() => setClientId(c.id)}><span className="wrap">{c.name}<br /><span className="small muted">{c.phone}</span></span></button>)}</div>
              {!filtered.length && <div className="small muted">Sin resultados. Usa “Cliente nuevo”.</div>}
            </>
          ) : (
            <div className="grid2">
              <Field label="Nombre"><input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></Field>
              <Field label="WhatsApp (10 dígitos)"><input inputMode="tel" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></Field>
            </div>
          )}
        </div>
      )}
      <Field label="Notas (opcional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {!existing && me.shop.depositEnabled && svc && <div className="notice">Esta cita llevará anticipo según tus Ajustes.</div>}
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn gold" disabled={busy || !barberId || !serviceId || !time || (!existing && (clientMode === "pick" ? !clientId : !nc.name || !nc.phone))} onClick={save}>{existing ? "Guardar cambios" : "Crear cita"}</button>
      </div>
    </div>
  );
  return inline ? body : <Modal title="Nueva cita" onClose={onClose} wide>{body}</Modal>;
}
