"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { error?: string; ok?: string; /** muestra `onError` (p. ej. "hacerlo de todos modos") */ canForce?: boolean } | void;
type Action = (prev: ActionResult, data: FormData) => Promise<ActionResult>;

/** Formulario con server action, mensaje de error/éxito y botón con estado. */
export function ActionForm({ action, children, className = "", resetOnOk = false, onError }: {
  action: Action; children: React.ReactNode; className?: string; resetOnOk?: boolean;
  /** Se muestra junto al error cuando la acción responde canForce (p. ej. un botón para hacerlo de todos modos). */
  onError?: React.ReactNode;
}) {
  // Lo último que se envió: si la acción responde con error, se vuelve a poner en el formulario
  // (React limpia los campos después de cada envío y no queremos que se pierda lo capturado).
  const last = useRef<FormData | null>(null);
  const [state, run] = useActionState((prev: ActionResult, data: FormData) => {
    last.current = data;
    return action(prev, data);
  }, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnOk && state?.ok) ref.current?.reset();
    if (state?.error && last.current && ref.current) restore(ref.current, last.current);
  }, [state, resetOnOk]);

  return (
    <form ref={ref} action={run} className={className}>
      {children}
      {state?.error && <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p>}
      {state?.error && state.canForce && onError}
      {state?.ok && <p role="status" className="mt-3 text-sm text-success">{state.ok}</p>}
    </form>
  );
}

function restore(form: HTMLFormElement, data: FormData) {
  const seen = new Map<string, number>();
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) || !el.name) continue;
    if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "submit" || el.type === "file" || el.type === "password")) continue;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      el.checked = data.getAll(el.name).includes(el.value);
    } else if (el instanceof HTMLSelectElement && el.multiple) {
      const values = data.getAll(el.name);
      for (const o of Array.from(el.options)) o.selected = values.includes(o.value);
    } else {
      // Campos con el mismo nombre (p. ej. bloques de horario): se respetan en orden
      const i = seen.get(el.name) ?? 0;
      seen.set(el.name, i + 1);
      const v = data.getAll(el.name)[i];
      if (v !== undefined) el.value = String(v);
    }
  }
}

export function Submit({ children, pending = "Guardando…", className = "btn-primary", name, value }: {
  children: React.ReactNode; pending?: string; className?: string; name?: string; value?: string;
}) {
  const { pending: p } = useFormStatus();
  return (
    <button type="submit" disabled={p} className={className} name={name} value={value}>
      {p ? pending : children}
    </button>
  );
}
