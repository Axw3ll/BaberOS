import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection } from "@/lib/auth";
import { dateTimeLabel } from "@/lib/time";
import { money } from "@/lib/format";
import { Field, Figure, PageHeader, RowLink, Rows, SectionTitle, Status } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { updateCustomer } from "../actions";

export const metadata = { title: "Cliente" };

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { shop, me } = await requireSection("clientes");
  const c = await prisma.customer.findFirst({
    where: { id, shopId: shop.id },
    include: {
      appointments: { include: { services: true, staff: true }, orderBy: { startsAt: "desc" }, take: 30 },
      sales: { where: { status: "PAID" }, select: { total: true } },
    },
  });
  if (!c) notFound();
  const visits = c.appointments.filter((a) => a.status === "COMPLETED").length;
  const spent = c.sales.reduce((a, s) => a + Number(s.total), 0);
  const noShows = c.appointments.filter((a) => a.status === "NO_SHOW").length;

  return (
    <>
      <PageHeader back={{ href: "/clientes", label: "Clientes" }} title={c.name}
        subtitle={<a href={`tel:${c.phone}`} className="link tnum">{c.phone}</a>}
        actions={<Link href="/agenda/nueva" className="btn-quiet">Agendar cita</Link>} />

      <div className="mb-14 flex flex-wrap gap-x-10 gap-y-6">
        <Figure value={visits} label="Visitas" />
        {canAccess(me.role, "ventas") && <Figure value={money(spent)} label="Ha gastado" />}
        {noShows > 0 && <Figure value={noShows} label="Veces que no llegó" />}
      </div>

      <div className="grid gap-14 lg:grid-cols-[1fr_340px]">
        <section>
          <SectionTitle>Historial</SectionTitle>
          {c.appointments.length === 0 ? <p className="text-ash">Sin citas todavía.</p> : (
            <Rows>
              {c.appointments.map((a) => (
                <RowLink key={a.id} href={`/citas/${a.id}`}>
                  <span className="w-36 shrink-0 text-sm text-ash tnum">{dateTimeLabel(a.startsAt, shop.timezone)}</span>
                  <span className="min-w-0 flex-1 truncate">{a.services.map((s) => s.name).join(", ")}<span className="text-ash"> con {a.staff.name}</span></span>
                  <Status status={a.status} />
                </RowLink>
              ))}
            </Rows>
          )}
        </section>
        <aside>
          <SectionTitle>Datos</SectionTitle>
          <ActionForm action={updateCustomer} className="space-y-4">
            <input type="hidden" name="id" value={c.id} />
            <Field label="Nombre"><input name="name" defaultValue={c.name} required className="field" /></Field>
            <Field label="Email"><input name="email" type="email" defaultValue={c.email ?? ""} className="field" /></Field>
            <Field label="Nota"><textarea name="notes" rows={4} defaultValue={c.notes ?? ""} className="field" placeholder="Cómo le gusta el corte, preferencias…" /></Field>
            <Submit className="btn-quiet">Guardar</Submit>
          </ActionForm>
        </aside>
      </div>
    </>
  );
}
