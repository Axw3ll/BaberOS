"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, CalendarDays, Home, LayoutGrid, ListChecks, Megaphone, Package, Receipt, Scissors, Settings, Users, UsersRound, X,
} from "lucide-react";

const ITEMS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  hoy: { label: "Hoy", icon: Home },
  agenda: { label: "Agenda", icon: CalendarDays },
  ventas: { label: "Ventas", icon: Receipt },
  clientes: { label: "Clientes", icon: Users },
  seguimiento: { label: "Seguimiento", icon: ListChecks },
  campanas: { label: "Campañas", icon: Megaphone },
  reportes: { label: "Reportes", icon: BarChart3 },
  productos: { label: "Productos", icon: Package },
  servicios: { label: "Servicios", icon: Scissors },
  equipo: { label: "Equipo", icon: UsersRound },
  ajustes: { label: "Ajustes", icon: Settings },
};

/** Agrupación del menú lateral */
const GROUPS: { title?: string; items: string[] }[] = [
  { items: ["hoy", "agenda", "ventas"] },
  { title: "Clientes", items: ["clientes", "seguimiento", "campanas"] },
  { title: "Negocio", items: ["reportes", "productos", "servicios", "equipo", "ajustes"] },
];

/** Las 4 que van fijas abajo en el celular; el resto vive en "Más". */
const MOBILE_MAIN = ["hoy", "agenda", "ventas", "clientes"];

function useActive() {
  const path = usePathname();
  return (s: string) => path === `/${s}` || path.startsWith(`/${s}/`) || (s === "agenda" && path.startsWith("/citas"));
}

export function Nav({ sections, badges = {} }: { sections: string[]; badges?: Record<string, number> }) {
  const isActive = useActive();
  return (
    <nav aria-label="Secciones" className="space-y-6">
      {GROUPS.map((g, i) => {
        const items = g.items.filter((s) => sections.includes(s));
        if (!items.length) return null;
        return (
          <div key={i}>
            {g.title && <p className="mb-1.5 px-3 text-xs font-semibold tracking-wide text-faint uppercase">{g.title}</p>}
            <ul className="space-y-0.5">
              {items.map((s) => {
                const { label, icon: Icon } = ITEMS[s];
                const active = isActive(s);
                return (
                  <li key={s}>
                    <Link href={`/${s}`} aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[0.95rem] font-medium transition-colors ${
                        active ? "bg-brand-soft text-brand" : "text-muted hover:bg-hover hover:text-fg"
                      }`}>
                      <Icon className="size-[18px] shrink-0" />
                      <span className="flex-1">{label}</span>
                      {badges[s] ? <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-on-brand tnum">{badges[s]}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Barra inferior para celular, como una app. */
export function MobileNav({ sections, badges = {}, footer }: { sections: string[]; badges?: Record<string, number>; footer?: React.ReactNode }) {
  const isActive = useActive();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const main = MOBILE_MAIN.filter((s) => sections.includes(s));
  const rest = sections.filter((s) => !main.includes(s));
  const restActive = rest.some(isActive);

  const tab = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors";
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-fg/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      {open && (
        <div role="dialog" aria-label="Más secciones" className="fixed inset-x-3 bottom-[76px] z-50 rounded-2xl border border-line-soft bg-surface p-3 shadow-pop lg:hidden">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold">Más</span>
            <button onClick={() => setOpen(false)} className="btn-ghost p-1.5" aria-label="Cerrar"><X className="size-4" /></button>
          </div>
          <ul className="grid grid-cols-3 gap-2">
            {rest.map((s) => {
              const { label, icon: Icon } = ITEMS[s];
              return (
                <li key={s}>
                  <Link href={`/${s}`} className={`relative flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-medium ${isActive(s) ? "bg-brand-soft text-brand" : "bg-hover text-fg"}`}>
                    <Icon className="size-5" />{label}
                    {badges[s] ? <span className="absolute top-1.5 right-2 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-on-brand">{badges[s]}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          {footer && <div className="mt-3 border-t border-line-soft px-1 pt-3">{footer}</div>}
        </div>
      )}
      <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {main.map((s) => {
          const { label, icon: Icon } = ITEMS[s];
          const active = isActive(s);
          return (
            <Link key={s} href={`/${s}`} aria-current={active ? "page" : undefined} className={`${tab} ${active ? "text-brand" : "text-muted"}`}>
              <Icon className="size-5" />{label}
            </Link>
          );
        })}
        {rest.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${tab} relative ${restActive || open ? "text-brand" : "text-muted"}`}>
            <LayoutGrid className="size-5" />Más
            {rest.some((s) => badges[s]) && <span className="absolute top-1.5 right-[calc(50%-14px)] size-2 rounded-full bg-brand" aria-hidden />}
          </button>
        )}
      </nav>
    </>
  );
}
