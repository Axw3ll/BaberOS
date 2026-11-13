import { headers } from "next/headers";
import { Mail, MailQuestion, MessageCircle } from "lucide-react";
import { canEmailInvites } from "@/lib/supabase/admin";
import { CopyButton } from "@/components/copy-button";
import { whatsappUrl } from "@/lib/crm";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSection, ROLE_LABEL } from "@/lib/auth";
import { toEditor } from "@/lib/schedule";
import { dateTimeLabel, today } from "@/lib/time";
import { minutesLabel } from "@/lib/format";
import { Field, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { ScheduleEditor } from "@/components/schedule-editor";
import { addTimeOff, removeTimeOff, resendInvite, saveStaffSchedule, saveStaffServices, toggleStaff, updateStaff } from "../actions";

export const metadata = { title: "Equipo" };

export default async function StaffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ invitacion?: string }> }) {
  const { id } = await params;
  const { invitacion } = await searchParams;
  const { shop, me } = await requireSection("equipo");
  const [s, services] = await Promise.all([
    prisma.staff.findFirst({
      where: { id, shopId: shop.id },
      include: { schedule: true, services: true, timeOff: { where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } } },
    }),
    prisma.service.findMany({ where: { shopId: shop.id, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
  ]);
  if (!s) notFound();
  // Dominio para el enlace de registro: el configurado, o el de esta misma petición
  const h = await headers();
  const origin = (process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`).replace(/\/$/, "");
  const locked = s.role === "OWNER" && me.role !== "OWNER";
  const pct = (v: { toString(): string }) => Math.round(Number(v.toString()) * 100);

  return (
    <>
      <PageHeader back={{ href: "/equipo", label: "Equipo" }} title={s.name}
        subtitle={`${ROLE_LABEL[s.role]}${s.userId ? "" : s.email ? `. Falta que cree su cuenta con ${s.email}` : ". Sin cuenta para entrar"}`}
        actions={s.role !== "OWNER" && s.id !== me.id && (
          <form action={toggleStaff}><input type="hidden" name="id" value={s.id} />
            <button className={s.active ? "btn-ghost text-danger" : "btn-quiet"}>{s.active ? "Dar de baja" : "Reactivar"}</button>
          </form>
        )} />

      {!s.userId && s.email && !locked && (() => {
        const signup = `${origin}/registro?email=${encodeURIComponent(s.email)}`;
        const msg = `Hola ${s.name.split(" ")[0]}, te agregué al equipo de ${shop.name} en BarberOS. Crea tu cuenta con este correo (${s.email}) aquí: ${signup}`;
        return (
          <div className="mb-6 max-w-2xl rounded-2xl border border-warning/30 bg-warning/5 p-5">
            <p className="flex items-center gap-2 font-semibold"><MailQuestion className="size-5 text-warning" aria-hidden />Todavía no tiene cuenta</p>
            <p className="mt-1.5 text-sm text-muted">
              {canEmailInvites() ? "Mándale la invitación por correo o comparte el enlace" : "Comparte este enlace"}: en cuanto se registre con <strong className="text-fg">{s.email}</strong>,
              queda ligado a tu equipo y entra directo a su agenda. Si se registró con otro correo, cambia aquí el email por el que usó.
            </p>
            {invitacion === "enviada" && <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">Le enviamos el correo de invitación a {s.email}.</p>}
            {invitacion === "error" && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">No se pudo enviar el correo. Comparte el enlace por WhatsApp.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {canEmailInvites() && (
                <form action={resendInvite}><input type="hidden" name="id" value={s.id} />
                  <button className="btn-primary"><Mail className="size-4" />{invitacion === "enviada" ? "Reenviar correo" : "Enviar invitación por correo"}</button>
                </form>
              )}
              <CopyButton text={signup} label="Copiar enlace" />
              {s.phone && (
                <a href={whatsappUrl(s.phone, msg)} target="_blank" rel="noopener" className="btn border border-success/25 bg-success/10 text-success hover:bg-success/15">
                  <MessageCircle className="size-4" aria-hidden />Mandar por WhatsApp
                </a>
              )}
            </div>
          </div>
        );
      })()}

      {locked ? <p className="text-muted">Solo el dueño puede editar este perfil.</p> : (
        <div className="space-y-6">
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
                <input type="checkbox" name="takesAppointments" defaultChecked={s.takesAppointments} className="accent-[var(--color-brand)]" />
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
                        <input type="checkbox" name="serviceId" value={x.id} defaultChecked={s.services.some((y) => y.serviceId === x.id)} className="accent-[var(--color-brand)]" />
                        <span>{x.name} <span className="text-sm text-muted">{minutesLabel(x.minutes)}</span></span>
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
                        <span><span className="tnum">{dateTimeLabel(t.startsAt, shop.timezone)}</span> a <span className="tnum">{dateTimeLabel(t.endsAt, shop.timezone)}</span>{t.reason && <span className="text-muted">. {t.reason}</span>}</span>
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
