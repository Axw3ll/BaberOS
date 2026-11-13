"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export class ApiErr extends Error { constructor(public status: number, msg: string, public code?: string) { super(msg); } }

export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.code === "UNAUTHENTICATED") window.dispatchEvent(new Event("bos:locked"));
    throw new ApiErr(res.status, data.error ?? "Error", data.code);
  }
  return data as T;
}

export const money = (c: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format((c ?? 0) / 100);
export const toCents = (s: string) => { const n = Number(String(s).replace(/[^\d.]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
export const pesos = (c: number) => String((c ?? 0) / 100);

export const STATUS: Record<string, string> = { PENDING: "Pendiente", CONFIRMED: "Confirmada", COMPLETED: "Completada", CHARGED: "Cobrada", CANCELLED: "Cancelada", NO_SHOW: "No se presentó" };
export const METHODS: Record<string, string> = { CASH: "Efectivo", TRANSFER: "Transferencia", CARD: "Tarjeta" };
export const CATS: Record<string, string> = { RENTA: "Renta", INSUMOS: "Insumos", SUELDOS: "Sueldos", LIMPIEZA: "Limpieza", SERVICIOS: "Servicios", OTROS: "Otros" };
export const ROLES: Record<string, string> = { OWNER: "Dueño", ADMIN: "Admin", RECEPTION: "Recepción", BARBER: "Barbero" };

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[wd]} ${d} ${MESES[m - 1]}`;
}
export function fmtDateTime(iso: string | Date, tz?: string) {
  return new Date(iso).toLocaleString("es-MX", { timeZone: tz, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------- Toast ----------
type ToastT = { msg: string; kind: "ok" | "err" } | null;
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastT>(null);
  const show = useCallback((msg: string, kind: "ok" | "err" = "ok") => setT({ msg, kind }), []);
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), t.kind === "err" ? 5000 : 2600); return () => clearTimeout(id); }, [t]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div role="status" className={`toast ${t.kind} wrap`} onClick={() => setT(null)}>{t.msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Ejecuta una acción del servidor mostrando éxito o el error real. Nada se da por hecho si falla. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg, "ok"); return r; }
    catch (e) { toast((e as Error).message || "Error", "err"); return undefined; }
    finally { setBusy(false); }
  }, [toast]);
  return { run, busy };
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 680 } : undefined}>
        <div className="modal-h"><h2 className="wrap">{title}</h2></div>
        {children}
      </div>
    </div>
  );
}

export function Actions({ onCancel, busy, label = "Guardar", disabled }: { onCancel: () => void; busy?: boolean; label?: string; disabled?: boolean }) {
  return (
    <div className="actions">
      <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
      <button className="btn gold" disabled={busy || disabled}>{busy ? "Guardando…" : label}</button>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <label className="f"><span>{label}</span>{children}{hint && <span className="hint">{hint}</span>}</label>;
}

/** Contenedor de sección con el título a la izquierda y subtítulo en línea. */
export function Section({ title, sub, children, action }: { title: string; sub?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel">
      <div className="sec-head"><h1>{title}</h1>{sub && <span className="sub">{sub}</span>}</div>
      {action && <div className="mb">{action}</div>}
      {children}
    </section>
  );
}

export function SectionHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return <><div className="sec-head"><h1>{title}</h1>{sub && <span className="sub">{sub}</span>}</div>{action && <div className="mb">{action}</div>}</>;
}

export function Kpi({ label, value, cls }: { label: string; value: ReactNode; cls?: string }) {
  return <div className="kpi"><div className="l">{label}</div><div className={`v ${cls ?? ""}`}>{value}</div></div>;
}

export function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= value ? "on" : ""} disabled={!onChange} onClick={() => onChange?.(n)} aria-label={`${n} estrellas`}>★</button>
      ))}
    </div>
  );
}

export function initials(name: string) {
  const w = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "?") + (w.length > 1 ? w[1][0] : "")).toUpperCase();
}
const AV = ["red", "teal", "blue", "plum", ""];
export function Avatar({ name, color, sm }: { name: string; color?: "auto" | "gold"; sm?: boolean }) {
  let cls = "";
  if (color === "auto") { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; cls = AV[h % AV.length]; }
  return <span className={`av ${cls} ${sm ? "sm" : ""}`}>{initials(name)}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

export function HBar({ name, value, max, label, sub }: { name: string; value: number; max: number; label: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="hbar"><span className="name" title={name}>{name}</span><span className="track"><span className="fill" style={{ display: "block", width: `${max ? Math.max(3, (value / max) * 100) : 0}%` }} /></span><span className="val">{label}</span></div>
      {sub && <div className="right small muted">{sub}</div>}
    </div>
  );
}

export function useLoad<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setError(null);
    api<T>(url).then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}

export function Loading({ error }: { error?: string | null }) {
  return <div className="card muted">{error ? <span className="bad">{error}</span> : "Cargando…"}</div>;
}

export const DAYS_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export function longDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS_FULL[wd]} ${d} De ${MESES_FULL[m - 1]} De ${y}`;
}
export function weekdayOf(date: string) { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
export function mondayOf(date: string) { const wd = weekdayOf(date); return addDays(date, wd === 0 ? -6 : 1 - wd); }

export function MethodPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="seg">
      {Object.entries(METHODS).map(([k, v]) => (
        <button key={k} type="button" className={`pill ${value === k ? "on" : ""}`} onClick={() => onChange(k)} style={{ paddingInline: 6 }}>{v}</button>
      ))}
    </div>
  );
}
