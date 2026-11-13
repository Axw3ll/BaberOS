"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  hoy: "Hoy", agenda: "Agenda", ventas: "Ventas", clientes: "Clientes",
  seguimiento: "Seguimiento", campanas: "Campañas", reportes: "Reportes",
  productos: "Productos", servicios: "Servicios", equipo: "Equipo", ajustes: "Ajustes",
};

export function Nav({ sections }: { sections: string[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
      {sections.map((s) => {
        const active = path === `/${s}` || path.startsWith(`/${s}/`) || (s === "agenda" && path.startsWith("/citas"));
        return (
          <Link
            key={s}
            href={`/${s}`}
            aria-current={active ? "page" : undefined}
            className={`relative shrink-0 rounded-md px-3 py-2 text-[0.95rem] transition-colors ${
              active ? "bg-ink-2 text-foam" : "text-ash hover:text-foam"
            }`}
          >
            {active && <span className="absolute inset-y-2 left-0 hidden w-px bg-nickel lg:block" aria-hidden />}
            {LABELS[s]}
          </Link>
        );
      })}
    </nav>
  );
}
