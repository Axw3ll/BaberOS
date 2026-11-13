"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/** Si algo falla dentro del panel, se ve esto en lugar de una pantalla en blanco. */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-danger/10 text-danger"><AlertTriangle className="size-6" /></span>
      <h1 className="font-display text-xl">Algo salió mal</h1>
      <p className="mt-2 text-muted">No se pudo cargar esta pantalla. Intenta de nuevo; si sigue pasando, avísanos{error.digest ? ` con este código: ${error.digest}` : ""}.</p>
      <button onClick={reset} className="btn-primary mt-6">Reintentar</button>
    </div>
  );
}
