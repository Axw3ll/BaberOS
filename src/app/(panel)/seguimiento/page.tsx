import Link from "next/link";
import { ChevronRight, MessageCircle } from "lucide-react";
import { pendingMessages, syncOutbox } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { addDays, dateLabel, today } from "@/lib/time";
import { bookingUrl, customerStats, daysToBirthday, fillTemplate, QUICK_MESSAGES, STAGE, whatsappUrl, type CustomerStats } from "@/lib/crm";
import { money } from "@/lib/format";
import { Dot, Empty, Field, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { WhatsAppLink } from "@/components/whatsapp-menu";
import { createTask, deleteTask, quickTask, toggleTask } from "./actions";

export const metadata = { title: "Seguimiento" };

const msg = (id: string) => QUICK_MESSAGES.find((m) => m.id === id)!.text;

type Opp = { c: CustomerStats; reason: string; template: string; task: string };

export default async function SeguimientoPage({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  const { shop, me } = await requireSection("seguimiento");
  const sp = await searchParams;
  const own = seesOnlyOwnAgenda(me.role);
  const showAll = !own && sp.todas === "1";
  const tz = shop.timezone, day = today(tz);
  const dayDate = new Date(`${day}T00:00:00Z`);
  const now = Date.now();

  const [tasks, staff, stats, upcoming, recentContacts, lastStaff, noShows] = await Promise.all([
    prisma.task.findMany({
      where: {
        shopId: shop.id, doneAt: null,
        ...(showAll ? {} : { OR: [{ assignedToId: me.id }, { assignedToId: null }] }),
      },
      include: { customer: true, assignedTo: true },
      orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }],
      take: 200,
    }),
    own ? [] : prisma.staff.findMany({ where: { shopId: shop.id, active: true }, orderBy: { name: "asc" } }),
    customerStats(shop.id, { lostAfterDays: shop.lostAfterDays }),
    // Quien ya tiene cita próxima no necesita que lo busquen
    prisma.appointment.findMany({
      where: { shopId: shop.id, startsAt: { gt: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { customerId: true }, distinct: ["customerId"],
    }),
    // Ni quien ya contactamos en los últimos 5 días
    prisma.customerActivity.findMany({
      where: { shopId: shop.id, type: { in: ["CALL", "WHATSAPP", "SMS", "EMAIL"] }, createdAt: { gt: new Date(now - 5 * 86_400_000) } },
      select: { customerId: true }, distinct: ["customerId"],
    }),
    own
      ? prisma.$queryRaw<{ customerId: string; staffId: string }[]>`
          SELECT DISTINCT ON ("customerId") "customerId", "staffId" FROM appointments
           WHERE "shopId" = ${shop.id}::uuid AND status = 'COMPLETED' ORDER BY "customerId", "startsAt" DESC`
      : [],
    prisma.appointment.findMany({
      where: { shopId: shop.id, status: "NO_SHOW", startsAt: { gt: new Date(now - 7 * 86_400_000), lt: new Date() },
        ...(own && { staffId: me.id }) },
      select: { customerId: true, startsAt: true }, orderBy: { startsAt: "desc" },
    }),
  ]);

  await syncOutbox(shop);
  const outbox = (await pendingMessages(shop.id, own ? { staffId: me.id } : {})).length;
  const booked = new Set(upcoming.map((a) => a.customerId));
  const contacted = new Set(recentContacts.map((a) => a.customerId));
  const mineMap = new Map(lastStaff.map((r) => [r.customerId, r.staffId]));
  const pool = stats.filter((c) => !booked.has(c.id) && !contacted.has(c.id) && (!own || mineMap.get(c.id) === me.id));
  const byId = new Map(stats.map((c) => [c.id, c]));

  const birthdays: Opp[] = pool
    .filter((c) => c.birthday && c.acceptsMarketing && daysToBirthday(c.birthday, day) <= 7)
    .sort((a, b) => daysToBirthday(a.birthday!, day) - daysToBirthday(b.birthday!, day))
    .map((c) => {
      const d = daysToBirthday(c.birthday!, day);
      return { c, reason: d === 0 ? "Cumple hoy" : d === 1 ? "Cumple mañana" : `Cumple en ${d} días`, template: msg("cumple"), task: `Felicitar a ${c.name.split(" ")[0]}` };
    });

  const due: Opp[] = pool
    .filter((c) => (c.stage === "activo" || c.stage === "nuevo") && c.expectedBack && c.expectedBack.getTime() <= now + 2 * 86_400_000)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 15)
    .map((c) => ({ c, reason: `Viene cada ${c.cadence ?? 30} días · hace ${c.daysSince}`, template: msg("volver"), task: `Invitar a ${c.name.split(" ")[0]} a su corte` }));

  const risk: Opp[] = pool
    .filter((c) => c.stage === "en_riesgo" && c.acceptsMarketing)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 15)
    .map((c) => ({ c, reason: `Sin venir hace ${c.daysSince} días${c.cadence ? `, solía venir cada ${c.cadence}` : ""}`, template: msg("extrañamos"), task: `Recuperar a ${c.name.split(" ")[0]}` }));

  const seenNoShow = new Set<string>();
  const missed: Opp[] = noShows
    .filter((a) => !booked.has(a.customerId) && !contacted.has(a.customerId) && !seenNoShow.has(a.customerId) && seenNoShow.add(a.customerId))
    .map((a) => byId.get(a.customerId)).filter(Boolean)
    .map((c) => ({ c: c!, reason: "No llegó a su cita esta semana", template: msg("noshow"), task: `Reagendar a ${c!.name.split(" ")[0]}` }));

  const thanks: Opp[] = pool
    .filter((c) => c.visits === 1 && c.daysSince !== null && c.daysSince <= 3)
    .map((c) => ({ c, reason: c.daysSince === 0 ? "Primera visita hoy" : `Primera visita hace ${c.daysSince} ${c.daysSince === 1 ? "día" : "días"}`, template: msg("gracias"), task: `Agradecer a ${c.name.split(" ")[0]}` }));

  const groups = [
    { title: "Cumpleaños", items: birthdays },
    { title: "Primera visita", hint: "Un mensaje de agradecimiento hace que regresen.", items: thanks },
    { title: "No llegaron", items: missed },
    { title: "Ya les toca volver", hint: "Según cada cuánto vienen.", items: due },
    { title: "En riesgo de perderse", hint: "Los que más han gastado primero.", items: risk },
  ].filter((g) => g.items.length > 0);

  const vars = (c: CustomerStats) => ({ nombre: c.name, barberia: shop.name, enlace: bookingUrl(shop.slug), puntos: c.points });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const overdue = tasks.filter((t) => t.dueOn < dayDate);
  const todays = tasks.filter((t) => iso(t.dueOn) === day);
  const later = tasks.filter((t) => t.dueOn > dayDate);
  const oppCount = groups.reduce((a, g) => a + g.items.length, 0);

  const TaskList = ({ list, tone }: { list: typeof tasks; tone?: string }) => (
    <ul className="divide-y divide-line-soft">
      {list.map((t) => (
        <li key={t.id} className="flex items-start gap-3 py-3">
          <form action={toggleTask}><input type="hidden" name="id" value={t.id} />
            <button className="mt-1 size-4 rounded-sm border border-faint hover:border-fg" aria-label={`Marcar hecho: ${t.title}`} /></form>
          <span className="min-w-0 flex-1">
            <span className="block">{t.title}</span>
            <span className="block text-sm text-muted">
              <span className={tone}>{iso(t.dueOn) === day ? "Hoy" : dateLabel(iso(t.dueOn), { weekday: "short", day: "numeric", month: "short" })}</span>
              {t.customer && <> · <Link href={`/clientes/${t.customer.id}`} className="hover:text-fg">{t.customer.name}</Link></>}
              {t.assignedTo && t.assignedTo.id !== me.id && ` · ${t.assignedTo.name}`}
              {!t.assignedTo && " · Cualquiera"}
            </span>
          </span>
          {t.customer && (
            <a href={`tel:${t.customer.phone}`} className="btn-ghost text-sm">Llamar</a>
          )}
          {(!own || t.createdById === me.id) && (
            <form action={deleteTask}><input type="hidden" name="id" value={t.id} /><button className="btn-ghost text-sm text-faint" aria-label={`Borrar ${t.title}`}>Borrar</button></form>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title="Seguimiento"
        subtitle={`${tasks.length} ${tasks.length === 1 ? "pendiente" : "pendientes"} · ${oppCount} ${oppCount === 1 ? "oportunidad" : "oportunidades"} para traer clientes`}
        actions={!own && (
          <nav aria-label="Ver" className="flex items-center rounded-md border border-line text-sm">
            <Link href="/seguimiento" className={`px-3 py-2 ${!showAll ? "text-fg" : "text-muted hover:text-fg"}`} aria-current={!showAll ? "true" : undefined}>Míos</Link>
            <Link href="/seguimiento?todas=1" className={`border-l border-line px-3 py-2 ${showAll ? "text-fg" : "text-muted hover:text-fg"}`} aria-current={showAll ? "true" : undefined}>De todo el equipo</Link>
          </nav>
        )} />

      {outbox > 0 && (
        <Link href="/seguimiento/mensajes" className="card mb-6 flex items-center gap-4 p-4 transition hover:border-brand">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><MessageCircle className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{outbox} {outbox === 1 ? "mensaje listo" : "mensajes listos"} para enviar</span>
            <span className="block text-sm text-muted">Recordatorios, confirmaciones y avisos que el sistema preparó solo.</span>
          </span>
          <ChevronRight className="size-5 text-faint" />
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {groups.length === 0 ? (
            <Empty title="Nada urgente">Cuando alguien cumpla años, le toque volver o se esté perdiendo, aparece aquí.</Empty>
          ) : groups.map((g) => (
            <section key={g.title}>
              <SectionTitle aside={g.hint}>{g.title}</SectionTitle>
              <ul className="divide-y divide-line-soft">
                {g.items.map(({ c, reason, template, task }) => {
                  const text = fillTemplate(template, vars(c));
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                      <span className="min-w-0 flex-1">
                        <Link href={`/clientes/${c.id}`} className="hover:text-fg">{c.name}</Link>
                        {c.vip && <span className="ml-2 text-xs text-warning">VIP</span>}
                        <span className="block text-sm text-muted">{reason}</span>
                      </span>
                      <span className="hidden text-sm sm:block"><Dot color={STAGE[c.stage].color}>{STAGE[c.stage].label}</Dot></span>
                      {!own && c.spent > 0 && <span className="hidden w-20 text-right text-sm text-muted tnum md:block">{money(c.spent, true)}</span>}
                      <span className="flex items-center">
                        <WhatsAppLink customerId={c.id} url={whatsappUrl(c.phone, text)} text={text}>WhatsApp</WhatsAppLink>
                        <form action={quickTask}>
                          <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="title" value={task} />
                          <button className="btn-ghost text-sm">Para después</button>
                        </form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside className="space-y-6">
          <section>
            <SectionTitle>Nuevo pendiente</SectionTitle>
            <ActionForm action={createTask} resetOnOk className="space-y-3">
              <Field label="Qué hay que hacer"><input name="title" required className="field" placeholder="Llamar a Jorge para confirmar" /></Field>
              <Field label="Teléfono del cliente" hint="Opcional"><input name="customerPhone" inputMode="tel" className="field tnum" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Para"><input type="date" name="dueOn" defaultValue={day} min={addDays(day, -30)} className="field" /></Field>
                {!own && (
                  <Field label="Responsable">
                    <select name="assignedToId" defaultValue={me.id} className="field">
                      <option value="">Cualquiera</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                )}
              </div>
              <Submit className="btn-primary w-full">Agregar</Submit>
            </ActionForm>
          </section>

          {overdue.length > 0 && <section><SectionTitle aside={overdue.length}>Atrasados</SectionTitle><TaskList list={overdue} tone="text-danger" /></section>}
          <section>
            <SectionTitle aside={todays.length || undefined}>Hoy</SectionTitle>
            {todays.length ? <TaskList list={todays} /> : <p className="text-sm text-muted">Sin pendientes para hoy.</p>}
          </section>
          {later.length > 0 && <section><SectionTitle aside={later.length}>Próximos</SectionTitle><TaskList list={later} /></section>}
        </aside>
      </div>
    </>
  );
}
