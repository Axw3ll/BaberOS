import Link from "next/link";
import { GettingStarted } from "@/components/getting-started";
import { payrollInfo } from "@/lib/payroll";
import { unpaidCommissions } from "@/lib/cash";
import { CalendarDays, CheckCircle2, ChevronRight, Clock, HandCoins, ListOrdered, MessageCircle, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { addDays, dateLabel, localToUtc, timeLabel, today } from "@/lib/time";
import { noShowCounts } from "@/lib/waitlist";
import { money } from "@/lib/format";
import { Bar, Empty, Figure, PageHeader, RowLink, Rows, SectionTitle, Status } from "@/components/ui";

export const metadata = { title: "Hoy" };

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function HoyPage() {
  const { me, shop } = await requireSection("hoy");
  const tz = shop.timezone, day = today(tz);
  const from = localToUtc(day, 0, tz), to = localToUtc(day, 1440, tz);
  const own = seesOnlyOwnAgenda(me.role);
  const staffFilter = own ? { staffId: me.id } : {};

  const [m, d] = day.slice(5).split("-").map(Number);
  const pay = payrollInfo(shop);
  const [appts, sales, ownItems, low, birthdays, tasks, outbox, payRows, inQueue, waiting] = await Promise.all([
    prisma.appointment.findMany({
      where: { shopId: shop.id, startsAt: { gte: from, lt: to }, ...staffFilter },
      include: { customer: true, staff: true, services: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.sale.aggregate({ where: { shopId: shop.id, status: "PAID", createdAt: { gte: from, lt: to } }, _sum: { total: true } }),
    own
      ? prisma.saleItem.aggregate({
          where: { staffId: me.id, sale: { status: "PAID", createdAt: { gte: from, lt: to } } },
          _sum: { total: true, commission: true },
        })
      : null,
    canAccess(me.role, "productos")
      ? prisma.$queryRaw<{ id: string; name: string; stock: number }[]>`
          SELECT id, name, stock FROM products
          WHERE "shopId" = ${shop.id}::uuid AND active AND stock <= "minStock" ORDER BY stock LIMIT 6`
      : [],
    prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM customers WHERE "shopId" = ${shop.id}::uuid
         AND EXTRACT(MONTH FROM birthday) = ${m} AND EXTRACT(DAY FROM birthday) = ${d} ORDER BY name LIMIT 8`,
    prisma.task.findMany({
      where: { shopId: shop.id, doneAt: null, dueOn: { lte: new Date(`${day}T00:00:00Z`) }, OR: [{ assignedToId: me.id }, { assignedToId: null }] },
      include: { customer: true }, orderBy: { dueOn: "asc" }, take: 6,
    }),
    prisma.outboundMessage.count({
      where: { shopId: shop.id, status: "PENDING", dueAt: { lte: new Date() }, ...(own && { appointment: { staffId: me.id } }) },
    }),
    canAccess(me.role, "ajustes") ? unpaidCommissions(shop.id, undefined, pay.cutoff) : [],
    prisma.queueEntry.count({ where: { shopId: shop.id, status: { in: ["WAITING", "CALLED"] }, createdAt: { gt: new Date(Date.now() - 16 * 3_600_000) } } }),
    own ? [] : prisma.waitlistEntry.findMany({
      where: { shopId: shop.id, status: { in: ["ACTIVE", "NOTIFIED"] }, date: { gte: new Date(`${day}T00:00:00Z`), lte: new Date(`${addDays(day, 7)}T00:00:00Z`) } },
      include: { customer: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: 8,
    }),
  ]);
  const payDue = payRows.reduce((a, r) => a + Number(r.due), 0);

  const active = appts.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW");
  const now = Date.now();
  const next = active.filter((a) => a.endsAt.getTime() > now && a.status !== "COMPLETED");
  const done = active.filter((a) => a.status === "COMPLETED").length;
  const pending = active.filter((a) => a.status === "PENDING").length;
  // Metas del mes: lo vendido (servicios y productos) desde el día 1
  const monthFrom = localToUtc(`${day.slice(0, 7)}-01`, 0, tz);
  const goalStaff = await prisma.staff.findMany({ where: { shopId: shop.id, active: true, monthlyGoal: { gt: 0 }, ...(own && { id: me.id }) }, orderBy: { name: "asc" } });
  const goalSales = goalStaff.length ? await prisma.saleItem.groupBy({
    by: ["staffId"], where: { staffId: { in: goalStaff.map((g) => g.id) }, sale: { status: "PAID", createdAt: { gte: monthFrom } } }, _sum: { total: true },
  }) : [];
  const soldBy = new Map(goalSales.map((g) => [g.staffId, Number(g._sum.total ?? 0)]));
  const goals = goalStaff.map((g) => ({ id: g.id, name: g.name, goal: Number(g.monthlyGoal), sold: soldBy.get(g.id) ?? 0 }))
    .sort((a, b) => b.sold / b.goal - a.sold / a.goal);
  const [yy, mm] = day.split("-").map(Number);
  const daysLeft = new Date(Date.UTC(yy, mm, 0)).getUTCDate() - Number(day.slice(8)) + 1;
  const myGoal = own ? goals[0] : undefined;
  const misses = await noShowCounts(shop.id, [...new Set(next.map((a) => a.customerId))]);

  return (
    <>
      <PageHeader
        title={dateLabel(day)}
        subtitle={`${greeting(tz)}, ${me.name.split(" ")[0]}.`}
        actions={
          <>
            <Link href="/agenda/nueva" className="btn-primary">Nueva cita</Link>
            <Link href="/ventas/nueva" className="btn-quiet">Cobrar</Link>
          </>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
        <Figure value={active.length} label={own ? "Tus citas hoy" : "Citas hoy"} icon={CalendarDays} />
        <Figure value={done} label="Atendidas" icon={CheckCircle2} tone="success" />
        {own && ownItems ? (
          <Figure value={money(ownItems._sum.commission ?? 0)} label="Tu comisión hoy" icon={Wallet} />
        ) : (
          <Figure value={money(sales._sum.total ?? 0)} label="Vendido hoy" icon={Wallet} />
        )}
        {pending > 0 && <Figure value={pending} label="Por confirmar" icon={Clock} tone="warning" />}
      </div>

      {canAccess(me.role, "ajustes") && <GettingStarted shop={shop} />}

      {myGoal && (
        <section className="mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg">Tu meta del mes</h2>
            <span className="text-sm text-muted tnum">{money(myGoal.sold)} de {money(myGoal.goal)}</span>
          </div>
          <div className="mt-3"><Bar value={Math.min(myGoal.sold, myGoal.goal)} max={myGoal.goal} /></div>
          <p className="mt-2 text-sm text-muted">
            {myGoal.sold >= myGoal.goal
              ? "🎉 ¡Meta cumplida! Todo lo que sigue es extra."
              : `Te faltan ${money(myGoal.goal - myGoal.sold)}: unos ${money((myGoal.goal - myGoal.sold) / daysLeft)} por día en los ${daysLeft} días que quedan.`}
          </p>
        </section>
      )}

      {inQueue > 0 && (
        <Link href="/fila" className="card mb-6 flex items-center gap-4 p-4 transition hover:border-brand">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><ListOrdered className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{inQueue} {inQueue === 1 ? "persona espera" : "personas esperan"} en la fila</span>
            <span className="block text-sm text-muted">Clientes sin cita. Toca para pasarlos con un barbero.</span>
          </span>
          <ChevronRight className="size-5 text-faint" />
        </Link>
      )}

      {payDue > 0 && (
        <Link href="/ventas/comisiones" className="card mb-6 flex items-center gap-4 border-warning/40 p-4 transition hover:border-warning">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning"><HandCoins className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{pay.isPayday ? "Hoy toca pagar comisiones" : "Comisiones atrasadas"}: {money(payDue)}</span>
            <span className="block text-sm text-muted">{pay.isPayday ? `Periodo ${pay.periodLabel}.` : "De periodos que ya cerraron."} Toca para ver cuánto le toca a cada quien.</span>
          </span>
          <ChevronRight className="size-5 text-faint" />
        </Link>
      )}

      {outbox > 0 && (
        <Link href="/seguimiento/mensajes" className="card mb-6 flex items-center gap-4 p-4 transition hover:border-brand">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><MessageCircle className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{outbox} {outbox === 1 ? "mensaje listo" : "mensajes listos"} para enviar</span>
            <span className="block text-sm text-muted">Recordatorios y confirmaciones de tus clientes.</span>
          </span>
          <ChevronRight className="size-5 text-faint" />
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section>
          <SectionTitle aside={<Link href="/agenda" className="link">Ver agenda</Link>}>Lo que sigue</SectionTitle>
          {next.length === 0 ? (
            <Empty title={active.length ? "Ya no quedan citas hoy" : "Sin citas para hoy"}>
              {active.length ? "Buen trabajo. Revisa la agenda de mañana o registra una venta." : "Agenda la primera o recibe clientes sin cita desde Cobrar."}
            </Empty>
          ) : (
            <Rows>
              {next.map((a) => (
                <RowLink key={a.id} href={`/citas/${a.id}`}>
                  <span className="w-14 shrink-0 font-display text-lg text-fg tnum">{timeLabel(a.startsAt, tz)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {a.customer.name}
                      {(misses.get(a.customerId) ?? 0) >= shop.noShowLimit && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Faltó {misses.get(a.customerId)} veces</span>}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {a.services.map((s) => s.name).join(", ")}{!own && ` con ${a.staff.name}`}
                    </span>
                  </span>
                  <Status status={a.status} />
                </RowLink>
              ))}
            </Rows>
          )}
        </section>

        <aside className="space-y-6">
        {(tasks.length > 0 || birthdays.length > 0) && (
          <section>
            <SectionTitle aside={<Link href="/seguimiento" className="link">Ver todo</Link>}>Clientes</SectionTitle>
            <ul className="space-y-3 text-sm">
              {birthdays.map((b) => (
                <li key={b.id} className="flex justify-between gap-4">
                  <Link href={`/clientes/${b.id}`} className="truncate text-muted hover:text-fg">{b.name}</Link>
                  <span className="shrink-0 text-warning">Cumple hoy</span>
                </li>
              ))}
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href={t.customer ? `/clientes/${t.customer.id}` : "/seguimiento"} className="block text-muted hover:text-fg">
                    {t.title}
                    {t.dueOn.toISOString().slice(0, 10) < day && <span className="text-danger"> · atrasado</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!own && goals.length > 0 && (
          <section>
            <SectionTitle>Metas del mes</SectionTitle>
            <ul className="space-y-4 text-sm">
              {goals.map((g, i) => (
                <li key={g.id}>
                  <span className="flex justify-between gap-3">
                    <span className="truncate">{i === 0 && g.sold > 0 ? "🏆 " : ""}{g.name.split(" ")[0]}</span>
                    <span className={`tnum ${g.sold >= g.goal ? "text-success" : "text-muted"}`}>{Math.round((g.sold / g.goal) * 100)}%</span>
                  </span>
                  <span className="mt-1.5 block"><Bar value={Math.min(g.sold, g.goal)} max={g.goal} /></span>
                  <span className="mt-1 block text-xs text-faint tnum">{money(g.sold, true)} de {money(g.goal, true)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {waiting.length > 0 && (
          <section>
            <SectionTitle>Lista de espera</SectionTitle>
            <p className="mb-3 text-xs text-muted">Si alguien cancela ese día, les avisamos solos.</p>
            <ul className="space-y-3 text-sm">
              {waiting.map((w) => {
                const d = w.date.toISOString().slice(0, 10);
                return (
                  <li key={w.id} className="flex justify-between gap-4">
                    <Link href={`/clientes/${w.customer.id}`} className="truncate text-muted hover:text-fg">{w.customer.name}</Link>
                    <span className="shrink-0 text-right">
                      {d === day ? "Hoy" : dateLabel(d, { weekday: "short", day: "numeric" })}
                      {w.status === "NOTIFIED" && <span className="block text-xs text-success">Ya se le avisó</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {low.length > 0 && (
          <section>
            <SectionTitle>Por surtir</SectionTitle>
            <ul className="space-y-3">
              {low.map((p) => (
                <li key={p.id} className="flex justify-between gap-4 text-sm">
                  <Link href={`/productos/${p.id}`} className="truncate hover:text-fg text-muted">{p.name}</Link>
                  <span className={p.stock === 0 ? "text-danger tnum" : "text-fg tnum"}>{p.stock === 0 ? "Agotado" : `${p.stock} pzas`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        </aside>
      </div>
    </>
  );
}
