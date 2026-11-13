"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { error?: string; ok?: string } | void;
type Action = (prev: ActionResult, data: FormData) => Promise<ActionResult>;

/** Formulario con server action, mensaje de error/éxito y botón con estado. */
export function ActionForm({ action, children, className = "", resetOnOk = false }: {
  action: Action; children: React.ReactNode; className?: string; resetOnOk?: boolean;
}) {
  const [state, run] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnOk && state?.ok) ref.current?.reset();
  }, [state, resetOnOk]);

  return (
    <form ref={ref} action={run} className={className}>
      {children}
      {state?.error && <p role="alert" className="mt-3 text-sm text-rose">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-3 text-sm text-sage">{state.ok}</p>}
    </form>
  );
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
