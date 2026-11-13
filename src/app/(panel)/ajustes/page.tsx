import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { toEditor } from "@/lib/schedule";
import { addDays, dateLabel, toLocalDate } from "@/lib/time";
import { Field, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { ScheduleEditor } from "@/components/schedule-editor";
import { addClosure, removeClosure, saveShop, saveShopHours } from "./actions";

export const metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const { shop } = await requireSection("ajustes");
  const [hours, closures] = await Promise.all([
    prisma.shopHours.findMany({ where: { shopId: shop.id } }),
    prisma.closure.findMany({ where: { shopId: shop.id, endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } }),
  ]);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${base}/b/${shop.slug}`;

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Datos de la barbería, horario y reglas para reservar." />

      <div className="space-y-16">
        <section className="max-w-2xl">
          <SectionTitle>Reservas en línea</SectionTitle>
          <p className="text-ash">Comparte este enlace en Instagram, WhatsApp o Google para que tus clientes reserven solos.</p>
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
            <h3 className="mt-10 mb-4 text-foam">Reglas para reservar</h3>
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

        <section>
          <SectionTitle>Horario de la barbería</SectionTitle>
          <p className="mb-5 max-w-2xl text-ash">Nadie puede tener citas fuera de este horario, aunque su turno sea más largo.</p>
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
                    <span>{dateLabel(a)}{b !== a && ` al ${dateLabel(b)}`}{c.reason && <span className="text-ash">. {c.reason}</span>}</span>
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
