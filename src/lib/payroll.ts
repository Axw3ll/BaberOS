import { addDays, dateLabel, localToUtc, today, weekday, WEEKDAYS } from "./time";

// ─────────────────────────────────────────────────────────────────────
// Calendario de pago de comisiones
//
// Semanal: el periodo son los 7 días que terminan el día de pago (incluido).
// Quincenal: del 1 al 15 (se paga el 15) y del 16 al fin de mes (se paga el último día).
// Mensual: el mes completo, se paga el último día.
//
// "A pagar" = comisiones sin pagar de periodos ya cerrados (y, el día de pago, también las del periodo que cierra hoy).
// "En curso" = lo que se va juntando para el siguiente pago.
// ─────────────────────────────────────────────────────────────────────

export type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

const lastDayOfMonth = (d: string) => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Próximo día de pago (hoy incluido) y el inicio del periodo que se paga ese día. */
export function nextPayday(freq: Frequency, payWeekday: number, day: string) {
  if (freq === "WEEKLY") {
    const payday = addDays(day, (payWeekday - weekday(day) + 7) % 7);
    return { payday, start: addDays(payday, -6) };
  }
  const [y, m, d] = day.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  if (freq === "BIWEEKLY") {
    if (d <= 15) return { payday: `${first.slice(0, 8)}15`, start: first };
    return { payday: lastDayOfMonth(day), start: `${first.slice(0, 8)}16` };
  }
  return { payday: lastDayOfMonth(day), start: first };
}

export function payrollInfo(shop: { timezone: string; payoutFrequency: Frequency; payoutWeekday: number }) {
  const tz = shop.timezone, day = today(tz);
  const { payday, start } = nextPayday(shop.payoutFrequency, shop.payoutWeekday, day);
  const isPayday = payday === day;
  // Hasta dónde ya se debe: el día de pago incluye el periodo que cierra hoy; antes, solo periodos cerrados
  const cutoff = isPayday ? localToUtc(addDays(payday, 1), 0, tz) : localToUtc(start, 0, tz);
  const fmt = (d: string) => dateLabel(d, { day: "numeric", month: "short" });
  return {
    payday, start, isPayday, cutoff,
    paydayLabel: isPayday ? "hoy" : dateLabel(payday, { weekday: "long", day: "numeric", month: "long" }).toLowerCase(),
    periodLabel: `del ${fmt(start)} al ${fmt(payday)}`,
    daysLeft: Math.round((Date.parse(payday) - Date.parse(day)) / 86_400_000),
  };
}

export const FREQUENCY_LABEL: Record<Frequency, string> = { WEEKLY: "Cada semana", BIWEEKLY: "Cada quincena (15 y fin de mes)", MONTHLY: "Cada mes (fin de mes)" };
export { WEEKDAYS };
