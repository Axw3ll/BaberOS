import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { addDays, dateLabel, isDate, localToUtc, minuteLabel, timeLabel, today, toLocalMinute, weekday } from "@/lib/time";
import { merge, subtract, type Interval } from "@/lib/availability";
import { Empty, PageHeader, STATUS } from "@/components/ui";

export const metadata = { title: "Agenda" };

const HOUR = 72; // px por hora
const px = (min: number) => (min / 60) * HOUR;

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { me, shop } = await requireSection("agenda");
  const tz = shop.timezone;
  const sp = await searchParams;
  const day = isDate(sp.d) ? sp.d : today(tz);
  const isToday = day === today(tz);
  const wd = weekday(day);
  const from = localToUtc(day, 0, tz), to = localToUtc(day, 1440, tz);

  const [hours, staff, appts, closures] = await Promise.all([
    prisma.shopHours.findMany({ where: { shopId: shop.id, weekday: wd } }),
    prisma.staff.findMany({
      where: { shopId: shop.id, active: true, takesAppointments: true, ...(seesOnlyOwnAgenda(me.role) && { id: me.id }) },
      include: {
        schedule: { where: { weekday: wd } },
        timeOff: { where: { startsAt: { lt: to }, endsAt: { gt: from } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.appointment.findMany({
      where: { shopId: shop.id, startsAt: { gte: from, lt: to }, ...(seesOnlyOwnAgenda(me.role) && { staffId: me.id }) },
      include: { customer: true, services: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.closure.findMany({ where: { shopId: shop.id, startsAt: { lt: to }, endsAt: { gt: from } } }),
  ]);

  // Rango visible: horario de la barbería y de los barberos, con margen de media hora
  const all = [...hours, ...staff.flatMap((s) => s.schedule)];
  const startMin = all.length ? Math.max(0, Math.floor((Math.min(...all.map((h) => h.startMinute)) - 30) / 60) * 60) : 9 * 60;
  const endMin = all.length ? Math.min(1440, Math.ceil((Math.max(...all.map((h) => h.endMinute)) + 30) / 60) * 60) : 21 * 60;
  const span = endMin - startMin;
  const hoursList = Array.from({ length: span / 60 }, (_, i) => startMin + i * 60);

  const toMin = (d: Date) => {
    if (d <= from) return 0;
    if (d >= to) return 1440;
    return toLocalMinute(d, tz);
  };
  const closed = hours.length === 0;
  const nowMin = isToday ? toLocalMinute(new Date(), tz) : -1;

  const visible = appts.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW");
  const hidden = appts.length - visible.length;

  return (
    <>
      <PageHeader
        title={dateLabel(day)}
        subtitle={closed ? "La barbería no abre este día." : `${visible.length} ${visible.length === 1 ? "cita" : "citas"}${hidden ? `, ${hidden} cancelada${hidden > 1 ? "s" : ""} o sin llegar` : ""}`}
        actions={
          <>
            <nav aria-label="Cambiar día" className="flex items-center rounded-md border border-line">
              <Link href={`/agenda?d=${addDays(day, -1)}`} className="px-3 py-2 text-ash hover:text-foam" aria-label="Día anterior">‹</Link>
              <Link href="/agenda" className={`border-x border-line px-3 py-2 text-sm ${isToday ? "text-ash-2" : "text-foam"}`}>Hoy</Link>
              <Link href={`/agenda?d=${addDays(day, 1)}`} className="px-3 py-2 text-ash hover:text-foam" aria-label="Día siguiente">›</Link>
            </nav>
            <form className="hidden sm:block">
              <input type="date" name="d" defaultValue={day} className="field py-1.5" aria-label="Ir a fecha" />
            </form>
            <Link href={`/agenda/nueva?d=${day}`} className="btn-primary">Nueva cita</Link>
          </>
        }
      />

      {staff.length === 0 ? (
        <Empty title="Nadie atiende en la agenda" action={<Link href="/equipo" className="btn-quiet">Ir a Equipo</Link>}>
          Agrega un barbero, dale sus servicios y su horario para empezar a recibir citas.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid min-w-fit"
            style={{ gridTemplateColumns: `64px repeat(${staff.length}, minmax(190px, 1fr))`, "--hour": `${HOUR}px` } as React.CSSProperties}
          >
            {/* Encabezados */}
            <div />
            {staff.map((s) => (
              <div key={s.id} className="border-b border-line px-3 pb-3">
                <p className="truncate font-display text-lg">{s.name}</p>
                <p className="text-sm text-ash-2">
                  {s.schedule.length
                    ? s.schedule.sort((a, b) => a.startMinute - b.startMinute).map((h) => `${minuteLabel(h.startMinute)}–${minuteLabel(h.endMinute)}`).join(" y ")
                    : "Descansa"}
                </p>
              </div>
            ))}

            {/* Regla horaria: peine */}
            <div className="comb relative" style={{ height: px(span), backgroundPositionY: 0 }}>
              {hoursList.map((h) => (
                <span key={h} className="absolute right-5 -translate-y-1/2 text-xs text-ash tnum" style={{ top: px(h - startMin) }}>
                  {h > startMin && minuteLabel(h)}
                </span>
              ))}
            </div>

            {staff.map((s) => {
              const working: Interval[] = s.schedule.map((h) => ({ start: h.startMinute, end: h.endMinute }));
              const blocked = merge([
                ...subtract([{ start: startMin, end: endMin }], working),
                ...[...s.timeOff, ...closures].map((t) => ({ start: toMin(t.startsAt), end: toMin(t.endsAt) })),
              ]).map((i) => ({ start: Math.max(i.start, startMin), end: Math.min(i.end, endMin) })).filter((i) => i.end > i.start);

              return (
                <div key={s.id} className="comb-rows relative border-l border-line-soft" style={{ height: px(span) }}>
                  {blocked.map((b, i) => (
                    <div key={i} className="absolute inset-x-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-line-soft)_6px_7px)] opacity-70"
                      style={{ top: px(b.start - startMin), height: px(b.end - b.start) }} aria-hidden />
                  ))}

                  {visible.filter((a) => a.staffId === s.id).map((a) => {
                    const st = toMin(a.startsAt), en = toMin(a.endsAt);
                    const h = px(en - st);
                    const compact = h < 48;
                    return (
                      <Link
                        key={a.id}
                        href={`/citas/${a.id}`}
                        title={`${timeLabel(a.startsAt, tz)}–${timeLabel(a.endsAt, tz)} ${a.customer.name}`}
                        className={`absolute inset-x-1.5 overflow-hidden rounded-md border border-line bg-ink-3 px-3 transition-colors hover:border-ash-2 ${compact ? "flex items-center gap-2" : "py-1.5"}`}
                        style={{ top: px(st - startMin) + 1, height: h - 2, borderLeft: `2px solid ${STATUS[a.status].color}` }}
                      >
                        {compact ? (
                          <>
                            <span className="shrink-0 text-xs text-ash tnum">{timeLabel(a.startsAt, tz)}</span>
                            <span className="truncate text-sm text-foam">{a.customer.name}</span>
                          </>
                        ) : (
                          <>
                            <span className="flex items-baseline justify-between gap-2 text-xs text-ash tnum">
                              {timeLabel(a.startsAt, tz)}–{timeLabel(a.endsAt, tz)}
                              {a.status === "PENDING" && <span className="text-sand">Por confirmar</span>}
                            </span>
                            <span className="block truncate text-sm text-foam">{a.customer.name}</span>
                            {h > 56 && <span className="block truncate text-xs text-ash">{a.services.map((x) => x.name).join(", ")}</span>}
                          </>
                        )}
                      </Link>
                    );
                  })}

                  {nowMin >= startMin && nowMin <= endMin && (
                    <div className="pointer-events-none absolute inset-x-0 h-px bg-nickel" style={{ top: px(nowMin - startMin) }} aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hidden > 0 && (
        <details className="mt-10 text-sm">
          <summary className="cursor-pointer text-ash hover:text-foam">Ver canceladas y sin llegar</summary>
          <ul className="mt-3 space-y-2">
            {appts.filter((a) => !visible.includes(a)).map((a) => (
              <li key={a.id}>
                <Link href={`/citas/${a.id}`} className="text-ash hover:text-foam">
                  <span className="tnum">{timeLabel(a.startsAt, tz)}</span> {a.customer.name}, {STATUS[a.status].label.toLowerCase()}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
