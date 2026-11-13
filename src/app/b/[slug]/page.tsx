import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addDays, today } from "@/lib/time";
import { MapPin, Phone, Scissors } from "lucide-react";
import { Booking } from "./booking";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await prisma.barbershop.findUnique({ where: { slug }, select: { name: true } });
  return { title: shop ? `Reservar en ${shop.name}` : "Reservar" };
}

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await prisma.barbershop.findUnique({ where: { slug } });
  if (!shop) notFound();

  const [services, staff] = await Promise.all([
    prisma.service.findMany({
      where: { shopId: shop.id, active: true, bookableOnline: true, staff: { some: { staff: { active: true, takesAppointments: true } } } },
      include: { staff: true }, orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    prisma.staff.findMany({ where: { shopId: shop.id, active: true, takesAppointments: true }, orderBy: { name: "asc" } }),
  ]);
  const start = today(shop.timezone);
  const days = Array.from({ length: Math.min(shop.maxAdvanceDays, 21) + 1 }, (_, i) => addDays(start, i));

  return (
    <main className="min-h-dvh">
      <div className="bg-brand px-5 pt-12 pb-24 text-on-brand sm:pt-16">
        <header className="mx-auto max-w-xl">
          <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-white/15"><Scissors className="size-6" aria-hidden /></span>
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{shop.name}</h1>
          {(shop.address || shop.phone) && (
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-white/80">
              {shop.address && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{shop.address}</span>}
              {shop.phone && <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-1.5 tnum hover:text-white"><Phone className="size-4" aria-hidden />{shop.phone}</a>}
            </p>
          )}
        </header>
      </div>
      <div className="mx-auto -mt-16 max-w-xl px-4 pb-16">
      <div className="card p-5 sm:p-7">
      {services.length === 0 ? (
        <p className="text-muted">Por ahora no hay reservas en línea. Llama o escribe a la barbería.</p>
      ) : (
        <Booking
          slug={shop.slug}
          tz={shop.timezone}
          days={days}
          services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, minutes: s.minutes, price: Number(s.price), staffIds: s.staff.map((x) => x.staffId) }))}
          staff={staff.map((s) => ({ id: s.id, name: s.name }))}
        />
      )}
      </div>
      <footer className="mt-8 text-center text-sm text-faint">Reservas con BarberOS</footer>
      </div>
    </main>
  );
}
