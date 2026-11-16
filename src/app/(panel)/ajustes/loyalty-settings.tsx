"use client";
import { useState } from "react";
import { Ban, Stamp, Star } from "lucide-react";
import { Field } from "@/components/ui";
import { stampRewardLabel } from "@/lib/loyalty";

type Props = {
  mode: "OFF" | "POINTS" | "STAMPS";
  pointsPerPeso: number; pesoPerPoint: number;
  stampsRequired: number; stampReward: "FREE_SERVICE" | "PERCENT" | "AMOUNT"; stampRewardValue: number; stampMinAmount: number;
  autoLoyaltyMsgs: boolean;
};

const MODES = [
  { id: "STAMPS", icon: Stamp, title: "Tarjeta de sellos", text: "Un sello por visita. Al completar la tarjeta, gana un premio. Lo más fácil de entender." },
  { id: "POINTS", icon: Star, title: "Puntos", text: "Gana puntos por cada peso que paga y los canjea como descuento. Útil si vendes mucho producto." },
  { id: "OFF", icon: Ban, title: "Sin programa", text: "Nadie acumula nada." },
] as const;

export function LoyaltySettings(p: Props) {
  const [mode, setMode] = useState(p.mode);
  const [required, setRequired] = useState(String(p.stampsRequired));
  const [reward, setReward] = useState(p.stampReward);
  const [value, setValue] = useState(String(p.stampRewardValue || ""));
  const label = stampRewardLabel({ stampReward: reward, stampRewardValue: Number(value) || 0 });

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Programa de lealtad">
        {MODES.map((m) => (
          <label key={m.id} className={`cursor-pointer rounded-xl border p-3 transition ${mode === m.id ? "border-brand bg-brand-soft" : "border-line hover:border-faint"}`}>
            <input type="radio" name="loyaltyMode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} className="sr-only" />
            <span className="flex items-center gap-2 font-semibold"><m.icon className={`size-4 ${mode === m.id ? "text-brand" : "text-muted"}`} />{m.title}</span>
            <span className="mt-1 block text-xs text-muted">{m.text}</span>
          </label>
        ))}
      </div>

      {mode === "STAMPS" && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Sellos para el premio" hint={`Ej. 9: la visita 10 tiene premio`}>
              <input name="stampsRequired" inputMode="numeric" value={required} onChange={(e) => setRequired(e.target.value)} className="field tnum" />
            </Field>
            <Field label="Premio">
              <select name="stampReward" value={reward} onChange={(e) => setReward(e.target.value as Props["stampReward"])} className="field">
                <option value="FREE_SERVICE">Servicio gratis</option>
                <option value="PERCENT">Porcentaje de descuento</option>
                <option value="AMOUNT">Descuento en pesos</option>
              </select>
            </Field>
            <Field label={reward === "FREE_SERVICE" ? "Tope en pesos" : reward === "PERCENT" ? "Porcentaje (%)" : "Descuento ($)"}
              hint={reward === "FREE_SERVICE" ? "Vacío = sin tope" : undefined}>
              <input name="stampRewardValue" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={reward === "FREE_SERVICE" ? "Sin tope" : ""} className="field tnum" />
            </Field>
          </div>
          <Field label="Gasto mínimo para ganar sello ($)" hint="Vacío o 0: cualquier visita con un servicio cuenta" className="sm:w-1/2">
            <input name="stampMinAmount" inputMode="decimal" defaultValue={p.stampMinAmount || ""} placeholder="0" className="field tnum" />
          </Field>
          <p className="rounded-xl bg-hover px-4 py-3 text-sm">
            Así lo verán tus clientes: <strong>“Junta {Number(required) || "…"} sellos y gana {label}”</strong>. Se da un sello por visita al cobrar
            un servicio; la visita en la que usa su premio no suma sello. Cancelar la venta lo revierte.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="autoLoyaltyMsgs" defaultChecked={p.autoLoyaltyMsgs} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
            <span>Avisar por WhatsApp cuando le falte un sello y cuando gane su premio <span className="text-muted">(solo a quien acepta promociones)</span></span>
          </label>
        </div>
      )}

      {mode === "POINTS" && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Puntos por cada peso" hint="1 = un punto por peso pagado (sin propina)">
            <input name="pointsPerPeso" inputMode="decimal" defaultValue={p.pointsPerPeso || 1} className="field tnum" />
          </Field>
          <Field label="Cada punto vale ($)" hint="0.05 = 5 centavos (regresa el 5% de lo que gasta)">
            <input name="pesoPerPoint" inputMode="decimal" defaultValue={p.pesoPerPoint} className="field tnum" />
          </Field>
        </div>
      )}

      {mode !== p.mode && p.mode !== "OFF" && (
        <p className="mt-4 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
          Al cambiar de programa, los saldos actuales de tus clientes se conservan pero dejan de mostrarse y de usarse hasta que regreses al anterior.
        </p>
      )}
    </div>
  );
}
