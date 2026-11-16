"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Sparkles, UserCheck, Zap } from "lucide-react";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { money, minutesLabel } from "@/lib/format";
import { createAppointment, findCustomer, getSlots, nextSlots } from "../actions";

type Svc = { id: string; name: string; minutes: number; price: number };
type St = { id: string; name: string; serviceIds: string[] };
type Quick = { at: string; staffId: string; staffName: string };

const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const localDate = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayChip = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { ...o, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export function NewAppointmentForm({ services, staff, tz, initialDate, initialStaff, initialCustomer, initialTime, days }: {
  services: Svc[]; staff: St[]; tz: string; initialDate: string; initialStaff?: string;
  initialCustomer?: { phone: string; name: string } | null; initialTime?: string; days: string[];
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [staffId, setStaffId] = useState(initialStaff ?? (staff.length === 1 ? staff[0].id : ""));
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState("");
  const [wanted, setWanted] = useState(initialTime ?? ""); // hora preelegida desde la agenda, "HH:MM"
  const [loading, startLoading] = useTransition();
  const [phone, setPhone] = useState(initialCustomer?.phone ?? "");
  const [name, setName] = useState(initialCustomer?.name ?? "");
  const [known, setKnown] = useState<{ name: string; habit: string } | null>(null);
  const [quick, setQuick] = useState<Quick[] | null>(null);

  const eligible = useMemo(() => staff.filter((s) => picked.every((id) => s.serviceIds.includes(id))), [staff, picked]);
  const total = services.filter((s) => picked.includes(s.id));
  const minutes = total.reduce((a, s) => a + s.minutes, 0);

  // 1) Teléfono: al llegar a 10 dígitos reconoce al cliente y elige lo de siempre
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setKnown(null); return; }
    let live = true;
    findCustomer(digits).then((c) => {
      if (!live || !c) { if (live) setKnown(null); return; }
      setName((n) => n || c.name);
      const svc = c.serviceIds.filter((id) => services.some((s) => s.id === id));
      if (svc.length) setPicked((p) => (p.length ? p : svc));
      if (c.staffId && staff.some((s) => s.id === c.staffId)) setStaffId((cur) => cur || c.staffId!);
      const habit = svc.map((id) => services.find((s) => s.id === id)?.name).join(" + ");
      const who = staff.find((s) => s.id === c.staffId)?.name;
      setKnown({ name: c.name, habit: [habit, who && `con ${who}`].filter(Boolean).join(" ") });
    });
    return () => { live = false; };
  }, [phone, services, staff]);

  useEffect(() => {
    if (staffId && !eligible.some((s) => s.id === staffId)) setStaffId("");
  }, [eligible, staffId]);

  // 2) Próximos huecos libres (con el barbero elegido o con cualquiera)
  useEffect(() => {
    if (picked.length === 0) { setQuick(null); return; }
    let live = true;
    setQuick(null);
    nextSlots({ serviceIds: picked, staffId: staffId || null }).then((q) => live && setQuick(q));
    return () => { live = false; };
  }, [picked, staffId]);

  // 3) Horarios del día elegido
  useEffect(() => {
    if (!staffId || picked.length === 0 || !date) { setSlots(null); return; }
    startLoading(async () => {
      const list = await getSlots({ staffId, serviceIds: picked, date });
      setSlots(list);
      const match = wanted && list.find((s) => fmtTime(s, tz).padStart(5, "0") === wanted.padStart(5, "0"));
      setSlot((cur) => (cur && list.includes(cur) ? cur : match || ""));
    });
  }, [staffId, picked, date, wanted, tz]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const takeQuick = (q: Quick) => { setStaffId(q.staffId); setDate(localDate(q.at, tz)); setWanted(fmtTime(q.at, tz)); setSlot(q.at); };

  return (
    <ActionForm action={createAppointment} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 font-display text-lg">Cliente</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono">
              <input name="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="field tnum" placeholder="10 dígitos" required autoFocus={!initialCustomer} />
            </Field>
            <Field label="Nombre">
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} className="field" required />
            </Field>
          </div>
          {known && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
              <UserCheck className="size-4 shrink-0" />
              <span>Ya es cliente{known.habit && <>. Lo de siempre: <strong className="font-semibold">{known.habit}</strong></>}</span>
            </p>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 font-display text-lg">Servicios</h2>
          {services.length === 0 && <p className="text-muted">Primero crea servicios en la sección Servicios.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => {
              const on = picked.includes(s.id);
              return (
                <label key={s.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${on ? "border-brand bg-brand-soft" : "border-line hover:border-faint"}`}>
                  <span className="flex items-center gap-3">
                    <input type="checkbox" name="serviceId" value={s.id} checked={on} onChange={() => toggle(s.id)} className="sr-only" />
                    <span className={`grid size-4 place-items-center rounded border ${on ? "border-brand bg-brand" : "border-faint"}`} aria-hidden>
                      {on && <svg viewBox="0 0 12 12" className="size-3 text-on-brand"><path d="M2.5 6.5 5 9l4.5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
                    </span>
                    <span>{s.name}<span className="block text-sm text-muted">{minutesLabel(s.minutes)}</span></span>
                  </span>
                  <span className="text-sm font-medium tnum">{money(s.price, true)}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 font-display text-lg">Barbero y hora</h2>
          <input type="hidden" name="staffId" value={staffId} />
          <div className="flex flex-wrap gap-2">
            {eligible.map((s) => (
              <button type="button" key={s.id} onClick={() => setStaffId(s.id)} aria-pressed={staffId === s.id}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${staffId === s.id ? "border-brand bg-brand text-on-brand" : "border-line hover:border-faint"}`}>
                {s.name}
              </button>
            ))}
            {picked.length > 0 && eligible.length === 0 && <p className="text-sm text-danger">Nadie del equipo hace esa combinación de servicios.</p>}
          </div>

          {picked.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted"><Zap className="size-4 text-warning" />Próximos huecos</p>
              {quick === null ? <p className="text-sm text-faint">Buscando…</p> : quick.length === 0 ? <p className="text-sm text-muted">Sin espacio en los próximos 14 días.</p> : (
                <div className="flex flex-wrap gap-2">
                  {quick.map((q) => {
                    const d = localDate(q.at, tz), on = slot === q.at;
                    return (
                      <button type="button" key={`${q.at}-${q.staffId}`} onClick={() => takeQuick(q)} aria-pressed={on}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition ${on ? "border-brand bg-brand text-on-brand" : "border-line bg-surface hover:border-brand"}`}>
                        <span className="block font-semibold tnum">{d === days[0] ? "Hoy" : d === days[1] ? "Mañana" : dayChip(d, { weekday: "short", day: "numeric" })} · {fmtTime(q.at, tz)}</span>
                        {!staffId && <span className={`block text-xs ${on ? "text-white/80" : "text-muted"}`}>{q.staffName}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-muted">U otro día</p>
            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
              {days.map((d, i) => (
                <button type="button" key={d} onClick={() => setDate(d)} aria-pressed={date === d}
                  className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-1.5 text-sm transition ${date === d ? "border-brand bg-brand text-on-brand" : "border-line hover:border-faint"}`}>
                  <span className="text-[11px] capitalize">{i === 0 ? "Hoy" : dayChip(d, { weekday: "short" })}</span>
                  <span className="font-semibold tnum">{dayChip(d, { day: "numeric" })}</span>
                </button>
              ))}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Otra fecha" className="field ml-1 w-auto shrink-0 py-1.5" />
            </div>
          </div>

          <input type="hidden" name="startsAt" value={slot} />
          <div className="mt-4">
            {slots === null ? (
              <p className="text-sm text-muted">{picked.length ? "Elige barbero para ver sus horarios." : "Elige el servicio para ver horarios."}</p>
            ) : loading ? (
              <p className="text-sm text-muted">Buscando horarios…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted">No hay espacio libre ese día. Prueba otro día u otro barbero.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button type="button" key={s} onClick={() => setSlot(s)} aria-pressed={slot === s}
                    className={`w-[4.5rem] rounded-lg border py-2 text-sm tnum transition ${slot === s ? "border-brand bg-brand text-on-brand" : "border-line hover:border-brand"}`}>
                    {fmtTime(s, tz)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <details className="card p-5 sm:p-6">
          <summary className="cursor-pointer font-medium text-muted">Más datos (opcional)</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Cómo llegó">
              <select name="source" className="field" defaultValue="WALK_IN">
                <option value="WALK_IN">En persona</option>
                <option value="PHONE">Por teléfono o WhatsApp</option>
              </select>
            </Field>
            <Field label="Nota">
              <input name="notes" className="field" placeholder="Por ejemplo: degradado bajo" />
            </Field>
          </div>
        </details>
      </div>

      <aside className="lg:sticky lg:top-10 lg:self-start">
        <div className="card p-6">
          <p className="flex items-center gap-2 font-display text-lg"><Sparkles className="size-4 text-brand" />Resumen</p>
          {total.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Aún no eliges servicios.</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {total.map((s) => (
                <li key={s.id} className="flex justify-between gap-3"><span>{s.name}</span><span className="text-muted tnum">{money(s.price, true)}</span></li>
              ))}
            </ul>
          )}
          <dl className="mt-5 space-y-1.5 border-t border-line-soft pt-4 text-sm">
            {name && <div className="flex justify-between gap-3"><dt className="text-muted">Cliente</dt><dd className="truncate">{name}</dd></div>}
            {staffId && <div className="flex justify-between gap-3"><dt className="text-muted">Con</dt><dd>{staff.find((s) => s.id === staffId)?.name}</dd></div>}
            {slot && <div className="flex justify-between gap-3"><dt className="text-muted">Cuándo</dt><dd className="tnum">{dayChip(localDate(slot, tz), { weekday: "short", day: "numeric", month: "short" })}, {fmtTime(slot, tz)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Duración</dt><dd className="tnum">{minutes ? minutesLabel(minutes) : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Total</dt><dd className="font-display text-lg tnum">{money(total.reduce((a, s) => a + s.price, 0))}</dd></div>
          </dl>
          <div className="mt-6">
            <Submit pending="Agendando…" className="btn-primary w-full py-2.5">Agendar cita</Submit>
          </div>
        </div>
      </aside>
    </ActionForm>
  );
}
