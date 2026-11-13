import Link from "next/link";
import { CalendarCheck, CalendarClock, Repeat, Scissors, Star, TrendingUp, UserX, Wallet } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { dateLabel, dateTimeLabel, toLocalDate, today } from "@/lib/time";
import { money } from "@/lib/format";
import {
  ACTIVITY, birthdayLabel, bookingUrl, customerStats, daysToBirthday, fillTemplate, loyaltyOn, ORIGIN,
  QUICK_MESSAGES, STAGE, TAG_COLORS, TAG_LABEL, tagColor, whatsappUrl,
} from "@/lib/crm";
import { Chip, Dot, Field, Figure, PageHeader, SectionTitle, Status } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { WhatsAppMenu } from "@/components/whatsapp-menu";
import { addActivity, adjustPoints, createTag, deleteActivity, deleteCustomer, toggleTag, updateCustomer } from "../actions";
import { createTask, deleteTask, toggleTask } from "../../seguimiento/actions";

export const metadata = { title: "Cliente" };

type Event =
  | { kind: "appt"; at: Date; id: string; title: string; who: string; status: Parameters<typeof Status>[0]["status"]; sale?: { id: string; folio: number; total: number } }
  | { kind: "sale"; at: Date; id: string; folio: number; total: number; title: string; voided: boolean }
  | { kind: "activity"; at: Date; id: string; type: keyof typeof ACTIVITY; body: string; who: string | null; mine: boolean };

export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { shop, me } = await requireSection("clientes");
  const tz = shop.timezone;

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Todo en paralelo: la ficha se arma en una sola ida a la base
  const [c, [stats], tags, staff, favorites, products] = await Promise.all([prisma.customer.findFirst({
    where: { id, shopId: shop.id },
    include: {
      tags: true, preferredStaff: true, referredBy: true,
      referrals: { select: { id: true, name: true }, orderBy: { createdAt: "desc" } },
      appointments: { include: { services: true, staff: true, sale: true }, orderBy: { startsAt: "desc" }, take: 60 },
      sales: { where: { appointmentId: null }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 40 },
      activities: { include: { staff: true }, orderBy: { createdAt: "desc" }, take: 60 },
      tasks: { include: { assignedTo: true }, orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueOn: "asc" }], take: 20 },
      loyalty: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  }),
    customerStats(shop.id, { customerId: id, lostAfterDays: shop.lostAfterDays }),
    prisma.tag.findMany({ where: { shopId: shop.id }, orderBy: { name: "asc" } }),
    prisma.staff.findMany({ where: { shopId: shop.id, active: true }, orderBy: { name: "asc" } }),
    prisma.$queryRaw<{ service: string; staff: string; n: number }[]>`
      SELECT s.name AS service, st.name AS staff, count(*)::int AS n
        FROM appointments a
        JOIN appointment_services s ON s."appointmentId" = a.id
        JOIN staff st ON st.id = a."staffId"
       WHERE a."customerId" = ${id}::uuid AND a."shopId" = ${shop.id}::uuid AND a.status = 'COMPLETED'
       GROUP BY 1, 2`,
    prisma.$queryRaw<{ name: string; qty: number; last: Date }[]>`
      SELECT i.name, sum(i.quantity)::int AS qty, max(s."createdAt") AS last
        FROM sale_items i JOIN sales s ON s.id = i."saleId"
       WHERE s."customerId" = ${id}::uuid AND s."shopId" = ${shop.id}::uuid AND s.status = 'PAID' AND i.kind = 'PRODUCT'
       GROUP BY 1 ORDER BY qty DESC LIMIT 5`,
  ]);
  if (!c || !stats) notFound();

  const seesMoney = me.role !== "BARBER" && canAccess(me.role, "ventas");
  const canAdjust = me.role !== "BARBER";
  const isAdmin = canAccess(me.role, "ajustes");
  const top = (key: "service" | "staff") => {
    const m = new Map<string, number>();
    for (const f of favorites) m.set(f[key], (m.get(f[key]) ?? 0) + f.n);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  };
  const favService = top("service"), favStaff = top("staff");
  const paidTickets = c.appointments.filter((a) => a.sale?.status === "PAID").length + c.sales.filter((s) => s.status === "PAID").length;
  const avgTicket = paidTickets ? stats.spent / paidTickets : 0;
  const now = Date.now();
  const nextAppt = [...c.appointments].reverse().find((a) => a.startsAt.getTime() > now && !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(a.status));
  const day = today(tz);
  const bday = c.birthday ? daysToBirthday(c.birthday, day) : null;
  const loyalty = loyaltyOn(shop);
  const myTagIds = new Set(c.tags.map((t) => t.tagId));

  // Mensajes de WhatsApp listos para mandar
  const vars = { nombre: c.name, barberia: shop.name, enlace: bookingUrl(shop.slug), puntos: c.points };
  const messages = QUICK_MESSAGES.map((m) => {
    const text = fillTemplate(m.text, vars);
    return { label: m.label, text, url: whatsappUrl(c.phone, text) };
  });

  // Línea de tiempo: citas, ventas sin cita y bitácora
  const events: Event[] = [
    ...c.appointments
      .filter((a) => !seesOnlyOwnAgenda(me.role) || a.staffId === me.id || a.status === "COMPLETED")
      .map((a): Event => ({
        kind: "appt", at: a.startsAt, id: a.id, title: a.services.map((s) => s.name).join(", "), who: a.staff.name, status: a.status,
        sale: a.sale ? { id: a.sale.id, folio: a.sale.folio, total: Number(a.sale.total) } : undefined,
      })),
    ...c.sales.map((s): Event => ({
      kind: "sale", at: s.createdAt, id: s.id, folio: s.folio, total: Number(s.total), voided: s.status === "VOIDED",
      title: s.items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name)).join(", "),
    })),
    ...c.activities.map((a): Event => ({
      kind: "activity", at: a.createdAt, id: a.id, type: a.type, body: a.body, who: a.staff?.name ?? null, mine: a.staffId === me.id,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const openTasks = c.tasks.filter((t) => !t.doneAt);
  const doneTasks = c.tasks.filter((t) => t.doneAt).slice(0, 3);

  return (
    <>
      <PageHeader back={{ href: "/clientes", label: "Clientes" }}
        title={<>{c.name}{stats.vip && <span className="ml-3 align-middle font-sans text-sm text-warning">VIP</span>}</>}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href={`tel:${c.phone}`} className="link tnum">{c.phone}</a>
            <Dot color={STAGE[stats.stage].color}>{STAGE[stats.stage].label}</Dot>
            {bday !== null && bday <= 7 && <span className="text-sm text-warning">{bday === 0 ? "¡Hoy es su cumpleaños!" : `Cumple en ${bday} ${bday === 1 ? "día" : "días"}`}</span>}
            {!c.acceptsMarketing && <span className="text-sm text-faint">No quiere promociones</span>}
          </span>
        }
        actions={
          <>
            <WhatsAppMenu customerId={c.id} messages={messages} chatUrl={whatsappUrl(c.phone)}
              disabled={c.acceptsMarketing ? undefined : "Pidió no recibir promociones. Solo abre el chat para temas de su cita."} />
            {canAccess(me.role, "ventas") && stats.visits > 0 && (
              <Link href={`/ventas/nueva?cliente=${c.id}`} className="btn-quiet">Cobrar lo de siempre</Link>
            )}
            <Link href={`/agenda/nueva?cliente=${c.id}`} className="btn-primary">Agendar cita</Link>
          </>
        } />

      {error === "citas" && <p role="alert" className="-mt-4 mb-10 text-danger">No se puede borrar: tiene citas en el historial.</p>}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
        <Figure value={stats.visits} label="Visitas" icon={Scissors} />
        {seesMoney && <Figure value={money(stats.spent, true)} label="Ha gastado" icon={Wallet} />}
        {seesMoney && paidTickets > 0 && <Figure value={money(avgTicket, true)} label="Ticket promedio" icon={TrendingUp} />}
        {stats.cadence && <Figure value={`${stats.cadence} días`} label="Viene cada" icon={Repeat} />}
        {nextAppt ? (
          <Figure value={dateTimeLabel(nextAppt.startsAt, tz)} label="Próxima cita" icon={CalendarCheck} tone="success" />
        ) : stats.expectedBack && stats.stage !== "perdido" ? (
          <Figure value={dateLabel(toLocalDate(stats.expectedBack, tz), { day: "numeric", month: "short" })} label={stats.expectedBack.getTime() < now ? "Debió volver" : "Debería volver"} icon={CalendarClock} tone="warning" />
        ) : null}
        {loyalty && <Figure value={c.points.toLocaleString("es-MX")} label="Puntos" icon={Star} tone="warning" />}
        {stats.noShows > 0 && <Figure value={stats.noShows} label="Veces que no llegó" icon={UserX} tone="danger" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {(favService || favStaff || products.length > 0 || c.notes) && (
            <section>
              <SectionTitle>Lo que le gusta</SectionTitle>
              <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
                {favService && <div><dt className="text-sm text-muted">Servicio de siempre</dt><dd>{favService[0]} <span className="text-muted">· {favService[1]} {favService[1] === 1 ? "vez" : "veces"}</span></dd></div>}
                {(c.preferredStaff || favStaff) && (
                  <div><dt className="text-sm text-muted">Barbero</dt>
                    <dd>{c.preferredStaff?.name ?? favStaff![0]}{!c.preferredStaff && <span className="text-muted"> · lo atiende más seguido</span>}</dd></div>
                )}
                {products.length > 0 && (
                  <div className="sm:col-span-2"><dt className="text-sm text-muted">Productos que compra</dt>
                    <dd>{products.map((p) => `${p.name}${p.qty > 1 ? ` (${p.qty})` : ""}`).join(", ")}</dd></div>
                )}
                {c.notes && <div className="sm:col-span-2"><dt className="text-sm text-muted">Nota</dt><dd className="whitespace-pre-line">{c.notes}</dd></div>}
              </dl>
            </section>
          )}

          <section>
            <SectionTitle aside={`${events.length} ${events.length === 1 ? "evento" : "eventos"}`}>Historial y bitácora</SectionTitle>
            <ActionForm action={addActivity} resetOnOk className="mb-8">
              <input type="hidden" name="customerId" value={c.id} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <select name="type" aria-label="Tipo" className="field sm:w-36" defaultValue="NOTE">
                  {Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input name="body" className="field flex-1" placeholder="Llamé para confirmar, se quejó del tiempo de espera…" aria-label="Qué pasó" />
                <Submit className="btn-quiet" pending="…">Anotar</Submit>
              </div>
            </ActionForm>

            {events.length === 0 ? <p className="text-muted">Sin movimientos todavía.</p> : (
              <ol className="relative space-y-0 border-l border-line-soft pl-6">
                {events.slice(0, 50).map((e) => (
                  <li key={`${e.kind}-${e.id}`} className="relative pb-6">
                    <span className="absolute top-2 -left-[27px] size-[7px] rounded-full border border-canvas"
                      style={{ background: e.kind === "activity" ? (e.type === "COMPLAINT" ? "var(--color-danger)" : "var(--color-muted)") : e.kind === "sale" ? "var(--color-success)" : "var(--color-brand)" }} aria-hidden />
                    <p className="text-sm text-faint tnum">{dateTimeLabel(e.at, tz)}</p>
                    {e.kind === "appt" && (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <Link href={`/citas/${e.id}`} className="hover:text-fg">{e.title}<span className="text-muted"> con {e.who}</span></Link>
                        <span className="flex items-center gap-4">
                          {e.sale && seesMoney && <Link href={`/ventas/${e.sale.id}`} className="text-sm text-muted tnum hover:text-fg">#{e.sale.folio} · {money(e.sale.total)}</Link>}
                          <Status status={e.status} />
                        </span>
                      </div>
                    )}
                    {e.kind === "sale" && (
                      <div className={`flex flex-wrap items-baseline justify-between gap-x-4 ${e.voided ? "text-faint line-through" : ""}`}>
                        <span>Compra sin cita: <span className="text-muted">{e.title}</span></span>
                        {seesMoney && <Link href={`/ventas/${e.id}`} className="text-sm text-muted tnum hover:text-fg">#{e.folio} · {money(e.total)}</Link>}
                      </div>
                    )}
                    {e.kind === "activity" && (
                      <div className="flex items-start justify-between gap-4">
                        <p>
                          <span className={e.type === "COMPLAINT" ? "text-danger" : "text-muted"}>{ACTIVITY[e.type]}</span>
                          {e.who && <span className="text-faint"> · {e.who}</span>}
                          <span className="mt-0.5 block whitespace-pre-line">{e.body}</span>
                        </p>
                        {(e.mine || isAdmin) && (
                          <form action={deleteActivity}><input type="hidden" name="id" value={e.id} /><button className="btn-ghost text-xs" aria-label="Borrar nota">Borrar</button></form>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section>
            <SectionTitle>Seguimiento</SectionTitle>
            {openTasks.length > 0 && (
              <ul className="mb-5 space-y-3">
                {openTasks.map((t) => {
                  const due = t.dueOn.toISOString().slice(0, 10);
                  return (
                    <li key={t.id} className="flex items-start gap-3">
                      <form action={toggleTask}><input type="hidden" name="id" value={t.id} />
                        <button className="mt-0.5 size-4 rounded-sm border border-faint hover:border-fg" aria-label={`Marcar hecho: ${t.title}`} /></form>
                      <span className="min-w-0 flex-1 text-sm">
                        {t.title}
                        <span className={`block ${due < day ? "text-danger" : "text-muted"}`}>
                          {due === day ? "Hoy" : dateLabel(due, { day: "numeric", month: "short" })}{t.assignedTo && ` · ${t.assignedTo.name}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {doneTasks.length > 0 && (
              <ul className="mb-5 space-y-1 text-sm text-faint">
                {doneTasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="line-through">{t.title}</span>
                    <form action={deleteTask}><input type="hidden" name="id" value={t.id} /><button className="text-xs hover:text-fg">Quitar</button></form>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={createTask} resetOnOk className="space-y-2">
              <input type="hidden" name="customerId" value={c.id} />
              <input name="title" className="field" placeholder="Llamar para su próximo corte" aria-label="Qué hay que hacer" required />
              <div className="flex gap-2">
                <input type="date" name="dueOn" defaultValue={day} className="field" aria-label="Para cuándo" />
                {!seesOnlyOwnAgenda(me.role) && (
                  <select name="assignedToId" defaultValue={me.id} className="field" aria-label="Responsable">
                    <option value="">Cualquiera</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
              <Submit className="btn-quiet w-full">Agendar seguimiento</Submit>
            </ActionForm>
          </section>

          <section>
            <SectionTitle>Etiquetas</SectionTitle>
            {tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <form key={t.id} action={toggleTag}>
                    <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="tagId" value={t.id} />
                    <button aria-pressed={myTagIds.has(t.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${myTagIds.has(t.id) ? "border-brand bg-selected text-fg" : "border-line text-faint hover:text-fg"}`}>
                      <span className="size-1.5 rounded-full" style={{ background: tagColor(t.color) }} aria-hidden />{t.name}
                    </button>
                  </form>
                ))}
              </div>
            )}
            <ActionForm action={createTag} resetOnOk>
              <input type="hidden" name="customerId" value={c.id} />
              <div className="flex gap-2">
                <input name="name" className="field py-1.5 text-sm" placeholder="Nueva etiqueta" aria-label="Nueva etiqueta" maxLength={30} />
                <select name="color" className="field w-28 py-1.5 text-sm" aria-label="Color" defaultValue="nickel">
                  {TAG_COLORS.map((col) => <option key={col} value={col}>{TAG_LABEL[col]}</option>)}
                </select>
                <Submit className="btn-ghost" pending="…">Crear</Submit>
              </div>
            </ActionForm>
          </section>

          {!loyalty && isAdmin && (
            <section>
              <SectionTitle>Puntos</SectionTitle>
              <p className="text-sm text-muted">
                El programa de puntos está apagado: los clientes no acumulan ni canjean. Actívalo en{" "}
                <Link href="/ajustes#lealtad" className="link">Ajustes → Clientes y lealtad</Link>.
              </p>
            </section>
          )}

          {loyalty && (
            <section>
              <SectionTitle aside={<span className="tnum">{c.points.toLocaleString("es-MX")} pts ≈ {money(c.points * Number(shop.loyaltyPesoPerPoint))}</span>}>Puntos</SectionTitle>
              {c.loyalty.length > 0 && (
                <ul className="mb-5 space-y-1.5 text-sm">
                  {c.loyalty.map((m) => (
                    <li key={m.id} className="flex justify-between gap-3">
                      <span className="truncate text-muted">{m.note ?? { EARN: "Ganados", REDEEM: "Canje", ADJUST: "Ajuste" }[m.kind]}</span>
                      <span className={`tnum ${m.points < 0 ? "text-danger" : "text-success"}`}>{m.points > 0 ? "+" : ""}{m.points}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canAdjust && (
                <ActionForm action={adjustPoints} resetOnOk>
                  <input type="hidden" name="customerId" value={c.id} />
                  <div className="flex gap-2">
                    <input name="points" inputMode="numeric" className="field w-24 py-1.5 text-sm tnum" placeholder="±100" aria-label="Puntos" />
                    <input name="note" className="field py-1.5 text-sm" placeholder="Motivo" aria-label="Motivo" />
                    <Submit className="btn-ghost" pending="…">Aplicar</Submit>
                  </div>
                </ActionForm>
              )}
            </section>
          )}

          <section>
            <SectionTitle>Datos</SectionTitle>
            <ActionForm action={updateCustomer} className="space-y-4">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="marketingShown" value="1" />
              <Field label="Nombre"><input name="name" defaultValue={c.name} required className="field" /></Field>
              <Field label="Teléfono"><input name="phone" defaultValue={c.phone} inputMode="tel" required className="field tnum" /></Field>
              <Field label="Email"><input name="email" type="email" defaultValue={c.email ?? ""} className="field" /></Field>
              <Field label="Cumpleaños" hint={c.birthday ? birthdayLabel(c.birthday) : "Si no sabe el año, pon cualquiera"}>
                <input name="birthday" type="date" defaultValue={c.birthday?.toISOString().slice(0, 10) ?? ""} className="field" />
              </Field>
              <Field label="¿Cómo nos conoció?">
                <select name="origin" className="field" defaultValue={c.origin ?? ""}>
                  <option value="">Sin dato</option>
                  {Object.entries(ORIGIN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Lo recomendó (teléfono)" hint={c.referredBy ? `Ahora: ${c.referredBy.name}` : undefined}>
                <input name="referredByPhone" defaultValue={c.referredBy?.phone ?? ""} inputMode="tel" className="field tnum" />
              </Field>
              <Field label="Barbero de confianza">
                <select name="preferredStaffId" className="field" defaultValue={c.preferredStaffId ?? ""}>
                  <option value="">El que esté libre</option>
                  {staff.filter((s) => s.takesAppointments).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Nota"><textarea name="notes" rows={4} defaultValue={c.notes ?? ""} className="field" placeholder="Cómo le gusta el corte, preferencias…" /></Field>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" name="acceptsMarketing" defaultChecked={c.acceptsMarketing} className="size-4 accent-[var(--color-brand)]" />
                Acepta recibir promociones
              </label>
              <Submit className="btn-quiet">Guardar</Submit>
            </ActionForm>
            {c.referrals.length > 0 && (
              <p className="mt-6 text-sm text-muted">
                Ha recomendado a {c.referrals.map((r, i) => (
                  <span key={r.id}>{i > 0 && ", "}<Link href={`/clientes/${r.id}`} className="link">{r.name}</Link></span>
                ))}.
              </p>
            )}
            <p className="mt-6 text-xs text-faint">Cliente desde {dateLabel(toLocalDate(c.createdAt, tz), { day: "numeric", month: "long", year: "numeric" })}</p>
            {isAdmin && (
              <form action={deleteCustomer} className="mt-4">
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-faint hover:text-danger">Borrar cliente</button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
