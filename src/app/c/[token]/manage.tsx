"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, X } from "lucide-react";
import { cancelByToken, confirmByToken, rescheduleByToken, slotsByToken } from "./actions";

const dayName = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { ...o, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export function Manage({ token, tz, days, confirmed }: { token: string; tz: string; days: string[]; confirmed: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "move" | "cancel">("idle");
  const [date, setDate] = useState(days[0]);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const fmt = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

  useEffect(() => {
    if (mode !== "move") return;
    setSlots(null);
    slotsByToken(token, date).then(setSlots);
  }, [mode, date, token]);

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) => start(async () => {
    setError("");
    const r = await fn();
    if (r.error) setError(r.error); else { setMode("idle"); router.refresh(); }
  });

  return (
    <div className="mt-6 space-y-3">
      {mode === "idle" && (
        <>
          {!confirmed && (
            <button onClick={() => run(() => confirmByToken(token))} disabled={pending} className="btn-primary w-full py-3">
              <Check className="size-4" />Confirmar que voy
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode("move")} className="btn-quiet py-2.5"><CalendarClock className="size-4" />Cambiar horario</button>
            <button onClick={() => setMode("cancel")} className="btn-quiet py-2.5 text-danger"><X className="size-4" />Cancelar</button>
          </div>
        </>
      )}

      {mode === "cancel" && (
        <div className="rounded-xl bg-danger/5 p-4">
          <p className="font-medium">¿Seguro que quieres cancelar?</p>
          <p className="mt-1 text-sm text-muted">El horario quedará libre para alguien más.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => run(() => cancelByToken(token))} disabled={pending} className="btn bg-danger text-white hover:bg-danger/90">Sí, cancelar</button>
            <button onClick={() => setMode("idle")} className="btn-ghost">No, regresar</button>
          </div>
        </div>
      )}

      {mode === "move" && (
        <div>
          <p className="mb-3 font-medium">Elige otro día y hora</p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
            {days.map((d) => (
              <button key={d} onClick={() => setDate(d)} aria-pressed={d === date}
                className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-sm ${d === date ? "border-brand bg-brand text-on-brand" : "border-line text-muted"}`}>
                <span className="text-xs capitalize">{dayName(d, { weekday: "short" })}</span>
                <span className="font-display text-lg tnum">{dayName(d, { day: "numeric" })}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {slots === null ? <p className="col-span-4 text-sm text-muted">Buscando horarios…</p>
              : slots.length === 0 ? <p className="col-span-4 text-sm text-muted">Sin horarios libres este día.</p>
              : slots.map((s) => (
                <button key={s} disabled={pending} onClick={() => run(() => rescheduleByToken(token, s))}
                  className="rounded-lg border border-line py-2 text-sm tnum hover:border-brand hover:text-brand">{fmt(s)}</button>
              ))}
          </div>
          <button onClick={() => setMode("idle")} className="btn-ghost mt-3">Regresar</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
