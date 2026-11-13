import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection } from "@/lib/auth";
import { addDays, dateLabel, dateTimeLabel, timeLabel, toLocalDate, today } from "@/lib/time";
import { CalendarPlus } from "lucide-react";
import { customerStats } from "@/lib/crm";
import { slotsFrom } from "@/lib/booking";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { cancelSale, rebook } from "../actions";

export const metadata = { title: "Venta" };
const METHOD = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia" } as const;

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string; ocupado?: string }> }) {
  const { id } = await params;
  const { nueva, ocupado } = await searchParams;
  const { shop, me } = await requireSection("ventas");
  const sale = await prisma.sale.findFirst({
    where: { id, shopId: shop.id },
    include: { items: { include: { staff: true } }, payments: true, customer: true, chargedBy: true, appointment: true },
  });
  if (!sale) notFound();
  const voided = sale.status === "VOIDED";
  const tz = shop.timezone;

  // Recién cobrada una cita: proponer la próxima visita según su frecuencia (si no tiene ya otra agendada)
  let rebookSlots: number[] = [], rebookIn = 0;
  if (nueva && sale.appointment && sale.customerId && canAccess(me.role, "agenda")) {
    const hasNext = await prisma.appointment.count({ where: { customerId: sale.customerId, startsAt: { gt: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } } });
    if (!hasNext) {
      const [stats] = await customerStats(shop.id, { customerId: sale.customerId, lostAfterDays: shop.lostAfterDays });
      rebookIn = Math.min(60, Math.max(7, stats?.cadence ?? 21));
      const services = await prisma.appointmentService.findMany({ where: { appointmentId: sale.appointment.id }, select: { serviceId: true } });
      rebookSlots = await slotsFrom({
        shopId: shop.id, staffId: sale.appointment.staffId, serviceIds: services.map((s) => s.serviceId),
        fromDate: addDays(today(tz), rebookIn), limit: 6,
      });
    }
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          back={{ href: "/ventas", label: "Ventas" }}
          title={`Venta #${sale.folio}`}
          subtitle={nueva ? "Cobro registrado." : voided ? "Esta venta está cancelada." : dateTimeLabel(sale.createdAt, shop.timezone)}
          actions={
            <>
              <Link href="/ventas/nueva" className="btn-primary">Nueva venta</Link>
              <PrintButton />
            </>
          }
        />
      </div>

      {rebookSlots.length > 0 && (
        <section className="card mx-auto mb-6 max-w-xl p-5 print:hidden">
          <p className="flex items-center gap-2 font-semibold"><CalendarPlus className="size-5 text-brand" />¿Le agendamos la próxima?</p>
          <p className="mt-1 text-sm text-muted">
            {sale.customer?.name.split(" ")[0]} suele venir cada {rebookIn} días. Mismo servicio y mismo barbero.
            {ocupado && <span className="text-danger"> Ese horario se acaba de ocupar; elige otro.</span>}
          </p>
          <form action={rebook} className="mt-4 flex flex-wrap gap-2">
            <input type="hidden" name="saleId" value={sale.id} />
            {rebookSlots.map((t) => (
              <button key={t} name="at" value={new Date(t).toISOString()} className="rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm transition hover:border-brand">
                <span className="block font-semibold">{dateLabel(toLocalDate(new Date(t), tz), { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="block text-muted tnum">{timeLabel(new Date(t), tz)}</span>
              </button>
            ))}
          </form>
        </section>
      )}

      <article className="mx-auto max-w-sm rounded-lg border border-line px-8 py-10 print:border-0 print:text-black">
        <header className="text-center">
          <p className="font-display text-2xl">{shop.name}</p>
          {shop.address && <p className="mt-1 text-sm text-muted">{shop.address}</p>}
          <p className="mt-4 text-sm text-muted tnum">Folio {sale.folio}, {dateTimeLabel(sale.createdAt, shop.timezone)}</p>
          {sale.customer && <p className="text-sm text-muted">{sale.customer.name}</p>}
        </header>

        <ul className="mt-8 space-y-3 border-t border-dashed border-line pt-6 text-sm">
          {sale.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4">
              <span>
                {i.quantity > 1 && <span className="tnum">{i.quantity} × </span>}{i.name}
                {i.staff && <span className="block text-xs text-muted">{i.staff.name}</span>}
              </span>
              <span className="tnum">{money(i.total)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-6 space-y-1.5 border-t border-dashed border-line pt-6 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tnum">{money(sale.subtotal)}</dd></div>
          {Number(sale.discount) > 0 && <div className="flex justify-between"><dt className="text-muted">Descuento{sale.pointsRedeemed > 0 && ` (incluye ${sale.pointsRedeemed} pts)`}{sale.rewardRedeemed && " (premio de la tarjeta)"}</dt><dd className="tnum">−{money(sale.discount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">IVA incluido</dt><dd className="tnum">{money(sale.tax)}</dd></div>
          {Number(sale.tip) > 0 && <div className="flex justify-between"><dt className="text-muted">Propina</dt><dd className="tnum">{money(sale.tip)}</dd></div>}
          <div className="flex items-baseline justify-between pt-3"><dt>Total</dt><dd className="font-display text-2xl tnum">{money(sale.total)}</dd></div>
          {sale.payments.map((p) => (
            <div key={p.id}>
              <div className="flex justify-between text-muted"><dt>{METHOD[p.method]}</dt><dd className="tnum">{money(p.received ?? p.amount)}</dd></div>
              {p.received && Number(p.received) > Number(p.amount) && (
                <div className="flex justify-between text-muted"><dt>Cambio</dt><dd className="tnum">{money(Number(p.received) - Number(p.amount))}</dd></div>
              )}
            </div>
          ))}
        </dl>
        <p className="mt-10 text-center text-sm text-muted">Gracias por tu visita</p>
      </article>

      {!voided && canAccess(me.role, "ajustes") && (
        <form action={cancelSale} className="mt-10 text-center print:hidden">
          <input type="hidden" name="id" value={sale.id} />
          <button className="btn-ghost text-danger">Cancelar venta y regresar productos al inventario</button>
        </form>
      )}
    </>
  );
}
