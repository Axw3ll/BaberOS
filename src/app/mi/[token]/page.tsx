import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CalendarPlus, ChevronRight, MapPin, Phone, Scissors, Star } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { dateLabel, timeLabel, toLocalDate } from "@/lib/time";
import { money } from "@/lib/format";
import { stampRewardLabel } from "@/lib/loyalty";
import { StampCard } from "@/components/stamp-card";
import { Dot, STATUS } from "@/components/ui";
import { MarketingToggle } from "./marketing";

export const metadata = { title: "Mi tarjeta", robots: { index: false } };

/** Página personal del cliente: sin cuenta ni contraseña, el enlace es la llave. */
export default async function MyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const c = await prisma.customer.findUnique({
    where: { token },
    include: {
      shop: true,
      appointments: { include: { services: true, staff: true }, orderBy: { startsAt: "desc" }, take: 40 },
      packages: { where: { status: "ACTIVE", expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" } },
    },
  });
  if (!c) notFound();
  const { shop } = c;
  const tz = shop.timezone, now = Date.now();
  const upcoming = c.appointments.filter((a) => a.startsAt.getTime() > now && (a.status === "PENDING" || a.status === "CONFIRMED")).reverse();
  const past = c.appointments.filter((a) => a.status === "COMPLETED").slice(0, 10);
  const first = c.name.split(/\s+/)[0];
  const when = (d: Date) => `${dateLabel(toLocalDate(d, tz), { weekday: "long", day: "numeric", month: "long" })}, ${timeLabel(d, tz)}`;

  return (
    <main className="min-h-dvh bg-canvas">
      <div className="bg-brand px-5 pt-10 pb-20 text-on-brand">
        <div className="mx-auto max-w-md">
          <span className="mb-5 flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15"><Scissors className="size-5" /></span>
            <span className="font-display text-lg">{shop.name}</span>
          </span>
          <h1 className="font-display text-3xl">Hola, {first}</h1>
          <p className="mt-1 text-white/80">Tu tarjeta, tus citas y tus visitas en {shop.name}.</p>
        </div>
      </div>

      <div className="mx-auto -mt-12 max-w-md space-y-4 px-4 pb-12">
        {shop.loyaltyMode === "STAMPS" && (
          <section className="card p-4">
            <StampCard stamps={c.stamps} required={shop.stampsRequired} rewards={c.stampRewards} rewardLabel={stampRewardLabel(shop)} />
            <p className="mt-3 text-sm text-muted">Ganas un sello en cada visita. Al juntar {shop.stampsRequired}, tu siguiente visita tiene {stampRewardLabel(shop)}.</p>
          </section>
        )}
        {c.packages.filter((p) => p.usesLeft === null || p.usesLeft > 0).map((p) => (
          <section key={p.id} className="card flex items-center gap-4 p-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-2xl">🎟</span>
            <span>
              <span className="block font-semibold">{p.name}</span>
              <span className="text-sm text-muted">
                {p.usesLeft === null ? "Ilimitado" : `Te quedan ${p.usesLeft} de ${p.usesTotal}`} · vence el {dateLabel(toLocalDate(p.expiresAt, tz), { day: "numeric", month: "long" })}
              </span>
            </span>
          </section>
        ))}
        {shop.loyaltyMode === "POINTS" && Number(shop.loyaltyPointsPerPeso) > 0 && (
          <section className="card flex items-center gap-4 p-5">
            <span className="grid size-12 place-items-center rounded-2xl bg-warning/10 text-warning"><Star className="size-6" /></span>
            <span>
              <span className="block font-display text-2xl tnum">{c.points.toLocaleString("es-MX")} puntos</span>
              <span className="text-sm text-muted">Equivalen a {money(c.points * Number(shop.loyaltyPesoPerPoint))} de descuento en tu próxima visita.</span>
            </span>
          </section>
        )}

        <section className="card p-5">
          <h2 className="mb-3 font-display text-lg">Tu próxima cita</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">No tienes citas agendadas.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((a) => (
                <li key={a.id}>
                  <Link href={`/c/${a.token}`} className="flex items-center gap-3 rounded-xl bg-hover p-3 transition hover:bg-brand-soft">
                    <CalendarCheck className="size-5 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{when(a.startsAt)}</span>
                      <span className="block truncate text-sm text-muted">{a.services.map((s) => s.name).join(", ")} con {a.staff.name}</span>
                    </span>
                    <Dot color={STATUS[a.status].color}>{a.status === "CONFIRMED" ? "Confirmada" : "Por confirmar"}</Dot>
                    <ChevronRight className="size-4 shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/b/${shop.slug}?c=${token}`} className="btn-primary mt-4 w-full py-2.5"><CalendarPlus className="size-4" />Reservar una cita</Link>
        </section>

        {past.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-3 font-display text-lg">Tus visitas</h2>
            <ul className="divide-y divide-line-soft text-sm">
              {past.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-2.5">
                  <span>
                    <span className="block">{a.services.map((s) => s.name).join(", ")}</span>
                    <span className="text-muted">con {a.staff.name}</span>
                  </span>
                  <span className="shrink-0 text-right text-muted">{dateLabel(toLocalDate(a.startsAt, tz), { day: "numeric", month: "short", year: "numeric" })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card space-y-3 p-5">
          {shop.address && <p className="flex items-center gap-2 text-sm text-muted"><MapPin className="size-4 shrink-0" />{shop.address}</p>}
          {shop.phone && <a href={`tel:${shop.phone}`} className="flex items-center gap-2 text-sm text-muted tnum hover:text-fg"><Phone className="size-4 shrink-0" />{shop.phone}</a>}
          <div className="border-t border-line-soft pt-3"><MarketingToggle token={token} accepts={c.acceptsMarketing} /></div>
        </section>
        <p className="text-center text-xs text-faint">Guarda este enlace: es solo tuyo. <Link href="/privacidad" className="underline">Aviso de privacidad</Link></p>
      </div>
    </main>
  );
}
