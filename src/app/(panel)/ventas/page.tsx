import Link from "next/link";
import { Banknote, CreditCard, HandCoins, Percent, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { addDays, dateLabel, isDate, localToUtc, timeLabel, today } from "@/lib/time";
import { money } from "@/lib/format";
import { Empty, Figure, PageHeader } from "@/components/ui";

export const metadata = { title: "Ventas" };
const METHOD = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia" } as const;

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { shop, me } = await requireSection("ventas");
  const tz = shop.timezone;
  const sp = await searchParams;
  const day = isDate(sp.d) ? sp.d : today(tz);
  const from = localToUtc(day, 0, tz), to = localToUtc(day, 1440, tz);
  const own = seesOnlyOwnAgenda(me.role);

  const sales = await prisma.sale.findMany({
    where: {
      shopId: shop.id, createdAt: { gte: from, lt: to },
      ...(own && { OR: [{ chargedById: me.id }, { items: { some: { staffId: me.id } } }] }),
    },
    include: { customer: true, chargedBy: true, payments: true, items: true },
    orderBy: { createdAt: "desc" },
  });
  const paid = sales.filter((s) => s.status === "PAID");
  const byMethod = (m: keyof typeof METHOD) =>
    paid.flatMap((s) => s.payments).filter((p) => p.method === m).reduce((a, p) => a + Number(p.amount), 0);
  const tips = paid.reduce((a, s) => a + Number(s.tip), 0);
  const commission = own
    ? paid.flatMap((s) => s.items).filter((i) => i.staffId === me.id).reduce((a, i) => a + Number(i.commission), 0)
    : paid.flatMap((s) => s.items).reduce((a, i) => a + Number(i.commission), 0);

  return (
    <>
      <PageHeader
        title="Ventas"
        subtitle={dateLabel(day)}
        actions={
          <>
            <nav aria-label="Cambiar día" className="flex items-center rounded-md border border-line">
              <Link href={`/ventas?d=${addDays(day, -1)}`} className="px-3 py-2 text-muted hover:text-fg" aria-label="Día anterior">‹</Link>
              <Link href="/ventas" className="border-x border-line px-3 py-2 text-sm">Hoy</Link>
              <Link href={`/ventas?d=${addDays(day, 1)}`} className="px-3 py-2 text-muted hover:text-fg" aria-label="Día siguiente">›</Link>
            </nav>
            {!own && <Link href="/ventas/corte" className="btn-quiet">Corte de caja</Link>}
            <Link href="/ventas/comisiones" className="btn-quiet">Comisiones</Link>
            <Link href="/ventas/nueva" className="btn-primary">Nueva venta</Link>
          </>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
        {!own && <Figure value={money(paid.reduce((a, s) => a + Number(s.total), 0))} label="Total del día" icon={Wallet} />}
        {!own && <Figure value={money(byMethod("CASH"))} label="En efectivo" icon={Banknote} tone="success" />}
        {!own && <Figure value={money(byMethod("CARD") + byMethod("TRANSFER"))} label="Tarjeta y transferencia" icon={CreditCard} />}
        <Figure value={money(commission)} label={own ? "Tu comisión" : "Comisiones"} icon={Percent} />
        {tips > 0 && <Figure value={money(tips)} label="Propinas" icon={HandCoins} tone="success" />}
      </div>

      {sales.length === 0 ? (
        <Empty title="Sin ventas este día" action={<Link href="/ventas/nueva" className="btn-quiet">Registrar una venta</Link>}>
          Cada cobro que hagas aparece aquí con su folio.
        </Empty>
      ) : (
        <div className="table-card">
          <table className="w-full min-w-[640px] text-left">
            <thead className="text-sm text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-normal">Folio</th>
                <th className="py-2 pr-4 font-normal">Hora</th>
                <th className="py-2 pr-4 font-normal">Cliente</th>
                <th className="py-2 pr-4 font-normal">Concepto</th>
                <th className="py-2 pr-4 font-normal">Pago</th>
                <th className="py-2 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {sales.map((s) => (
                <tr key={s.id} className={s.status === "VOIDED" ? "text-faint line-through" : ""}>
                  <td className="py-3 pr-4 tnum"><Link href={`/ventas/${s.id}`} className="link">#{s.folio}</Link></td>
                  <td className="py-3 pr-4 tnum text-muted">{timeLabel(s.createdAt, tz)}</td>
                  <td className="py-3 pr-4">{s.customer?.name ?? <span className="text-faint">Mostrador</span>}</td>
                  <td className="max-w-64 truncate py-3 pr-4 text-muted">{s.items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name)).join(", ")}</td>
                  <td className="py-3 pr-4 text-muted">{s.payments[0] ? METHOD[s.payments[0].method] : "—"}</td>
                  <td className="py-3 text-right tnum">{money(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
