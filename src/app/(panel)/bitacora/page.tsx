import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/audit";
import { dateTimeLabel } from "@/lib/time";
import { initials } from "@/lib/format";
import { Chip, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Bitácora" };

const TONE: Partial<Record<AuditAction, string>> = {
  "venta.cancelada": "var(--color-danger)", "venta.descuento": "var(--color-warning)", "cliente.borrado": "var(--color-danger)",
  "cita.cancelada": "var(--color-faint)", "precio.cambio": "var(--color-info)", "comision.pago": "var(--color-success)",
  "caja.corte": "var(--color-success)", "inventario.ajuste": "var(--color-warning)",
};

export default async function BitacoraPage({ searchParams }: { searchParams: Promise<{ a?: string; s?: string }> }) {
  const { shop } = await requireSection("bitacora");
  const { a, s } = await searchParams;
  const action = a && a in AUDIT_ACTIONS ? a : undefined;
  const [logs, staff] = await Promise.all([
    prisma.auditLog.findMany({
      where: { shopId: shop.id, ...(action && { action }), ...(s && { staffId: s }) },
      include: { staff: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 300,
    }),
    prisma.staff.findMany({ where: { shopId: shop.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const href = (p: { a?: string; s?: string }) => {
    const q = new URLSearchParams(Object.entries({ a: action, s, ...p }).filter(([, v]) => v) as [string, string][]).toString();
    return q ? `/bitacora?${q}` : "/bitacora";
  };

  return (
    <>
      <PageHeader title="Bitácora" subtitle="Quién hizo qué: cobros, descuentos, cancelaciones, cambios de precio, pagos y cortes." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Chip href={href({ a: undefined })} active={!action}>Todo</Chip>
        {(Object.keys(AUDIT_ACTIONS) as AuditAction[]).map((k) => (
          <Chip key={k} href={href({ a: k })} active={action === k} color={TONE[k]}>{AUDIT_ACTIONS[k]}</Chip>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <Chip href={href({ s: undefined })} active={!s}>Todo el equipo</Chip>
        {staff.map((p) => <Chip key={p.id} href={href({ s: p.id })} active={s === p.id}>{p.name}</Chip>)}
      </div>

      {logs.length === 0 ? <Empty title="Nada registrado todavía">Aquí aparecerán los movimientos importantes del equipo.</Empty> : (
        <ul className="rows">
          {logs.map((l) => (
            <li key={l.id} className="flex items-start gap-3 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{l.staff ? initials(l.staff.name) : "—"}</span>
              <span className="min-w-0 flex-1">
                <span className="block">{l.summary}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full" style={{ background: TONE[l.action as AuditAction] ?? "var(--color-brand)" }} />
                    {AUDIT_ACTIONS[l.action as AuditAction] ?? l.action}
                  </span>
                  · {l.staff?.name ?? "Sistema"} · {dateTimeLabel(l.createdAt, shop.timezone)}
                  {l.entityType === "sale" && l.entityId && <Link href={`/ventas/${l.entityId}`} className="link">ver venta</Link>}
                  {l.entityType === "customer" && l.entityId && <Link href={`/clientes/${l.entityId}`} className="link">ver cliente</Link>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
