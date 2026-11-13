import { Gift, Scissors } from "lucide-react";

/** Tarjeta de sellos: un círculo por visita; el último es el premio. */
export function StampCard({ stamps, required, rewards, rewardLabel, compact = false }: {
  stamps: number; required: number; rewards: number; rewardLabel: string; compact?: boolean;
}) {
  const left = required - stamps;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-hover p-4 text-on-brand">
      {rewards > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">
          <Gift className="size-4 shrink-0" />
          {rewards === 1 ? `Tiene un premio listo: ${rewardLabel}` : `Tiene ${rewards} premios listos: ${rewardLabel}`}
        </p>
      )}
      <div className={`grid gap-2 ${required <= 6 ? "grid-cols-6" : required <= 10 ? "grid-cols-5" : "grid-cols-6"}`} role="img"
        aria-label={`${stamps} de ${required} sellos`}>
        {Array.from({ length: required }, (_, i) => {
          const done = i < stamps, last = i === required - 1;
          return (
            <span key={i} className={`grid aspect-square place-items-center rounded-full border-2 ${
              done ? "border-white bg-white text-brand" : last ? "border-dashed border-white/70 text-white/80" : "border-white/35 text-white/40"}`}>
              {last && !done ? <Gift className={compact ? "size-3.5" : "size-4"} /> : <Scissors className={compact ? "size-3" : "size-3.5"} />}
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-white/85">
        {stamps} de {required} sellos · {left === 1 ? "¡le falta uno!" : `faltan ${left}`} para {rewardLabel}
      </p>
    </div>
  );
}
