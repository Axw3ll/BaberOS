"use client";
import { useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import { addDays, api, dayLabel, Field, Loading, money, useAction, useLoad, weekdayOf } from "./ui";

type Info = {
  shop: { slug: string; name: string; city: string; address: string | null; phone: string; isDemo: boolean; openTime: string; closeTime: string; workDays: number[] };
  today: string; tomorrow: string;
  services: { id: string; name: string; description: string | null; price: number; durationMin: number; deposit: number }[];
  barbers: { id: string; name: string; specialty: string | null }[];
};
type Conf = { id: string; token: string; service: string; barber: string; dateLabel: string; time: string; total: number; deposit: number; shopName: string; shopPhone: string };

/** Reserva en línea. La usa el cliente final (/slug/reservar) y la sección Reserva del panel. */
export default function BookingFlow({ slug, embedded, onBooked }: { slug: string; embedded?: boolean; onBooked?: () => void }) {
  const { data, error } = useLoad<Info>(`/api/public/${slug}`);
  const [serviceId, setService] = useState("");
  const [barberId, setBarber] = useState("any");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [conf, setConf] = useState<Conf | null>(null);
  const [payMsg, setPayMsg] = useState("");
  const { run, busy } = useAction();

  useEffect(() => { if (data && !date) setDate(data.today); }, [data, date]);
  useEffect(() => { if (data?.services.length === 1 && !serviceId) setService(data.services[0].id); }, [data, serviceId]);
  const loadSlots = () => {
    if (!serviceId || !date) return;
    api<{ slots: string[] }>(`/api/public/${slug}/slots?serviceId=${serviceId}&barberId=${barberId}&date=${date}`).then((r) => setSlots(r.slots)).catch(() => setSlots([]));
  };
  useEffect(() => { setTime(""); setSlots(null); loadSlots(); }, [serviceId, barberId, date, slug]); // eslint-disable-line

  if (!data) return <div style={{ padding: 20 }}><Loading error={error} /></div>;
  const svc = data.services.find((s) => s.id === serviceId);
  const openToday = data.shop.workDays.includes(weekdayOf(data.today));
  const days = Array.from({ length: 8 }, (_, i) => addDays(data.today, i)).filter((d) => data.shop.workDays.includes(weekdayOf(d)));

  async function book() {
    const r = await run(() => api<{ confirmation: Conf }>(`/api/public/${slug}/book`, { body: { serviceId, barberId, date, time, name, phone } }));
    if (r) { setConf(r.confirmation); onBooked?.(); } else loadSlots();
  }
  async function payOnline() {
    setPayMsg("");
    try { const r = await api<{ url: string }>(`/api/public/${slug}/pay-deposit`, { body: { token: conf!.token } }); window.location.href = r.url; }
    catch (e) { setPayMsg((e as Error).message); }
  }

  const header = (
    <>
      <div className="hero-img"><Scissors size={54} strokeWidth={1.3} /></div>
      <div className="shopname">{data.shop.name.toUpperCase()}</div>
      <div className="muted small wrap" style={{ marginTop: -10 }}>{[data.shop.address, data.shop.city].filter(Boolean).join(" · ")} · {openToday ? `Hoy abierto ${data.shop.openTime}–${data.shop.closeTime}` : "Hoy cerrado"}</div>
    </>
  );

  if (conf) {
    return (
      <div className="booking">
        {header}
        <div className="card hl stack">
          <h2>¡Listo, tu lugar está apartado!</h2>
          <div className="lines">
            <div><span className="muted">Servicio</span><span className="n wrap">{conf.service}</span></div>
            <div><span className="muted">Barbero</span><span className="n wrap">{conf.barber}</span></div>
            <div><span className="muted">Día</span><span className="n">{conf.dateLabel}</span></div>
            <div><span className="muted">Hora</span><span className="n">{conf.time}</span></div>
            <div><span className="muted">Total a pagar</span><span className="n">{money(conf.total)}</span></div>
            {conf.deposit > 0 && <div><span className="muted">Anticipo requerido</span><span className="n gold">{money(conf.deposit)}</span></div>}
          </div>
          {conf.deposit > 0 && (
            <>
              <div className="notice gold">Para apartar tu lugar paga el anticipo de <b>{money(conf.deposit)}</b> en el local o por transferencia. El resto ({money(conf.total - conf.deposit)}) se paga al terminar.</div>
              <button className="btn cream block" onClick={payOnline}>Pagar anticipo con tarjeta</button>
              {payMsg && <div className="notice red wrap">{payMsg}</div>}
            </>
          )}
          <p className="small">Para cambios o cancelaciones llama o escribe a {conf.shopName}: <a href={`tel:${conf.shopPhone}`}>{conf.shopPhone}</a></p>
        </div>
        <button className="btn block" onClick={() => { setConf(null); setTime(""); setName(""); setPhone(""); }}>Hacer otra reserva</button>
      </div>
    );
  }

  return (
    <div className="booking">
      {header}
      {data.shop.isDemo && !embedded && <div className="notice gold small">Barbería de demostración con datos de ejemplo.</div>}
      <div className="stack-s">
        {data.services.map((s) => (
          <button key={s.id} className={`opt ${serviceId === s.id ? "on" : ""}`} onClick={() => setService(s.id)}>
            <span className="wrap"><b>{s.name}</b><br /><span className="small muted">{s.durationMin} min{s.deposit > 0 ? ` · anticipo ${money(s.deposit)}` : ""}</span></span>
            <span className="price">{money(s.price)}</span>
          </button>
        ))}
        {!data.services.length && <div className="empty"><h3>Sin servicios disponibles</h3></div>}
      </div>
      <Field label="Barbero">
        <select value={barberId} onChange={(e) => setBarber(e.target.value)}>
          <option value="any">Sin preferencia</option>
          {data.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <div className="f"><span className="b small">Día</span>
        <div className="chips">
          {days.map((d) => <button key={d} className={`pill ${date === d ? "on" : ""}`} onClick={() => setDate(d)}>{d === data.today ? "Hoy" : d === data.tomorrow ? "Mañana" : dayLabel(d).split(" ").slice(0, 2).join(" ")}</button>)}
        </div>
      </div>
      <Field label="Otra fecha"><input type="date" min={data.today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
      <div className="f"><span className="b small">Horario disponible</span>
        {!serviceId ? <span className="muted">Primero elige un servicio para ver los horarios libres.</span>
          : slots === null ? <span className="muted">Buscando horarios…</span>
          : !slots.length ? <span className="muted">No hay horarios libres ese día. Prueba otro día{barberId !== "any" ? " u otro barbero" : ""}.</span>
          : <div className="slots">{slots.map((t) => <button key={t} className={`slot-btn ${time === t ? "on" : ""}`} onClick={() => setTime(t)}>{t}</button>)}</div>}
      </div>
      <Field label="Tu nombre"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Nombre completo" /></Field>
      <Field label="Tu teléfono"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="312 000 0000" /></Field>
      {svc && time && <div className="card inset small">{svc.name} · {dayLabel(date)} {time} · Total {money(svc.price)}{svc.deposit > 0 && <> · <b className="gold">Anticipo para apartar {money(svc.deposit)}</b></>}</div>}
      <button className="btn gold block" disabled={busy || !serviceId || !time || name.trim().length < 2 || phone.replace(/\D/g, "").length < 10} onClick={book}>{busy ? "Reservando…" : "Reservar mi lugar"}</button>
    </div>
  );
}
