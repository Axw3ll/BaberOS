import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { dateLabel, timeLabel, toLocalDate } from "@/lib/time";
import { minutesLabel, money } from "@/lib/format";
import { PageHeader, SectionTitle, Status } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { saveNotes, setStatus } from "../../agenda/actions";

export const metadata = { title: "Cita" };

const SOURCE = { WALK_IN: "En persona", PHONE: "Teléfono o WhatsApp", ONLINE: "Reserva en línea" };

export default async function CitaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { shop, me } = await requireSection("agenda");
  const a = await prisma.appointment.findFirst({
    where: { id, shopId: shop.id, ...(seesOnlyOwnAgenda(me.role) && { staffId: me.id }) },
    include: { customer: true, staff: true, services: true, sale: true },
  });
  if (!a) notFound();
  const tz = shop.timezone;
  const day = toLocalDate(a.startsAt, tz);
  const total = a.services.reduce((s, x) => s + Number(x.price), 0);
  const minutes = a.services.reduce((s, x) => s + x.minutes, 0);
  const open = !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(a.status);

  const action = (status: string, label: string, cls = "btn-quiet") => (
    <form action={setStatus}>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="status" value={status} />
      <button className={cls}>{label}</button>
    </form>
  );

  return (
    <>
      <PageHeader
        back={{ href: `/agenda?d=${day}`, label: "Agenda" }}
        title={a.customer.name}
        subtitle={<>{dateLabel(day)}, de <span className="tnum">{timeLabel(a.startsAt, tz)} a {timeLabel(a.endsAt, tz)}</span> con {a.staff.name}</>}
        actions={<Status status={a.status} />}
      />

      {error === "ocupado" && (
        <p role="alert" className="-mt-4 mb-10 text-danger">Ese horario ya lo tomó otra cita. Agenda una nueva en otro horario.</p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section>
            <SectionTitle aside={minutesLabel(minutes)}>Servicios</SectionTitle>
            <ul className="space-y-3">
              {a.services.map((s) => (
                <li key={s.id} className="flex justify-between gap-4">
                  <span>{s.name}</span><span className="text-muted tnum">{money(s.price)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-4 border-t border-line-soft pt-3">
                <span className="text-muted">Total</span><span className="font-display text-lg tnum">{money(total)}</span>
              </li>
            </ul>
          </section>

          <section>
            <SectionTitle>Nota</SectionTitle>
            <ActionForm action={saveNotes}>
              <input type="hidden" name="id" value={a.id} />
              <textarea name="notes" defaultValue={a.notes ?? ""} rows={3} className="field" placeholder="Cómo le gusta el corte, alergias, preferencias…" />
              <div className="mt-3"><Submit className="btn-quiet">Guardar nota</Submit></div>
            </ActionForm>
          </section>
        </div>

        <aside className="space-y-6">
          {open && (
            <section>
              <SectionTitle>Siguiente paso</SectionTitle>
              <div className="flex flex-col gap-2">
                {canAccess(me.role, "ventas") && (
                  <Link href={`/ventas/nueva?cita=${a.id}`} className="btn-primary">Cobrar {money(total, true)}</Link>
                )}
                {a.status === "PENDING" && action("CONFIRMED", "Confirmar cita")}
                {a.status !== "IN_PROGRESS" && action("IN_PROGRESS", "Pasar a la silla")}
                <div className="mt-4 flex gap-2">
                  {action("NO_SHOW", "No llegó", "btn-ghost")}
                  {action("CANCELLED", "Cancelar cita", "btn-ghost text-danger")}
                </div>
              </div>
            </section>
          )}
          {a.sale && (
            <section>
              <SectionTitle>Cobro</SectionTitle>
              <Link href={`/ventas/${a.sale.id}`} className="link">Venta #{a.sale.folio} por {money(a.sale.total)}</Link>
            </section>
          )}
          {(a.status === "CANCELLED" || a.status === "NO_SHOW") && (
            <section className="text-sm text-muted">
              <p>El horario quedó libre.</p>
              <div className="mt-3">{action("CONFIRMED", "Reactivar cita")}</div>
            </section>
          )}
          <section>
            <SectionTitle>Cliente</SectionTitle>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted">Teléfono</dt><dd><a href={`tel:${a.customer.phone}`} className="link tnum">{a.customer.phone}</a></dd></div>
              <div><dt className="text-muted">Origen</dt><dd>{SOURCE[a.source]}</dd></div>
            </dl>
            <Link href={`/clientes/${a.customer.id}`} className="mt-4 inline-block text-sm link">Ver historial</Link>
          </section>
        </aside>
      </div>
    </>
  );
}
