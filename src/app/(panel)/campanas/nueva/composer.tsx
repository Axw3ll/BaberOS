"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { createCampaign } from "../actions";

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(nombre|barberia|enlace|puntos)\}/g, (_, k) => v[k] ?? "");

export function Composer({ audiences, presets, initialAudience, sample }: {
  audiences: { id: string; label: string; count: number }[];
  presets: { id: string; label: string; text: string }[];
  initialAudience: string;
  sample: { nombre: string; barberia: string; enlace: string; puntos: string };
}) {
  const [audience, setAudience] = useState(initialAudience);
  const [message, setMessage] = useState(presets[0]?.text ?? "");
  const [name, setName] = useState("");
  const count = audiences.find((a) => a.id === audience)?.count ?? 0;

  return (
    <ActionForm action={createCampaign} className="grid gap-12 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Field label="Nombre de la campaña">
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required className="field" placeholder="Te extrañamos, noviembre" />
        </Field>
        <Field label="Para quién" hint="Solo se incluye a quienes aceptan promociones.">
          <select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} className="field">
            {audiences.map((a) => <option key={a.id} value={a.id} disabled={a.count === 0}>{a.label} ({a.count})</option>)}
          </select>
        </Field>
        <div>
          <span className="label">Plantillas</span>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p.id} type="button" onClick={() => { setMessage(p.text); if (!name) setName(p.label); }}
                className="rounded-full border border-line px-3 py-1 text-sm text-ash transition-colors hover:border-ash-2 hover:text-foam">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Mensaje" hint="Variables: {nombre} {barberia} {enlace} {puntos}. Se cambian por los datos de cada cliente.">
          <textarea name="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={6} required maxLength={1000} className="field" />
        </Field>
        <Submit pending="Preparando…">{count ? `Preparar envío a ${count} ${count === 1 ? "cliente" : "clientes"}` : "Preparar envío"}</Submit>
      </div>

      <aside>
        <span className="label">Así le llega a {sample.nombre}</span>
        <div className="rounded-lg border border-line bg-ink-2 p-4">
          <p className="max-w-[28ch] rounded-lg rounded-tl-sm bg-ink-3 px-3 py-2 text-sm whitespace-pre-line">{fill(message, sample) || "…"}</p>
        </div>
        <p className="mt-4 text-sm text-ash">
          Después verás la lista de clientes con un botón para abrir WhatsApp con el mensaje escrito. Así no hace falta una cuenta de WhatsApp Business ni plantillas aprobadas.
        </p>
      </aside>
    </ActionForm>
  );
}
