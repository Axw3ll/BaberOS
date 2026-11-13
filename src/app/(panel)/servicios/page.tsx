import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { minutesLabel, money } from "@/lib/format";
import { Empty, PageHeader, RowLink, Rows } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { ServiceFields } from "@/components/service-fields";
import { createService } from "./actions";

export const metadata = { title: "Servicios" };

export default async function ServiciosPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const { shop } = await requireSection("servicios");
  const { nuevo } = await searchParams;
  const [services, staff] = await Promise.all([
    prisma.service.findMany({ where: { shopId: shop.id }, include: { staff: { include: { staff: true } } }, orderBy: [{ active: "desc" }, { position: "asc" }, { name: "asc" }] }),
    prisma.staff.findMany({ where: { shopId: shop.id, active: true, takesAppointments: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Servicios" subtitle="Lo que ofreces, cuánto dura y quién lo hace."
        actions={<Link href="/servicios?nuevo=1" className="btn-primary">Agregar servicio</Link>} />

      {nuevo && (
        <section className="mb-8 rounded-lg border border-line p-6 sm:p-8">
          <h2 className="mb-6 font-display text-xl">Nuevo servicio</h2>
          <ActionForm action={createService}>
            <ServiceFields staff={staff} assigned={staff.map((s) => s.id)} />
            <div className="mt-8 flex gap-2"><Submit>Guardar servicio</Submit><Link href="/servicios" className="btn-ghost">Cancelar</Link></div>
          </ActionForm>
        </section>
      )}

      {services.length === 0 ? (
        !nuevo && <Empty title="Aún no hay servicios" action={<Link href="/servicios?nuevo=1" className="btn-quiet">Agregar el primero</Link>}>
          Cada servicio necesita duración y precio para poder agendarse.
        </Empty>
      ) : (
        <Rows>
          {services.map((s) => (
            <RowLink key={s.id} href={`/servicios/${s.id}`}>
              <span className={`min-w-0 flex-1 ${s.active ? "" : "text-faint"}`}>
                <span className="block">{s.name}{!s.active && " (pausado)"}</span>
                <span className="block truncate text-sm text-muted">
                  {s.staff.length ? s.staff.map((x) => x.staff.name).join(", ") : "Nadie lo tiene asignado"}
                  {!s.bookableOnline && ". Solo en mostrador"}
                </span>
              </span>
              <span className="w-20 text-right text-sm text-muted tnum">{minutesLabel(s.minutes)}</span>
              <span className="w-24 text-right font-display text-lg tnum">{money(s.price, true)}</span>
            </RowLink>
          ))}
        </Rows>
      )}
    </>
  );
}
