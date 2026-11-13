"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Script from "next/script";
import { CalendarCheck, Link2 } from "lucide-react";
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

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => void } }
}

export function Booking({ slug, tz, days, services, staff, captchaKey, shopName }: {
  slug: string; tz: string; days: string[]; services: Svc[]; staff: { id: string; name: string }[];
  captchaKey: string | null; shopName: string;
}) {
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(days[0]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ summary: string; token: string } | null>(null);
  const [marketing, setMarketing] = useState(false);
  const [website, setWebsite] = useState("");
  const [captcha, setCaptcha] = useState("");
  const captchaRef = useRef<HTMLDivElement>(null);
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
      const r = await publicBook({ slug, serviceId, staffId: slot.staffId, at: slot.at, name, phone, marketing, website, captcha });
      if ("error" in r) {
        setError(r.error);
        startLoading(async () => setSlots(await publicSlots({ slug, serviceId, staffId, date })));
      } else setDone({ summary: r.summary, token: r.token });
    });
  }

  if (done) {
    const manage = `${typeof window !== "undefined" ? window.location.origin : ""}/c/${done.token}`;
    return (
      <div role="status" className="text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-success/10 text-success"><CalendarCheck className="size-7" /></span>
        <p className="font-display text-2xl">¡Listo, {name.split(" ")[0]}!</p>
        <p className="mt-2 text-lg">{service?.name}, {done.summary}.</p>
        <p className="mt-3 text-muted">Te avisaremos por WhatsApp antes de tu cita.</p>
        <div className="mt-6 rounded-xl bg-hover p-4 text-left text-sm">
          <p className="flex items-center gap-2 font-semibold"><Link2 className="size-4" aria-hidden />Guarda este enlace</p>
          <p className="mt-1 text-muted">Desde ahí puedes confirmar, cambiar o cancelar tu cita sin llamar.</p>
          <Link href={`/c/${done.token}`} className="link mt-2 block break-all">{manage.replace(/^https?:\/\//, "")}</Link>
        </div>
        <a href={`https://wa.me/?text=${encodeURIComponent(`Mi cita en ${shopName}: ${service?.name}, ${done.summary}. ${manage}`)}`}
          target="_blank" rel="noopener" className="btn-quiet mt-4">Guardármelo en WhatsApp</a>
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
            {/* Campo trampa para bots: oculto a personas y lectores de pantalla */}
            <input value={website} onChange={(e) => setWebsite(e.target.value)} name="website" tabIndex={-1} autoComplete="off"
              className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
            <label className="flex items-start gap-2 text-sm text-muted">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
              Quiero recibir promociones y felicitaciones por WhatsApp
            </label>
            {captchaKey && (
              <>
                <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive"
                  onReady={() => { if (captchaRef.current && window.turnstile) window.turnstile.render(captchaRef.current, { sitekey: captchaKey, callback: setCaptcha }); }} />
                <div ref={captchaRef} />
              </>
            )}
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <button disabled={sending || Boolean(captchaKey && !captcha)} className="btn-primary w-full py-3">
              {sending ? "Reservando…" : `Reservar ${dayName(date, { weekday: "long", day: "numeric" })} a las ${fmt(slot.at)}`}
            </button>
            <p className="text-center text-xs text-faint">
              Al reservar aceptas el <Link href="/privacidad" className="underline" target="_blank">aviso de privacidad</Link>.
            </p>
          </form>
        </Step>
      )}
    </div>
  );
}
