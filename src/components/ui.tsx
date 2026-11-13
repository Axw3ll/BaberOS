import Link from "next/link";
import { ChevronLeft, Inbox } from "lucide-react";
import type { AppointmentStatus } from "@/generated/prisma/enums";

export function PageHeader({ title, subtitle, actions, back }: {
  title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string };
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-brand">
            <ChevronLeft className="size-4" aria-hidden /> {back.label}
          </Link>
        )}
        <h1 className="font-display text-2xl leading-tight text-fg sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1.5 text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="section-title mb-4 flex items-center justify-between gap-4">
      <h2 className="font-display text-lg text-fg">{children}</h2>
      {aside && <div className="text-sm text-muted">{aside}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-12 text-center">
      <span className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-brand-soft text-brand"><Inbox className="size-5" aria-hidden /></span>
      <p className="font-display text-lg text-fg">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export const STATUS: Record<AppointmentStatus, { label: string; color: string }> = {
  PENDING: { label: "Por confirmar", color: "var(--color-warning)" },
  CONFIRMED: { label: "Confirmada", color: "var(--color-brand)" },
  IN_PROGRESS: { label: "En silla", color: "var(--color-info)" },
  COMPLETED: { label: "Terminada", color: "var(--color-success)" },
  CANCELLED: { label: "Cancelada", color: "var(--color-faint)" },
  NO_SHOW: { label: "No llegó", color: "var(--color-danger)" },
};

export function Status({ status }: { status: AppointmentStatus }) {
  const s = STATUS[status];
  return <Dot color={s.color}>{s.label}</Dot>;
}

export function Field({ label, hint, children, className = "" }: {
  label: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

/** Lista con filas separadas por líneas finas — el contenedor estándar de datos */
export function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="rows">{children}</ul>;
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="-mx-4 flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-hover">
        {children}
      </Link>
    </li>
  );
}

export function Figure({ value, label, icon: Icon, tone = "brand" }: {
  value: React.ReactNode; label: string; icon?: React.ComponentType<{ className?: string }>; tone?: "brand" | "success" | "warning" | "danger";
}) {
  const tones = { brand: "bg-brand-soft text-brand", success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning", danger: "bg-danger/10 text-danger" };
  return (
    <div className="card flex flex-col items-start gap-2.5 p-4 sm:flex-row sm:gap-3">
      {Icon && <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="size-[18px]" /></span>}
      <div className="min-w-0">
        <div className="text-sm text-muted">{label}</div>
        <div className="mt-0.5 font-display text-lg leading-snug text-fg tnum sm:text-xl">{value}</div>
      </div>
    </div>
  );
}

/** Fila de tarjetas de cifras que se acomoda sola en celular y escritorio. */
export function Figures({ children, className = "mb-8" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] ${className}`}>{children}</div>;
}

/** Pastilla con punto de color y fondo teñido. Para estados de cita y etapas del cliente. */
export function Dot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-fg"
      style={{ background: `color-mix(in srgb, ${color} 13%, transparent)` }}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

export function Chip({ color, children, href, active }: { color?: string; children: React.ReactNode; href?: string; active?: boolean }) {
  const cls = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-muted"
  } ${href && !active ? "hover:border-faint hover:text-fg" : ""}`;
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
    <span className="block h-2 w-full overflow-hidden rounded-full bg-hover" aria-hidden>
      <span className="block h-full rounded-full bg-brand" style={{ width: `${w}%` }} />
    </span>
  );
}
