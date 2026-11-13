"use client";
import { useEffect, useState, useTransition } from "react";
import { minutesLabel, money } from "@/lib/format";
import { publicBook, publicSlots } from "./actions";

type Svc = { id: string; name: string; description: string | null; minutes: number; price: number; staffIds: string[] };
type Slot = { at: string; staffId: string };

function Step({ n, title, done, summary, onEdit, children }: {
  n: number; title: string; done: boolean; summary?: React.ReactNode; onEdit?: () => void; children?: React.ReactNode;
}) {
  return (
    <section className="border-t border-line-soft py-7 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-3 font-display text-xl">
          <span className={`grid size-7 place-items-center rounded-full font-sans text-sm font-semibold tnum ${done ? "bg-success/15 text-success" : "bg-brand-soft text-brand"}`}>{n}</span>{title}
        </h2>
        {done && onEdit && <button type="button" onClick={onEdit} className="btn-ghost text-sm">Cambiar</button>}
      </div>
      {done && summary ? <p className="mt-2 pl-9 text-muted">{summary}</p> : children && <div className="mt-6 sm:pl-9">{children}</div>}
    </section>
  );
}

const dayName = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-MX", { ...opts, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export function Booking({ slug, tz, days, services, staff }: {
  slug: string; tz: string; days: string[]; services: Svc[]; staff: { id: string; name: string }[];
}) {
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(days[0]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [loading, startLoading] = useTransition();
  const [sending, startSending] = useTransition();

  const service = services.find((s) => s.id === serviceId);
  const eligible = staff.filter((s) => service?.staffIds.includes(s.id));
  const fmt = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

  useEffect(() => {
    setSlot(null);
    if (!serviceId || !staffId) { setSlots(null); return; }
    startLoading(async () => setSlots(await publicSlots({ slug, serviceId, staffId, date })));
  }, [slug, serviceId, staffId, date]);

  function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
    setError("");
    startSending(async () => {
      const r = await publicBook({ slug, serviceId, staffId: slot.staffId, at: slot.at, name, phone });
      if ("error" in r) {
        setError(r.error);
        startLoading(async () => setSlots(await publicSlots({ slug, serviceId, staffId, date })));
      } else setDone(r.summary);
    });
  }

  if (done) {
    return (
      <div className="border-t border-line-soft pt-10" role="status">
        <p className="font-display text-3xl">Listo, {name.split(" ")[0]}.</p>
        <p className="mt-4 text-lg">{service?.name}, {done}.</p>
        <p className="mt-4 text-muted">La barbería confirmará tu cita. Si necesitas cambiarla, llámales.</p>
      </div>
    );
  }

  return (
    <div>
      <Step n={1} title="Servicio" done={Boolean(service)} onEdit={() => { setServiceId(""); setStaffId(""); }}
        summary={service && <>{service.name}, {minutesLabel(service.minutes)}, {money(service.price, true)}</>}>
        <ul className="divide-y divide-line-soft">
          {services.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => { setServiceId(s.id); setStaffId(s.staffIds.length === 1 ? s.staffIds[0] : ""); }}
                className="-mx-3 flex w-[calc(100%+1.5rem)] items-baseline justify-between gap-6 rounded-md px-3 py-4 text-left transition-colors hover:bg-hover">
                <span>
                  <span className="block text-lg">{s.name}</span>
                  <span className="block text-sm text-muted">{s.description ? `${s.description}. ` : ""}{minutesLabel(s.minutes)}</span>
                </span>
                <span className="font-display text-xl tnum">{money(s.price, true)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Step>

      {service && (
        <Step n={2} title="Barbero" done={Boolean(staffId)} onEdit={() => setStaffId("")}
          summary={staffId === "any" ? "Quien esté libre" : eligible.find((s) => s.id === staffId)?.name}>
          <div className="flex flex-wrap gap-2">
            {eligible.length > 1 && (
              <button type="button" onClick={() => setStaffId("any")} className="btn-quiet">Quien esté libre</button>
            )}
            {eligible.map((s) => <button type="button" key={s.id} onClick={() => setStaffId(s.id)} className="btn-quiet">{s.name}</button>)}
          </div>
        </Step>
      )}

      {service && staffId && (
        <Step n={3} title="Día y hora" done={false}>
          <div className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0" role="listbox" aria-label="Día">
            {days.map((d, i) => (
              <button type="button" key={d} role="option" aria-selected={d === date} onClick={() => setDate(d)}
                className={`flex w-14 shrink-0 flex-col items-center rounded-md border py-2 transition-colors ${d === date ? "border-brand bg-brand text-on-brand" : "border-transparent text-muted hover:text-fg"}`}>
                <span className="text-xs">{i === 0 ? "Hoy" : dayName(d, { weekday: "short" }).replace(".", "")}</span>
                <span className="font-display text-xl tnum">{dayName(d, { day: "numeric" })}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 min-h-24">
            {loading || slots === null ? <p className="text-muted">Buscando horarios…</p> : slots.length === 0 ? (
              <p className="text-muted">No quedan horarios este día. Prueba otro.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {slots.map((s) => (
                  <button type="button" key={s.at} onClick={() => setSlot(s)} aria-pressed={slot?.at === s.at}
                    className={`rounded-md border py-2.5 text-sm tnum transition-colors ${slot?.at === s.at ? "border-brand bg-brand text-on-brand" : "border-line hover:border-faint"}`}>
                    {fmt(s.at)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Step>
      )}

      {slot && (
        <Step n={4} title="Tus datos" done={false}>
          <form onSubmit={confirm} className="space-y-5">
            <label className="block"><span className="label">Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" className="field" /></label>
            <label className="block"><span className="label">Teléfono</span><input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" className="field" placeholder="10 dígitos" /></label>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <button disabled={sending} className="btn-primary w-full py-3">
              {sending ? "Reservando…" : `Reservar ${dayName(date, { weekday: "long", day: "numeric" })} a las ${fmt(slot.at)}`}
            </button>
          </form>
        </Step>
      )}
    </div>
  );
}
