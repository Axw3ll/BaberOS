// Utilidades de zona horaria sin dependencias. Todo se guarda en UTC
// y se interpreta en la zona horaria configurada de la barbería.

function partsIn(tz: string, d: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}

function offsetMs(tz: string, d: Date) {
  const p = partsIn(tz, d);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** "2026-11-11" + "14:30" en tz -> Date UTC */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(tz, new Date(guess));
  t = guess - offsetMs(tz, new Date(t)); // segunda pasada por cambios de horario
  return new Date(t);
}

/** Fecha local YYYY-MM-DD de un instante en tz */
export function localDate(d: Date, tz: string): string {
  const p = partsIn(tz, d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localTime(d: Date, tz: string): string {
  const p = partsIn(tz, d);
  return `${p.hour}:${p.minute}`;
}

export function todayLocal(tz: string) { return localDate(new Date(), tz); }

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** 0=domingo .. 6=sábado para una fecha YYYY-MM-DD */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Rango UTC [inicio, fin) del día local */
export function dayRange(date: string, tz: string) {
  return { gte: zonedToUtc(date, "00:00", tz), lt: zonedToUtc(addDays(date, 1), "00:00", tz) };
}

/** Lunes de la semana local que contiene `date` */
export function weekStart(date: string) {
  const wd = weekday(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function toMinutes(hhmm: string) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
export function fromMinutes(n: number) { return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`; }

export function isValidDate(s: unknown): s is string { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }
export function isValidTime(s: unknown): s is string { return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function humanDate(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${DIAS[weekday(date)]} ${d} de ${MESES[m - 1]}`;
}
