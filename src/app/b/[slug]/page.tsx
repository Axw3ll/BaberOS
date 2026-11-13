import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addDays, minuteLabel, today, WEEKDAYS } from "@/lib/time";
import { AtSign, Clock, MapPin, Phone, Scissors, Star } from "lucide-react";
import { Booking } from "./booking";
import { turnstileSiteKey } from "@/lib/guard";
import { accessFor, canUsePanel } from "@/lib/billing";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await prisma.barbershop.findUnique({ where: { slug }, select: { name: true, description: true } });
  return { title: shop ? `Reservar en ${shop.name}` : "Reservar", description: shop?.description ?? undefined };
}

export default async function PublicBookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string; fecha?: string; servicio?: string; barbero?: string }> }) {
  const { slug } = await params;
  const { c, fecha, servicio, barbero } = await searchParams;
  const shop = await prisma.barbershop.findUnique({ where: { slug } });
  if (!shop) notFound();
  // Viene de su enlace personal: ya sabemos quién es
  const me = c && /^[0-9a-f]{64}$/.test(c) ? await prisma.customer.findFirst({ where: { token: c, shopId: shop.id } }) : null;

  const [services, staff, hours, ratingAll, ratingByStaff, reviews] = await Promise.all([
    prisma.service.findMany({
      where: { shopId: shop.id, active: true, bookableOnline: true, staff: { some: { staff: { active: true, takesAppointments: true } } } },
      include: { staff: true }, orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    prisma.staff.findMany({ where: { shopId: shop.id, active: true, takesAppointments: true }, orderBy: { name: "asc" } }),
    prisma.shopHours.findMany({ where: { shopId: shop.id }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    prisma.review.aggregate({ where: { shopId: shop.id }, _avg: { rating: true }, _count: true }),
    prisma.review.groupBy({ by: ["staffId"], where: { shopId: shop.id }, _avg: { rating: true }, _count: true }),
    prisma.review.findMany({
      where: { shopId: shop.id, rating: { gte: 4 }, comment: { not: null } }, include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: 4,
    }),
  ]);
  // Calificaciones: se muestran a partir de 3 para que una sola no defina la imagen
  const showRating = ratingAll._count >= 3;
  const staffRating = new Map(ratingByStaff.filter((x) => x._count >= 3).map((x) => [x.staffId, x._avg.rating!]));
  // Horario agrupado por día (lunes primero)
  const week = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    day: WEEKDAYS[d], blocks: hours.filter((h) => h.weekday === d).map((h) => `${minuteLabel(h.startMinute)} – ${minuteLabel(h.endMinute)}`),
  }));
  const todayIdx = new Date(`${today(shop.timezone)}T12:00:00Z`).getUTCDay();
  const start = today(shop.timezone);
  const days = Array.from({ length: Math.min(shop.maxAdvanceDays, 21) + 1 }, (_, i) => addDays(start, i));

  return (
    <main className="min-h-dvh">
      <div className="bg-brand px-5 pt-12 pb-24 text-on-brand sm:pt-16">
        <header className="mx-auto max-w-xl">
          <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-white/15"><Scissors className="size-6" aria-hidden /></span>
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{shop.name}</h1>
          {showRating && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-white/90">
              <Star className="size-4 fill-current" aria-hidden /><span className="font-semibold tnum">{ratingAll._avg.rating!.toFixed(1)}</span>
              <span className="text-white/70">· {ratingAll._count} calificaciones de clientes</span>
            </p>
          )}
          {shop.description && <p className="mt-3 max-w-lg text-white/85">{shop.description}</p>}
          {(shop.address || shop.phone || shop.instagram) && (
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-white/80">
              {shop.address && (shop.mapsUrl
                ? <a href={shop.mapsUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 underline-offset-2 hover:text-white hover:underline"><MapPin className="size-4" aria-hidden />{shop.address}</a>
                : <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{shop.address}</span>)}
              {shop.phone && <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-1.5 tnum hover:text-white"><Phone className="size-4" aria-hidden />{shop.phone}</a>}
              {shop.instagram && <a href={`https://instagram.com/${shop.instagram}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 hover:text-white"><AtSign className="size-4" aria-hidden />@{shop.instagram}</a>}
            </p>
          )}
        </header>
      </div>
      <div className="mx-auto -mt-16 max-w-xl px-4 pb-16">
      <div className="card p-5 sm:p-7">
      {!canUsePanel(accessFor(shop)) ? (
        <p className="text-muted">Las reservas en línea no están disponibles por ahora. Llama o escribe a la barbería.</p>
      ) : services.length === 0 ? (
        <p className="text-muted">Por ahora no hay reservas en línea. Llama o escribe a la barbería.</p>
      ) : (
        <Booking
          slug={shop.slug}
          tz={shop.timezone}
          days={days}
          services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, minutes: s.minutes, price: Number(s.price), staffIds: s.staff.map((x) => x.staffId) }))}
          staff={staff.map((s) => ({ id: s.id, name: s.name }))}
          captchaKey={turnstileSiteKey}
          shopName={shop.name}
          known={me && { name: me.name, phone: me.phone }}
          initial={{ serviceId: servicio, staffId: barbero, date: fecha }}
        />
      )}
      </div>
      {staff.some((s) => s.bio || staffRating.has(s.id)) && (
        <section className="card mt-4 p-5 sm:p-7">
          <h2 className="mb-4 font-display text-xl">El equipo</h2>
          <ul className="space-y-4">
            {staff.map((s) => (
              <li key={s.id} className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand">{s.name.charAt(0)}</span>
                <span className="min-w-0">
                  <span className="block font-medium">
                    {s.name}
                    {staffRating.has(s.id) && <span className="ml-2 text-sm font-normal text-muted"><span className="text-warning">★</span> {staffRating.get(s.id)!.toFixed(1)}</span>}
                  </span>
                  {s.bio && <span className="block text-sm text-muted">{s.bio}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="card mt-4 p-5 sm:p-7">
          <h2 className="mb-4 font-display text-xl">Lo que dicen nuestros clientes</h2>
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.id}>
                <span className="text-warning" aria-label={`${r.rating} de 5`}>{"★".repeat(r.rating)}</span>
                <p className="mt-1">“{r.comment}”</p>
                <p className="text-sm text-muted">{r.customer.name.split(" ")[0]}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hours.length > 0 && (
        <section className="card mt-4 p-5 sm:p-7">
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl"><Clock className="size-5 text-brand" aria-hidden />Horario</h2>
          <dl className="space-y-1.5 text-sm">
            {week.map((w) => (
              <div key={w.day} className={`flex justify-between gap-4 ${w.day === WEEKDAYS[todayIdx] ? "font-semibold" : ""}`}>
                <dt>{w.day}</dt>
                <dd className={`tnum ${w.blocks.length ? "" : "text-muted"}`}>{w.blocks.length ? w.blocks.join(", ") : "Cerrado"}</dd>
              </div>
            ))}
          </dl>
          {shop.mapsUrl && <a href={shop.mapsUrl} target="_blank" rel="noopener" className="btn-quiet mt-5 w-full"><MapPin className="size-4" aria-hidden />Cómo llegar</a>}
        </section>
      )}

      <footer className="mt-8 text-center text-sm text-faint">Reservas con <a href="/" className="underline">BarberOS</a></footer>
      </div>
    </main>
  );
}
