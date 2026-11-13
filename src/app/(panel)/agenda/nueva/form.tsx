"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { money, minutesLabel } from "@/lib/format";
import { createAppointment, findCustomer, getSlots } from "../actions";

type Svc = { id: string; name: string; minutes: number; price: number };
type St = { id: string; name: string; serviceIds: string[] };

const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export function NewAppointmentForm({ services, staff, tz, initialDate, initialStaff, initialCustomer }: {
  services: Svc[]; staff: St[]; tz: string; initialDate: string; initialStaff?: string;
  initialCustomer?: { phone: string; name: string } | null;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [staffId, setStaffId] = useState(initialStaff ?? (staff.length === 1 ? staff[0].id : ""));
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState("");
  const [loading, startLoading] = useTransition();
  const [phone, setPhone] = useState(initialCustomer?.phone ?? "");
  const [name, setName] = useState(initialCustomer?.name ?? "");
  const [known, setKnown] = useState(Boolean(initialCustomer));

  const eligible = useMemo(() => staff.filter((s) => picked.every((id) => s.serviceIds.includes(id))), [staff, picked]);
  const total = services.filter((s) => picked.includes(s.id));
  const minutes = total.reduce((a, s) => a + s.minutes, 0);

  useEffect(() => {
    if (staffId && !eligible.some((s) => s.id === staffId)) setStaffId("");
  }, [eligible, staffId]);

  useEffect(() => {
    setSlot("");
    if (!staffId || picked.length === 0 || !date) { setSlots(null); return; }
    startLoading(async () => setSlots(await getSlots({ staffId, serviceIds: picked, date })));
  }, [staffId, picked, date]);

  async function lookup() {
    const c = await findCustomer(phone);
    setKnown(Boolean(c));
    if (c) setName(c.name);
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <ActionForm action={createAppointment} className="grid gap-12 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-3 font-display text-xl">Servicios</legend>
          {services.length === 0 && <p className="text-muted">Primero crea servicios en la sección Servicios.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => {
              const on = picked.includes(s.id);
              return (
                <label key={s.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors ${on ? "border-brand bg-hover" : "border-line hover:border-faint"}`}>
                  <span className="flex items-center gap-3">
                    <input type="checkbox" name="serviceId" value={s.id} checked={on} onChange={() => toggle(s.id)} className="sr-only" />
                    <span className={`size-3.5 rounded-sm border ${on ? "border-brand bg-brand" : "border-faint"}`} aria-hidden />
                    <span>{s.name}<span className="block text-sm text-muted">{minutesLabel(s.minutes)}</span></span>
                  </span>
                  <span className="text-sm text-muted tnum">{money(s.price, true)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="mb-3 font-display text-xl">Barbero y día</legend>
          <Field label="Barbero">
            <select name="staffId" value={staffId} onChange={(e) => setStaffId(e.target.value)} className="field" required>
              <option value="">{picked.length && eligible.length === 0 ? "Nadie hace esa combinación" : "Elige"}</option>
              {eligible.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Día">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" required />
          </Field>
        </fieldset>

        <fieldset>
          <legend className="mb-3 font-display text-xl">Hora</legend>
          <input type="hidden" name="startsAt" value={slot} />
          {slots === null ? (
            <p className="text-muted">Elige servicios, barbero y día para ver los horarios libres.</p>
          ) : loading ? (
            <p className="text-muted">Buscando horarios…</p>
          ) : slots.length === 0 ? (
            <p className="text-muted">No hay espacio libre ese día. Prueba otro día u otro barbero.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button type="button" key={s} onClick={() => setSlot(s)} aria-pressed={slot === s}
                  className={`w-[4.5rem] rounded-md border py-2 text-sm tnum transition-colors ${slot === s ? "border-brand bg-brand text-on-brand" : "border-line text-fg hover:border-faint"}`}>
                  {fmtTime(s, tz)}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="mb-3 font-display text-xl">Cliente</legend>
          <Field label="Teléfono" hint={known ? "Cliente registrado" : "10 dígitos. Si ya vino antes, se completa su nombre."}>
            <input name="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={lookup} className="field" required />
          </Field>
          <Field label="Nombre">
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} className="field" required />
          </Field>
          <Field label="Cómo llegó">
            <select name="source" className="field" defaultValue="WALK_IN">
              <option value="WALK_IN">En persona</option>
              <option value="PHONE">Por teléfono o WhatsApp</option>
            </select>
          </Field>
          <Field label="Nota" className="sm:col-span-2">
            <input name="notes" className="field" placeholder="Opcional, por ejemplo: degradado bajo" />
          </Field>
        </fieldset>
      </div>

      <aside className="lg:sticky lg:top-14 lg:self-start">
        <div className="rounded-lg border border-line p-6">
          <p className="font-display text-xl">Resumen</p>
          {total.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Aún no eliges servicios.</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {total.map((s) => (
                <li key={s.id} className="flex justify-between gap-3"><span>{s.name}</span><span className="text-muted tnum">{money(s.price, true)}</span></li>
              ))}
            </ul>
          )}
          <dl className="mt-5 space-y-1 border-t border-line-soft pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Duración</dt><dd className="tnum">{minutes ? minutesLabel(minutes) : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Total</dt><dd className="font-display text-lg tnum">{money(total.reduce((a, s) => a + s.price, 0))}</dd></div>
            {slot && <div className="flex justify-between"><dt className="text-muted">Hora</dt><dd className="tnum">{fmtTime(slot, tz)}</dd></div>}
          </dl>
          <div className="mt-6">
            <Submit pending="Agendando…" className="btn-primary w-full">Agendar cita</Submit>
          </div>
        </div>
      </aside>
    </ActionForm>
  );
}
