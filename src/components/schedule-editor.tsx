"use client";
import { useState } from "react";

type Day = { weekday: number; on: boolean; s1: string; e1: string; s2: string; e2: string };
const NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function ScheduleEditor({ days, offLabel = "Descansa" }: { days: Day[]; offLabel?: string }) {
  const [state, setState] = useState(days);
  const [split, setSplit] = useState<Record<number, boolean>>(Object.fromEntries(days.map((d) => [d.weekday, Boolean(d.s2)])));
  const set = (wd: number, patch: Partial<Day>) => setState((s) => s.map((d) => (d.weekday === wd ? { ...d, ...patch } : d)));

  function copyToAll(from: Day) {
    setState((s) => s.map((d) => (d.on ? { ...d, s1: from.s1, e1: from.e1, s2: from.s2, e2: from.e2 } : d)));
    setSplit((sp) => Object.fromEntries(Object.keys(sp).map((k) => [k, Boolean(from.s2)])));
  }

  return (
    <div className="divide-y divide-line-soft">
      {ORDER.map((wd) => {
        const d = state.find((x) => x.weekday === wd)!;
        return (
          <div key={wd} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <label className="flex w-32 items-center gap-2">
              <input type="checkbox" name={`d${wd}_on`} checked={d.on} onChange={(e) => set(wd, { on: e.target.checked, s1: d.s1 || "10:00", e1: d.e1 || "20:00" })}
                className="accent-[var(--color-brand)]" />
              {NAMES[wd]}
            </label>
            {d.on ? (
              <>
                <span className="flex items-center gap-2">
                  <input type="time" name={`d${wd}_s1`} value={d.s1} onChange={(e) => set(wd, { s1: e.target.value })} className="field w-32 py-1.5 tnum" aria-label={`${NAMES[wd]} entrada`} />
                  <span className="text-faint">a</span>
                  <input type="time" name={`d${wd}_e1`} value={d.e1} onChange={(e) => set(wd, { e1: e.target.value })} className="field w-32 py-1.5 tnum" aria-label={`${NAMES[wd]} salida`} />
                </span>
                {split[wd] ? (
                  <span className="flex items-center gap-2">
                    <span className="text-faint">y</span>
                    <input type="time" name={`d${wd}_s2`} value={d.s2} onChange={(e) => set(wd, { s2: e.target.value })} className="field w-32 py-1.5 tnum" aria-label={`${NAMES[wd]} entrada del segundo turno`} />
                    <span className="text-faint">a</span>
                    <input type="time" name={`d${wd}_e2`} value={d.e2} onChange={(e) => set(wd, { e2: e.target.value })} className="field w-32 py-1.5 tnum" aria-label={`${NAMES[wd]} salida del segundo turno`} />
                    <button type="button" className="btn-ghost text-sm" onClick={() => { setSplit((s) => ({ ...s, [wd]: false })); set(wd, { s2: "", e2: "" }); }}>Quitar</button>
                  </span>
                ) : (
                  <button type="button" className="btn-ghost text-sm" onClick={() => setSplit((s) => ({ ...s, [wd]: true }))}>Agregar turno</button>
                )}
                <button type="button" className="btn-ghost ml-auto text-sm" onClick={() => copyToAll(d)}>Copiar a todos</button>
              </>
            ) : (
              <span className="text-sm text-faint">{offLabel}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
