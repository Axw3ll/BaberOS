import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSection, ROLE_LABEL } from "@/lib/auth";
import { summarize } from "@/lib/schedule";
import { initials } from "@/lib/format";
import { Field, PageHeader, RowLink, Rows } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { addStaff } from "./actions";

export const metadata = { title: "Equipo" };

export default async function EquipoPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const { shop } = await requireSection("equipo");
  const { nuevo } = await searchParams;
  const staff = await prisma.staff.findMany({
    where: { shopId: shop.id },
    include: { schedule: true, _count: { select: { services: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });

  return (
    <>
      <PageHeader title="Equipo" subtitle="Quién trabaja en la barbería, qué hace y en qué horario."
        actions={<Link href="/equipo?nuevo=1" className="btn-primary">Agregar persona</Link>} />

      {nuevo && (
        <section className="mb-14 rounded-lg border border-line p-6 sm:p-8">
          <h2 className="font-display text-xl">Nueva persona</h2>
          <p className="mt-1 mb-6 text-sm text-ash">Si escribes su email, podrá entrar con su propia cuenta al registrarse con ese mismo email.</p>
          <ActionForm action={addStaff}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nombre"><input name="name" required className="field" /></Field>
              <Field label="Rol">
                <select name="role" className="field" defaultValue="BARBER">
                  <option value="BARBER">Barbero</option>
                  <option value="RECEPTIONIST">Recepción</option>
                  <option value="MANAGER">Encargado</option>
                </select>
              </Field>
              <Field label="Email" hint="Opcional"><input name="email" type="email" className="field" /></Field>
              <Field label="Teléfono" hint="Opcional"><input name="phone" inputMode="tel" className="field" /></Field>
            </div>
            <p className="mt-5 text-sm text-ash">Le asignamos el horario de la barbería y todos los servicios. Ajústalo en su perfil.</p>
            <div className="mt-6 flex gap-2"><Submit>Agregar al equipo</Submit><Link href="/equipo" className="btn-ghost">Cancelar</Link></div>
          </ActionForm>
        </section>
      )}

      <Rows>
        {staff.map((s) => (
          <RowLink key={s.id} href={`/equipo/${s.id}`}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-full border border-line font-display ${s.active ? "text-foam" : "text-ash-2"}`}>{initials(s.name)}</span>
            <span className={`min-w-0 flex-1 ${s.active ? "" : "text-ash-2"}`}>
              <span className="block">{s.name}{!s.active && " (inactivo)"}</span>
              <span className="block truncate text-sm text-ash">
                {ROLE_LABEL[s.role]}
                {s.takesAppointments ? `. ${summarize(s.schedule)}. ${s._count.services} servicios` : ". No atiende en agenda"}
              </span>
            </span>
            <span className="hidden text-sm text-ash-2 sm:block">{s.userId ? "Con cuenta" : s.email ? "Invitación pendiente" : "Sin cuenta"}</span>
          </RowLink>
        ))}
      </Rows>
    </>
  );
}
