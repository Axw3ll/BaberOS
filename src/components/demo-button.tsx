"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { PlayCircle } from "lucide-react";
import { startDemo } from "@/app/demo/actions";

function Inner({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={className}>
      <PlayCircle className="size-5" aria-hidden />
      {pending ? "Preparando tu barbería de ejemplo…" : label}
    </button>
  );
}

/** "Ver demo": entra a una barbería de ejemplo sin registrarse. */
export function DemoButton({ label = "Ver demo en vivo", className = "btn-quiet px-6 py-3 text-base" }: { label?: string; className?: string }) {
  const [state, run] = useActionState(startDemo, undefined);
  return (
    <form action={run} className="contents">
      <Inner label={label} className={className} />
      {state?.error && <p role="alert" className="basis-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}
