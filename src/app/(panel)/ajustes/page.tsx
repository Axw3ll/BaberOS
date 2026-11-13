import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { toEditor } from "@/lib/schedule";
import { addDays, dateLabel, toLocalDate } from "@/lib/time";
import { Field, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { ScheduleEditor } from "@/components/schedule-editor";
import { LoyaltySettings } from "./loyalty-settings";
import { FREQUENCY_LABEL, WEEKDAYS } from "@/lib/payroll";
import { addClosure, removeClosure, saveCrm, saveMessages, savePayroll, savePolicies, saveShop, saveShopHours } from "./actions";
import { createTag, deleteTag } from "../clientes/actions";
import { TAG_COLORS, TAG_LABEL, tagColor } from "@/lib/crm";
import { money } from "@/lib/format";

export const metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const { shop } = await requireSection("ajustes");
  const [hours, tags, closures] = await Promise.all([
    prisma.shopHours.findMany({ where: { shopId: shop.id } }),
    prisma.tag.findMany({ where: { shopId: shop.id }, include: { _count: { select: { customers: true } } }, orderBy: { name: "asc" } }),
    prisma.closure.findMany({ where: { shopId: shop.id, endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } }),
  ]);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${base}/b/${shop.slug}`;

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Datos de la barbería, horario y reglas para reservar." />

      <div className="space-y-6">
        <section className="max-w-2xl">
          <SectionTitle>Reservas en línea</SectionTitle>
          <p className="text-muted">Comparte este enlace en Instagram, WhatsApp o Google para que tus clientes reserven solos.</p>
          <p className="mt-4 break-all font-display text-xl"><a href={`/b/${shop.slug}`} target="_blank" className="link">{link.replace(/^https?:\/\//, "")}</a></p>
        </section>

        <section className="max-w-2xl">
          <SectionTitle>Barbería</SectionTitle>
          <ActionForm action={saveShop}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nombre"><input name="name" defaultValue={shop.name} required className="field" /></Field>
              <Field label="Dirección del enlace" hint={`Queda como /b/${shop.slug}`}><input name="slug" defaultValue={shop.slug} className="field" /></Field>
              <Field label="Teléfono"><input name="phone" defaultValue={shop.phone ?? ""} className="field" /></Field>
              <Field label="Dirección"><input name="address" defaultValue={shop.address ?? ""} className="field" /></Field>
              <Field label="IVA incluido en precios (%)"><input name="taxRate" inputMode="decimal" defaultValue={Number(shop.taxRate) * 100} className="field tnum" /></Field>
            </div>
            <h3 className="mt-10 mb-4 text-fg">Reglas para reservar</h3>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Horarios cada">
                <select name="slotMinutes" defaultValue={shop.slotMinutes} className="field">
                  {[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}
                </select>
              </Field>
              <Field label="Anticipación mínima (min)" hint="Solo aplica en línea"><input name="minNoticeMinutes" inputMode="numeric" defaultValue={shop.minNoticeMinutes} className="field tnum" /></Field>
              <Field label="Reservar hasta (días)"><input name="maxAdvanceDays" inputMode="numeric" defaultValue={shop.maxAdvanceDays} className="field tnum" /></Field>
            </div>
            <div className="mt-6"><Submit>Guardar ajustes</Submit></div>
          </ActionForm>
        </section>

        <section id="reglas" className="max-w-2xl scroll-mt-6">
          <SectionTitle>Reglas</SectionTitle>
          <ActionForm action={savePolicies} className="space-y-6">
            <div>
              <h3 className="mb-1 font-medium">Descuento máximo al cobrar</h3>
              <p className="mb-3 text-sm text-muted">Dueño y encargado no tienen tope. Puntos, premios y paquetes no cuentan como descuento.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Barbero (%)"><input name="maxDiscountBarber" inputMode="numeric" defaultValue={shop.maxDiscountBarber} className="field tnum" /></Field>
                <Field label="Recepción (%)"><input name="maxDiscountReception" inputMode="numeric" defaultValue={shop.maxDiscountReception} className="field tnum" /></Field>
              </div>
            </div>
            <div>
              <h3 className="mb-1 font-medium">Clientes que faltan seguido</h3>
              <p className="mb-3 text-sm text-muted">Cuenta los “no llegó” de los últimos 6 meses.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="A partir de (faltas)"><input name="noShowLimit" inputMode="numeric" defaultValue={shop.noShowLimit} className="field tnum" /></Field>
                <Field label="Qué hacer">
                  <select name="noShowPolicy" defaultValue={shop.noShowPolicy} className="field">
                    <option value="WARN">Avisar al equipo (aparece marcado)</option>
                    <option value="BLOCK">No dejarlo reservar en línea (que llame)</option>
                  </select>
                </Field>
              </div>
            </div>
            <div>
              <h3 className="mb-1 font-medium">Fila virtual</h3>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="queueEnabled" defaultChecked={shop.queueEnabled} className="size-4 accent-[var(--color-brand)]" />
                Permitir que los clientes se formen desde su celular
              </label>
              <Field label="Máximo de personas en la fila" className="sm:w-1/2"><input name="queueMax" inputMode="numeric" defaultValue={shop.queueMax} className="field tnum" /></Field>
            </div>
            <Submit>Guardar reglas</Submit>
          </ActionForm>
        </section>

        <section id="comisiones" className="max-w-2xl scroll-mt-6">
          <SectionTitle>Pago de comisiones</SectionTitle>
          <p className="mb-4 text-sm text-muted">Con esto sabes cuándo toca pagar y cuánto. El día de pago te avisamos en Hoy y en Ventas → Comisiones.</p>
          <ActionForm action={savePayroll}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cada cuánto pagas">
                <select name="payoutFrequency" defaultValue={shop.payoutFrequency} className="field">
                  {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Día de pago (si es semanal)" hint="El periodo son los 7 días que terminan ese día">
                <select name="payoutWeekday" defaultValue={shop.payoutWeekday} className="field">
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-5"><Submit>Guardar</Submit></div>
          </ActionForm>
        </section>

        <section id="mensajes" className="max-w-2xl scroll-mt-6">
          <SectionTitle>Mensajes automáticos</SectionTitle>
          <p className="mb-5 text-sm text-muted">
            El sistema prepara estos mensajes solo y los deja en <a href="/seguimiento/mensajes" className="link">Mensajes por enviar</a>.
            La confirmación de reservas en línea siempre está activa.
          </p>
          <ActionForm action={saveMessages}>
            <div className="space-y-3">
              {([
                ["autoReminder24h", shop.autoReminder24h, "Recordatorio un día antes", "Con enlace para confirmar, cambiar o cancelar."],
                ["autoReminder2h", shop.autoReminder2h, "Recordatorio 2 horas antes", "Útil si te faltan mucho los clientes."],
                ["autoNoShow", shop.autoNoShow, "Si no llegó", "Le ofrece reagendar, salvo que ya tenga otra cita."],
                ["autoReview", shop.autoReview, "Pedir reseña después de la visita", "Una vez cada 90 días por cliente."],
                ["autoRebook", shop.autoRebook, "Ya le toca volver", "Según cada cuánto viene. Solo a quien acepta promociones."],
                ["autoBirthday", shop.autoBirthday, "Felicitación de cumpleaños", "Solo a quien acepta promociones."],
              ] as const).map(([name, on, label, hint]) => (
                <label key={name} className="flex items-start gap-3 rounded-xl border border-line-soft p-3">
                  <input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
                  <span><span className="block font-medium">{label}</span><span className="text-sm text-muted">{hint}</span></span>
                </label>
              ))}
            </div>
            <Field label="Enlace para dejar reseña en Google" hint="En tu perfil de Google Maps: Pedir reseñas → copiar enlace" className="mt-5">
              <input name="googleReviewUrl" type="url" defaultValue={shop.googleReviewUrl ?? ""} placeholder="https://g.page/r/…" className="field" />
            </Field>
            <div className="mt-6"><Submit>Guardar</Submit></div>
          </ActionForm>
        </section>

        <section id="lealtad" className="max-w-2xl scroll-mt-6">
          <SectionTitle>Clientes y lealtad</SectionTitle>
          <ActionForm action={saveCrm}>
            <LoyaltySettings
              mode={shop.loyaltyMode} pointsPerPeso={Number(shop.loyaltyPointsPerPeso)} pesoPerPoint={Number(shop.loyaltyPesoPerPoint)}
              stampsRequired={shop.stampsRequired} stampReward={shop.stampReward} stampRewardValue={Number(shop.stampRewardValue)}
              stampMinAmount={Number(shop.stampMinAmount)} autoLoyaltyMsgs={shop.autoLoyaltyMsgs} />
            <Field label="Cliente perdido después de (días)" hint="Sin venir. Define las etapas “en riesgo” y “perdido”." className="mt-6 sm:w-1/2">
              <input name="lostAfterDays" inputMode="numeric" defaultValue={shop.lostAfterDays} className="field tnum" />
            </Field>
            <div className="mt-6"><Submit>Guardar</Submit></div>
          </ActionForm>
        </section>

        <section className="max-w-2xl">
          <SectionTitle>Etiquetas de clientes</SectionTitle>
          {tags.length > 0 && (
            <ul className="mb-6 divide-y divide-line-soft">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-1.5 rounded-full" style={{ background: tagColor(t.color) }} aria-hidden />{t.name}
                    <span className="text-sm text-faint tnum">{t._count.customers}</span>
                  </span>
                  <form action={deleteTag}><input type="hidden" name="id" value={t.id} /><button className="btn-ghost text-sm">Borrar</button></form>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={createTag} resetOnOk>
            <div className="flex gap-2">
              <input name="name" className="field" placeholder="Estudiante, Barba, Niño…" aria-label="Nueva etiqueta" maxLength={30} />
              <select name="color" className="field w-32" aria-label="Color" defaultValue="nickel">
                {TAG_COLORS.map((col) => <option key={col} value={col}>{TAG_LABEL[col]}</option>)}
              </select>
              <Submit className="btn-quiet">Agregar</Submit>
            </div>
          </ActionForm>
        </section>

        <section>
          <SectionTitle>Horario de la barbería</SectionTitle>
          <p className="mb-5 max-w-2xl text-muted">Nadie puede tener citas fuera de este horario, aunque su turno sea más largo.</p>
          <ActionForm action={saveShopHours}>
            <ScheduleEditor key={JSON.stringify(toEditor(hours))} days={toEditor(hours)} offLabel="Cerrado" />
            <div className="mt-6"><Submit>Guardar horario</Submit></div>
          </ActionForm>
        </section>

        <section className="max-w-2xl">
          <SectionTitle>Días cerrados</SectionTitle>
          {closures.length > 0 && (
            <ul className="mb-8 space-y-2">
              {closures.map((c) => {
                const a = toLocalDate(c.startsAt, shop.timezone), b = addDays(toLocalDate(c.endsAt, shop.timezone), -1);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-4">
                    <span>{dateLabel(a)}{b !== a && ` al ${dateLabel(b)}`}{c.reason && <span className="text-muted">. {c.reason}</span>}</span>
                    <form action={removeClosure}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost text-sm">Quitar</button></form>
                  </li>
                );
              })}
            </ul>
          )}
          <ActionForm action={addClosure} resetOnOk>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Desde"><input type="date" name="from" required className="field" /></Field>
              <Field label="Hasta" hint="Vacío: un solo día"><input type="date" name="to" className="field" /></Field>
              <Field label="Motivo"><input name="reason" className="field" placeholder="Día festivo" /></Field>
            </div>
            <div className="mt-5"><Submit className="btn-quiet">Agregar cierre</Submit></div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
