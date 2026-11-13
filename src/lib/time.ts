// Fechas y zonas horarias sin dependencias.
// Fechas de calendario se manejan como "YYYY-MM-DD" en la hora local de la barbería.

function offsetMs(utcMs: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) -
    Math.floor(utcMs / 1000) * 1000;
}

/** "2026-11-14" + 570 (9:30 local) → instante UTC */
export function localToUtc(date: string, minute: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minute);
  let t = naive - offsetMs(naive, tz);
  t = naive - offsetMs(t, tz);
  return new Date(t);
}

/** Instante → "YYYY-MM-DD" local */
export function toLocalDate(at: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Instante → minutos desde medianoche local */
export function toLocalMinute(at: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value);
}

export const today = (tz: string) => toLocalDate(new Date(), tz);

export function weekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 570 → "9:30" */
export function minuteLabel(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** "09:30" → 570 */
export function parseHHMM(s: string) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function timeLabel(at: Date, tz: string) {
  return minuteLabel(toLocalMinute(at, tz));
}

export function dateLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  const [y, m, d] = date.split("-").map(Number);
  const s = new Intl.DateTimeFormat("es-MX", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dateTimeLabel(at: Date, tz: string) {
  return `${dateLabel(toLocalDate(at, tz), { day: "numeric", month: "short" })}, ${timeLabel(at, tz)}`;
}

export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
