import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addDays, today } from "@/lib/time";
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
    <main className="mx-auto max-w-xl px-5 pt-16 pb-24 sm:pt-24">
      <header className="mb-14">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">{shop.name}</h1>
        {(shop.address || shop.phone) && (
          <p className="mt-3 text-ash">
            {shop.address}
            {shop.address && shop.phone && <br />}
            {shop.phone && <a href={`tel:${shop.phone}`} className="link tnum">{shop.phone}</a>}
          </p>
        )}
      </header>

      {services.length === 0 ? (
        <p className="text-ash">Por ahora no hay reservas en línea. Llama o escribe a la barbería.</p>
      ) : (
        <Booking
          slug={shop.slug}
          tz={shop.timezone}
          days={days}
          services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, minutes: s.minutes, price: Number(s.price), staffIds: s.staff.map((x) => x.staffId) }))}
          staff={staff.map((s) => ({ id: s.id, name: s.name }))}
        />
      )}
      <footer className="mt-24 text-sm text-ash-2">Reservas con BarberOS</footer>
    </main>
  );
}
