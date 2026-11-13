import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSection, ROLE_LABEL } from "@/lib/auth";
import { toEditor } from "@/lib/schedule";
import { dateTimeLabel, today } from "@/lib/time";
import { minutesLabel } from "@/lib/format";
import { Field, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { ScheduleEditor } from "@/components/schedule-editor";
import { addTimeOff, removeTimeOff, saveStaffSchedule, saveStaffServices, toggleStaff, updateStaff } from "../actions";

export const metadata = { title: "Equipo" };

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { shop, me } = await requireSection("equipo");
  const [s, services] = await Promise.all([
    prisma.staff.findFirst({
      where: { id, shopId: shop.id },
      include: { schedule: true, services: true, timeOff: { where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } } },
    }),
    prisma.service.findMany({ where: { shopId: shop.id, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
  ]);
  if (!s) notFound();
  const locked = s.role === "OWNER" && me.role !== "OWNER";
  const pct = (v: { toString(): string }) => Math.round(Number(v.toString()) * 100);

  return (
    <>
      <PageHeader back={{ href: "/equipo", label: "Equipo" }} title={s.name}
        subtitle={`${ROLE_LABEL[s.role]}${s.userId ? "" : s.email ? `. Invitación pendiente para ${s.email}` : ". Sin cuenta"}`}
        actions={s.role !== "OWNER" && s.id !== me.id && (
          <form action={toggleStaff}><input type="hidden" name="id" value={s.id} />
            <button className={s.active ? "btn-ghost text-rose" : "btn-quiet"}>{s.active ? "Dar de baja" : "Reactivar"}</button>
          </form>
        )} />

      {locked ? <p className="text-ash">Solo el dueño puede editar este perfil.</p> : (
        <div className="space-y-16">
          <section className="max-w-2xl">
            <SectionTitle>Perfil</SectionTitle>
            <ActionForm action={updateStaff}>
              <input type="hidden" name="id" value={s.id} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nombre"><input name="name" defaultValue={s.name} required className="field" /></Field>
                <Field label="Rol">
                  {s.role === "OWNER" ? <input disabled value="Dueño" className="field opacity-60" /> : (
                    <select name="role" defaultValue={s.role} className="field">
                      <option value="BARBER">Barbero</option><option value="RECEPTIONIST">Recepción</option><option value="MANAGER">Encargado</option>
                    </select>
                  )}
                </Field>
                <Field label="Email" hint={s.userId ? "Ligado a su cuenta" : "Para invitarlo a entrar"}>
                  <input name="email" type="email" defaultValue={s.email ?? ""} disabled={Boolean(s.userId)} className="field disabled:opacity-60" />
                </Field>
                <Field label="Teléfono"><input name="phone" defaultValue={s.phone ?? ""} className="field" /></Field>
                <Field label="Comisión por servicios (%)"><input name="serviceCommission" inputMode="numeric" defaultValue={pct(s.serviceCommission)} className="field tnum" /></Field>
                <Field label="Comisión por productos (%)"><input name="productCommission" inputMode="numeric" defaultValue={pct(s.productCommission)} className="field tnum" /></Field>
              </div>
              <label className="mt-5 flex items-center gap-2">
                <input type="checkbox" name="takesAppointments" defaultChecked={s.takesAppointments} className="accent-[var(--color-nickel)]" />
                Atiende clientes y aparece en la agenda
              </label>
              <div className="mt-6"><Submit>Guardar perfil</Submit></div>
            </ActionForm>
          </section>

          {s.takesAppointments && (
            <>
              <section>
                <SectionTitle>Horario semanal</SectionTitle>
                <ActionForm action={saveStaffSchedule}>
                  <input type="hidden" name="id" value={s.id} />
                  <ScheduleEditor key={JSON.stringify(toEditor(s.schedule))} days={toEditor(s.schedule)} />
                  <div className="mt-6"><Submit>Guardar horario</Submit></div>
                </ActionForm>
              </section>

              <section className="max-w-2xl">
                <SectionTitle>Servicios que hace</SectionTitle>
                <ActionForm action={saveStaffServices}>
                  <input type="hidden" name="id" value={s.id} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {services.map((x) => (
                      <label key={x.id} className="flex items-center gap-3">
                        <input type="checkbox" name="serviceId" value={x.id} defaultChecked={s.services.some((y) => y.serviceId === x.id)} className="accent-[var(--color-nickel)]" />
                        <span>{x.name} <span className="text-sm text-ash">{minutesLabel(x.minutes)}</span></span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-6"><Submit className="btn-quiet">Guardar servicios</Submit></div>
                </ActionForm>
              </section>

              <section className="max-w-2xl">
                <SectionTitle>Ausencias</SectionTitle>
                {s.timeOff.length > 0 && (
                  <ul className="mb-8 space-y-2">
                    {s.timeOff.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-4 text-sm">
                        <span><span className="tnum">{dateTimeLabel(t.startsAt, shop.timezone)}</span> a <span className="tnum">{dateTimeLabel(t.endsAt, shop.timezone)}</span>{t.reason && <span className="text-ash">. {t.reason}</span>}</span>
                        <form action={removeTimeOff}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="timeOffId" value={t.id} />
                          <button className="btn-ghost text-sm">Quitar</button></form>
                      </li>
                    ))}
                  </ul>
                )}
                <ActionForm action={addTimeOff} resetOnOk>
                  <input type="hidden" name="id" value={s.id} />
                  <div className="grid gap-4 sm:grid-cols-4">
                    <Field label="Desde"><input type="date" name="from" defaultValue={today(shop.timezone)} required className="field" /></Field>
                    <Field label="Hasta"><input type="date" name="to" className="field" /></Field>
                    <Field label="De" hint="Vacío: todo el día"><input type="time" name="start" className="field" /></Field>
                    <Field label="A"><input type="time" name="end" className="field" /></Field>
                    <Field label="Motivo" className="sm:col-span-4"><input name="reason" className="field" placeholder="Vacaciones, comida, permiso…" /></Field>
                  </div>
                  <div className="mt-5"><Submit className="btn-quiet">Registrar ausencia</Submit></div>
                </ActionForm>
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}
