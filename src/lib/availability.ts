// Disponible = horario de la barbería ∩ turno del barbero
//              − cierres − ausencias − citas activas − anticipación mínima
import { localToUtc, weekday } from "./time";

export type Interval = { start: number; end: number };
export type WeeklyBlock = { weekday: number; startMinute: number; endMinute: number };

export function merge(list: Interval[]) {
  const s = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of s) {
    const last = out.at(-1);
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export function intersect(a: Interval[], b: Interval[]) {
  const out: Interval[] = [];
  for (const x of merge(a)) for (const y of merge(b)) {
    const start = Math.max(x.start, y.start), end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
  }
  return merge(out);
}

export function subtract(base: Interval[], remove: Interval[]) {
  let res = merge(base);
  for (const r of merge(remove)) {
    const next: Interval[] = [];
    for (const i of res) {
      if (r.end <= i.start || r.start >= i.end) { next.push(i); continue; }
      if (r.start > i.start) next.push({ start: i.start, end: r.start });
      if (r.end < i.end) next.push({ start: r.end, end: i.end });
    }
    res = next;
  }
  return res;
}

export function blocksFor(date: string, tz: string, blocks: WeeklyBlock[]): Interval[] {
  const wd = weekday(date);
  return blocks.filter((b) => b.weekday === wd).map((b) => ({
    start: localToUtc(date, b.startMinute, tz).getTime(),
    end: localToUtc(date, b.endMinute, tz).getTime(),
  }));
}

export function computeSlots(i: {
  date: string; tz: string;
  shopHours: WeeklyBlock[]; staffHours: WeeklyBlock[];
  busy: Interval[]; minutes: number; step: number;
  now: number; noticeMinutes: number;
}) {
  const open = intersect(blocksFor(i.date, i.tz, i.shopHours), blocksFor(i.date, i.tz, i.staffHours));
  const free = subtract(open, [...i.busy, { start: 0, end: i.now + i.noticeMinutes * 60_000 }]);
  const dur = i.minutes * 60_000, step = i.step * 60_000;
  const day0 = localToUtc(i.date, 0, i.tz).getTime();
  const slots: number[] = [];
  for (const f of free) {
    for (let t = day0 + Math.ceil((f.start - day0) / step) * step; t + dur <= f.end; t += step) slots.push(t);
  }
  return slots;
}
