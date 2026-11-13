import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Clock, CreditCard, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isSuperadmin, requireUser } from "@/lib/auth";
import { accessFor, PLANS, type PaidPlan } from "@/lib/billing";
import { money } from "@/lib/format";
import { Dot, Figure, Figures } from "@/components/ui";
import { activateManual, enterSupport, extendTrial, suspend } from "./actions";

export const metadata = { title: "Administración", robots: { index: false } };

const STATE = {
  free: { label: "Sin cobro", color: "var(--color-faint)" },
  trial: { label: "Prueba", color: "var(--color-brand)" },
  active: { label: "Activa", color: "var(--color-success)" },
  past_due: { label: "Pago fallido", color: "var(--color-warning)" },
  expired: { label: "Vencida", color: "var(--color-danger)" },
} as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  if (!isSuperadmin(user.email)) notFound();
  const { q = "" } = await searchParams;

  const shops = await prisma.barbershop.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { owner: { email: { contains: q, mode: "insensitive" } } }] } : {},
    include: { owner: true, _count: { select: { customers: true, staff: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const ids = shops.map((s) => s.id);
  const [activity, appts30] = await Promise.all([
    prisma.appointment.groupBy({ by: ["shopId"], where: { shopId: { in: ids } }, _max: { createdAt: true } }),
    prisma.appointment.groupBy({ by: ["shopId"], where: { shopId: { in: ids }, createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }, _count: true }),
  ]);
  const last = new Map(activity.map((a) => [a.shopId, a._max.createdAt]));
  const recent = new Map(appts30.map((a) => [a.shopId, a._count]));

  const rows = shops.map((s) => ({ s, a: accessFor(s) }));
  const paying = rows.filter((r) => r.a.state === "active" || r.a.state === "past_due");
  const mrr = paying.reduce((sum, r) => sum + (PLANS[r.s.plan as PaidPlan]?.price ?? 0), 0);
  const ago = (d: Date | null | undefined) => {
    if (!d) return "—";
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    return days === 0 ? "hoy" : `hace ${days} d`;
  };

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl">Administración de BarberOS</h1>
            <p className="text-muted">Todas las barberías, su plan y su uso.</p>
          </div>
          <form><input name="q" defaultValue={q} placeholder="Buscar barbería o correo" className="field w-64" /></form>
        </div>
        <Figures>
          <Figure icon={Building2} value={shops.length} label="Barberías" />
          <Figure icon={CreditCard} tone="success" value={paying.length} label="Pagando" />
          <Figure icon={Clock} value={rows.filter((r) => r.a.state === "trial").length} label="En prueba" />
          <Figure icon={TrendingUp} tone="success" value={money(mrr, true)} label="Ingreso mensual" />
        </Figures>

        <div className="table-card">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-2.5 pr-4 font-normal">Barbería</th>
                <th className="py-2.5 pr-4 font-normal">Estado</th>
                <th className="py-2.5 pr-4 text-right font-normal">Clientes</th>
                <th className="py-2.5 pr-4 text-right font-normal">Equipo</th>
                <th className="py-2.5 pr-4 text-right font-normal">Citas 30 d</th>
                <th className="py-2.5 pr-4 font-normal">Última cita creada</th>
                <th className="py-2.5 font-normal">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map(({ s, a }) => (
                <tr key={s.id} className="align-top">
                  <td className="py-3 pr-4">
                    <span className="block font-medium">{s.name}</span>
                    <span className="block text-muted">{s.owner.email}</span>
                    <Link href={`/b/${s.slug}`} target="_blank" className="text-xs text-faint hover:text-brand">/b/{s.slug}</Link>
                  </td>
                  <td className="py-3 pr-4">
                    <Dot color={STATE[a.state].color}>{STATE[a.state].label}{a.state === "active" && ` · ${PLANS[s.plan as PaidPlan]?.name ?? s.plan}`}</Dot>
                    {a.daysLeft !== null && a.state !== "expired" && <span className="mt-1 block text-xs text-muted">{a.daysLeft} días restantes</span>}
                    {s.subscriptionStatus === "manual" && <span className="block text-xs text-muted">Pago manual</span>}
                  </td>
                  <td className="py-3 pr-4 text-right tnum">{s._count.customers}</td>
                  <td className="py-3 pr-4 text-right tnum">{s._count.staff}</td>
                  <td className="py-3 pr-4 text-right tnum">{recent.get(s.id) ?? 0}</td>
                  <td className="py-3 pr-4 text-muted">{ago(last.get(s.id))}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <form action={enterSupport}><input type="hidden" name="id" value={s.id} /><button className="btn-quiet px-2.5 py-1 text-xs">Entrar (soporte)</button></form>
                      <form action={extendTrial}><input type="hidden" name="id" value={s.id} /><button className="btn-ghost px-2 py-1 text-xs">+14 días prueba</button></form>
                      <form action={activateManual} className="flex gap-1">
                        <input type="hidden" name="id" value={s.id} />
                        <button name="plan" value="BASIC" className="btn-ghost px-2 py-1 text-xs">+30 d Básico</button>
                        <button name="plan" value="PRO" className="btn-ghost px-2 py-1 text-xs">+30 d Pro</button>
                      </form>
                      <form action={suspend}><input type="hidden" name="id" value={s.id} /><button className="btn-ghost px-2 py-1 text-xs text-danger">Suspender</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
