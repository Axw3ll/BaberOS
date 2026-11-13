"use server";
import { prisma } from "@/lib/prisma";
import { book, BookingError, slotsFor } from "@/lib/booking";
import { addDays, dateLabel, isDate, timeLabel, toLocalDate, today } from "@/lib/time";

async function shopBySlug(slug: string) {
  return prisma.barbershop.findUnique({ where: { slug } });
}

async function candidates(shopId: string, serviceId: string, staffId: string) {
  const service = await prisma.service.findFirst({ where: { id: serviceId, shopId, active: true, bookableOnline: true } });
  if (!service) return [];
  return prisma.staff.findMany({
    where: { shopId, active: true, takesAppointments: true, services: { some: { serviceId } }, ...(staffId !== "any" && { id: staffId }) },
    orderBy: { name: "asc" },
  });
}

export async function publicSlots(input: { slug: string; serviceId: string; staffId: string; date: string }) {
  const shop = await shopBySlug(input.slug);
  if (!shop || !isDate(input.date)) return [];
  const t = today(shop.timezone);
  if (input.date < t || input.date > addDays(t, shop.maxAdvanceDays)) return [];

  const staff = await candidates(shop.id, input.serviceId, input.staffId);
  const byTime = new Map<number, string>();
  for (const s of staff) {
    const slots = await slotsFor({ shopId: shop.id, staffId: s.id, serviceIds: [input.serviceId], date: input.date });
    for (const t of slots) if (!byTime.has(t)) byTime.set(t, s.id);
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([t, staffId]) => ({ at: new Date(t).toISOString(), staffId }));
}

export async function publicBook(input: {
  slug: string; serviceId: string; staffId: string; at: string; name: string; phone: string; notes?: string;
}): Promise<{ error: string } | { ok: true; summary: string }> {
  const shop = await shopBySlug(input.slug);
  if (!shop) return { error: "Esta barbería no existe." };
  const at = new Date(input.at);
  if (Number.isNaN(at.getTime())) return { error: "Elige un horario." };
  const allowed = await candidates(shop.id, input.serviceId, input.staffId);
  if (!allowed.length) return { error: "Ese servicio ya no está disponible en línea." };

  try {
    const a = await book({
      shopId: shop.id, staffId: input.staffId, serviceIds: [input.serviceId], startsAt: at,
      customer: { name: input.name.slice(0, 80), phone: input.phone },
      source: "ONLINE", notes: input.notes?.slice(0, 300),
      checkAvailability: { ignoreNotice: false, date: toLocalDate(at, shop.timezone) },
    });
    const staff = allowed.find((s) => s.id === a.staffId)!;
    return { ok: true, summary: `${dateLabel(toLocalDate(a.startsAt, shop.timezone))} a las ${timeLabel(a.startsAt, shop.timezone)} con ${staff.name}` };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}
