import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { dateTimeLabel } from "@/lib/time";
import { Empty, Field, PageHeader, RowLink, Rows } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { createCustomer } from "./actions";

export const metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string; nuevo?: string }> }) {
  const { shop } = await requireSection("clientes");
  const { q = "", nuevo } = await searchParams;
  const term = q.trim();
  const digits = term.replace(/\D/g, "");
  const customers = await prisma.customer.findMany({
    where: {
      shopId: shop.id,
      ...(term && { OR: [{ name: { contains: term, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }),
    },
    include: {
      appointments: { where: { status: "COMPLETED" }, orderBy: { startsAt: "desc" }, take: 1 },
      _count: { select: { appointments: { where: { status: "COMPLETED" } } } },
    },
    orderBy: { name: "asc" },
    take: 100,
  });
  const total = await prisma.customer.count({ where: { shopId: shop.id } });

  return (
    <>
      <PageHeader title="Clientes" subtitle={`${total} ${total === 1 ? "cliente" : "clientes"} registrados`}
        actions={<Link href="/clientes?nuevo=1" className="btn-primary">Agregar cliente</Link>} />

      {nuevo && (
        <section className="mb-14 rounded-lg border border-line p-6 sm:p-8">
          <h2 className="mb-6 font-display text-xl">Nuevo cliente</h2>
          <ActionForm action={createCustomer}>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Nombre"><input name="name" required className="field" /></Field>
              <Field label="Teléfono"><input name="phone" inputMode="tel" required className="field" /></Field>
              <Field label="Email"><input name="email" type="email" className="field" /></Field>
              <Field label="Nota" className="sm:col-span-3"><input name="notes" className="field" placeholder="Cómo le gusta el corte" /></Field>
            </div>
            <div className="mt-6 flex gap-2"><Submit>Guardar cliente</Submit><Link href="/clientes" className="btn-ghost">Cancelar</Link></div>
          </ActionForm>
        </section>
      )}

      <form className="mb-8 max-w-sm">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre o teléfono" aria-label="Buscar cliente" className="field" />
      </form>

      {customers.length === 0 ? (
        <Empty title={term ? "Nadie con esos datos" : "Aún no hay clientes"}>
          {term ? "Revisa el nombre o prueba con el teléfono." : "Se registran solos al agendar o cobrar con teléfono."}
        </Empty>
      ) : (
        <Rows>
          {customers.map((c) => (
            <RowLink key={c.id} href={`/clientes/${c.id}`}>
              <span className="min-w-0 flex-1">
                <span className="block">{c.name}</span>
                <span className="block text-sm text-ash tnum">{c.phone}</span>
              </span>
              <span className="text-right text-sm text-ash">
                {c._count.appointments} {c._count.appointments === 1 ? "visita" : "visitas"}
                {c.appointments[0] && <span className="block text-ash-2">Última: {dateTimeLabel(c.appointments[0].startsAt, shop.timezone)}</span>}
              </span>
            </RowLink>
          ))}
        </Rows>
      )}
    </>
  );
}
