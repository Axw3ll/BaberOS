import Link from "next/link";
import type { AppointmentStatus } from "@/generated/prisma/enums";

export function PageHeader({ title, subtitle, actions, back }: {
  title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string };
}) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-3 inline-block text-sm text-ash transition-colors hover:text-foam">
            ‹ {back.label}
          </Link>
        )}
        <h1 className="font-display text-3xl leading-tight text-foam sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-ash">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line-soft pb-2">
      <h2 className="font-display text-xl text-foam">{children}</h2>
      {aside && <div className="text-sm text-ash">{aside}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-xl text-foam">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-ash">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export const STATUS: Record<AppointmentStatus, { label: string; color: string }> = {
  PENDING: { label: "Por confirmar", color: "var(--color-sand)" },
  CONFIRMED: { label: "Confirmada", color: "var(--color-nickel)" },
  IN_PROGRESS: { label: "En silla", color: "var(--color-foam)" },
  COMPLETED: { label: "Terminada", color: "var(--color-sage)" },
  CANCELLED: { label: "Cancelada", color: "var(--color-ash-2)" },
  NO_SHOW: { label: "No llegó", color: "var(--color-rose)" },
};

export function Status({ status }: { status: AppointmentStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ash">
      <span className="size-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
      {s.label}
    </span>
  );
}

export function Field({ label, hint, children, className = "" }: {
  label: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ash-2">{hint}</span>}
    </label>
  );
}

/** Lista con filas separadas por líneas finas — el contenedor estándar de datos */
export function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-line-soft border-y border-line-soft">{children}</ul>;
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="-mx-3 flex items-center gap-4 rounded-md px-3 py-3.5 transition-colors hover:bg-ink-2">
        {children}
      </Link>
    </li>
  );
}

export function Figure({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl text-foam tnum">{value}</div>
      <div className="mt-0.5 text-sm text-ash">{label}</div>
    </div>
  );
}

/** Punto de color + texto, como los estados de cita. Para etapas del cliente. */
export function Dot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ash">
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

export function Chip({ color, children, href, active }: { color?: string; children: React.ReactNode; href?: string; active?: boolean }) {
  const cls = `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
    active ? "border-nickel bg-ink-3 text-foam" : "border-line text-ash"
  } ${href ? "hover:border-ash-2 hover:text-foam" : ""}`;
  const inner = (
    <>
      {color && <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </>
  );
  return href ? <Link href={href} className={cls} aria-current={active ? "true" : undefined}>{inner}</Link> : <span className={cls}>{inner}</span>;
}

/** Barra horizontal simple para reportes. value/max en la misma unidad. */
export function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-ink-3" aria-hidden>
      <span className="block h-full rounded-full bg-nickel" style={{ width: `${w}%` }} />
    </span>
  );
}
