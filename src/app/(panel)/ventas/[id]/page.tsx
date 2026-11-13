import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection } from "@/lib/auth";
import { dateTimeLabel } from "@/lib/time";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { cancelSale } from "../actions";

export const metadata = { title: "Venta" };
const METHOD = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia" } as const;

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const { id } = await params;
  const { nueva } = await searchParams;
  const { shop, me } = await requireSection("ventas");
  const sale = await prisma.sale.findFirst({
    where: { id, shopId: shop.id },
    include: { items: { include: { staff: true } }, payments: true, customer: true, chargedBy: true, appointment: true },
  });
  if (!sale) notFound();
  const voided = sale.status === "VOIDED";

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

      <article className="mx-auto max-w-sm rounded-lg border border-line px-8 py-10 print:border-0 print:text-black">
        <header className="text-center">
          <p className="font-display text-2xl">{shop.name}</p>
          {shop.address && <p className="mt-1 text-sm text-ash">{shop.address}</p>}
          <p className="mt-4 text-sm text-ash tnum">Folio {sale.folio}, {dateTimeLabel(sale.createdAt, shop.timezone)}</p>
          {sale.customer && <p className="text-sm text-ash">{sale.customer.name}</p>}
        </header>

        <ul className="mt-8 space-y-3 border-t border-dashed border-line pt-6 text-sm">
          {sale.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4">
              <span>
                {i.quantity > 1 && <span className="tnum">{i.quantity} × </span>}{i.name}
                {i.staff && <span className="block text-xs text-ash">{i.staff.name}</span>}
              </span>
              <span className="tnum">{money(i.total)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-6 space-y-1.5 border-t border-dashed border-line pt-6 text-sm">
          <div className="flex justify-between"><dt className="text-ash">Subtotal</dt><dd className="tnum">{money(sale.subtotal)}</dd></div>
          {Number(sale.discount) > 0 && <div className="flex justify-between"><dt className="text-ash">Descuento</dt><dd className="tnum">−{money(sale.discount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-ash">IVA incluido</dt><dd className="tnum">{money(sale.tax)}</dd></div>
          {Number(sale.tip) > 0 && <div className="flex justify-between"><dt className="text-ash">Propina</dt><dd className="tnum">{money(sale.tip)}</dd></div>}
          <div className="flex items-baseline justify-between pt-3"><dt>Total</dt><dd className="font-display text-2xl tnum">{money(sale.total)}</dd></div>
          {sale.payments.map((p) => (
            <div key={p.id} className="flex justify-between text-ash"><dt>{METHOD[p.method]}</dt><dd className="tnum">{money(p.amount)}</dd></div>
          ))}
        </dl>
        <p className="mt-10 text-center text-sm text-ash">Gracias por tu visita</p>
      </article>

      {!voided && canAccess(me.role, "ajustes") && (
        <form action={cancelSale} className="mt-10 text-center print:hidden">
          <input type="hidden" name="id" value={sale.id} />
          <button className="btn-ghost text-rose">Cancelar venta y regresar productos al inventario</button>
        </form>
      )}
    </>
  );
}
