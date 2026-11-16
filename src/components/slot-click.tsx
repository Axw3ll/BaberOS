"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Capa detrás de las citas de una columna de la agenda: tocar un hueco abre "Nueva cita" a esa hora. */
export function SlotClick({ staffId, day, startMin, hourPx, step }: { staffId: string; day: string; startMin: number; hourPx: number; step: number }) {
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);
  const toMinute = (e: React.MouseEvent<HTMLDivElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    return startMin + Math.floor(((y / hourPx) * 60) / step) * step;
  };
  const label = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  return (
    <div className="absolute inset-0 cursor-pointer" role="presentation"
      onMouseMove={(e) => setHover(toMinute(e))} onMouseLeave={() => setHover(null)}
      onClick={(e) => router.push(`/agenda/nueva?d=${day}&staff=${staffId}&t=${label(toMinute(e))}`)}>
      {hover !== null && (
        <div className="pointer-events-none absolute inset-x-1.5 flex items-center rounded-lg border border-dashed border-brand/50 bg-brand-soft/60 px-3 text-xs font-medium text-brand"
          style={{ top: ((hover - startMin) / 60) * hourPx + 1, height: (step / 60) * hourPx - 2 }}>
          + {label(hover)}
        </div>
      )}
    </div>
  );
}
