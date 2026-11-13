import Link from "next/link";
import { Scissors } from "lucide-react";

/** Datos de quien vende BarberOS. Se configuran con variables de entorno. */
export const LEGAL = {
  name: process.env.LEGAL_NAME || "[Nombre o razón social del proveedor de BarberOS]",
  email: process.env.LEGAL_EMAIL || "[correo de contacto]",
  address: process.env.LEGAL_ADDRESS || "[domicilio]",
  updated: "13 de noviembre de 2026",
};

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-12">
      <article className="card mx-auto max-w-3xl p-6 sm:p-10">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-on-brand"><Scissors className="size-4" /></span>
          <span className="font-display text-lg">BarberOS</span>
        </Link>
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Última actualización: {LEGAL.updated}</p>
        <div className="mt-8 space-y-4 leading-relaxed text-fg [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted [&_ul]:space-y-1.5 [&_ul]:text-muted">
          {children}
        </div>
      </article>
    </main>
  );
}
