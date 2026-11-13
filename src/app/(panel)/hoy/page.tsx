import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { dateLabel, localToUtc, timeLabel, today } from "@/lib/time";
import { money } from "@/lib/format";
import { Empty, Figure, PageHeader, RowLink, Rows, SectionTitle, Status } from "@/components/ui";

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
  const [appts, sales, ownItems, low, birthdays, tasks] = await Promise.all([
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
  ]);

  const active = appts.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW");
  const now = Date.now();
  const next = active.filter((a) => a.endsAt.getTime() > now && a.status !== "COMPLETED");
  const done = active.filter((a) => a.status === "COMPLETED").length;
  const pending = active.filter((a) => a.status === "PENDING").length;

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
                    <span className="block truncate">{a.customer.name}</span>
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
