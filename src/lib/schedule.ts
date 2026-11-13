import { minuteLabel, parseHHMM } from "./time";

export type Block = { weekday: number; startMinute: number; endMinute: number };
const hhmm = (m: number) => { const s = minuteLabel(m); return s.length === 4 ? `0${s}` : s; };

/** Lee el editor semanal (d{día}_on, _s1, _e1, _s2, _e2). Devuelve bloques o un error legible. */
export function readSchedule(data: FormData): { blocks: Block[] } | { error: string } {
  const blocks: Block[] = [];
  const names = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  for (let wd = 0; wd < 7; wd++) {
    if (data.get(`d${wd}_on`) !== "on") continue;
    const day: Block[] = [];
    for (const n of [1, 2]) {
      const s = String(data.get(`d${wd}_s${n}`) ?? ""), e = String(data.get(`d${wd}_e${n}`) ?? "");
      if (!s && !e) continue;
      if (!s || !e) return { error: `Completa la hora de inicio y fin del ${names[wd]}.` };
      const a = parseHHMM(s), b = parseHHMM(e) || (e === "00:00" ? 1440 : 0);
      if (b <= a) return { error: `En ${names[wd]} la hora de salida debe ser después de la de entrada.` };
      day.push({ weekday: wd, startMinute: a, endMinute: b });
    }
    if (day.length === 2 && day[1].startMinute < day[0].endMinute && day[0].startMinute < day[1].endMinute)
      return { error: `Los dos turnos del ${names[wd]} se enciman.` };
    if (day.length === 0) return { error: `Escribe el horario del ${names[wd]} o márcalo como cerrado.` };
    blocks.push(...day);
  }
  return { blocks };
}

export function toEditor(blocks: Block[]) {
  return Array.from({ length: 7 }, (_, wd) => {
    const day = blocks.filter((b) => b.weekday === wd).sort((a, b) => a.startMinute - b.startMinute);
    return {
      weekday: wd, on: day.length > 0,
      s1: day[0] ? hhmm(day[0].startMinute) : "", e1: day[0] ? hhmm(day[0].endMinute % 1440) : "",
      s2: day[1] ? hhmm(day[1].startMinute) : "", e2: day[1] ? hhmm(day[1].endMinute % 1440) : "",
    };
  });
}

export function summarize(blocks: Block[]) {
  const days = new Set(blocks.map((b) => b.weekday));
  if (days.size === 0) return "Sin horario";
  const short = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.has(d)).map((d) => short[d]).join(", ");
}
