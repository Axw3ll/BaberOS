import "server-only";
import { prisma } from "./prisma";
import { computeSlots } from "./availability";
import { localToUtc } from "./time";
import type { AppointmentSource } from "@/generated/prisma/enums";

export class BookingError extends Error {}
const INACTIVE = ["CANCELLED", "NO_SHOW"] as const;

export async function servicesFor(shopId: string, serviceIds: string[]) {
  const ids = [...new Set(serviceIds)];
  const services = await prisma.service.findMany({ where: { shopId, id: { in: ids }, active: true } });
  if (services.length !== ids.length || ids.length === 0) throw new BookingError("Elige al menos un servicio válido.");
  return { services, minutes: services.reduce((s, x) => s + x.minutes, 0) };
}

/** Barberos activos que hacen TODOS los servicios elegidos */
export function staffForServices(shopId: string, serviceIds: string[]) {
  return prisma.staff.findMany({
    where: {
      shopId, active: true, takesAppointments: true,
      AND: serviceIds.map((id) => ({ services: { some: { serviceId: id } } })),
    },
    orderBy: { name: "asc" },
  });
}

export async function slotsFor(opts: {
  shopId: string; staffId: string; serviceIds: string[]; date: string; ignoreNotice?: boolean; excludeAppointmentId?: string;
}) {
  const shop = await prisma.barbershop.findUniqueOrThrow({ where: { id: opts.shopId }, include: { hours: true } });
  const staff = await prisma.staff.findFirstOrThrow({
    where: { id: opts.staffId, shopId: shop.id, active: true }, include: { schedule: true },
  });
  const { minutes } = await servicesFor(shop.id, opts.serviceIds);
  const from = localToUtc(opts.date, 0, shop.timezone), to = localToUtc(opts.date, 1440, shop.timezone);
  const overlap = { startsAt: { lt: to }, endsAt: { gt: from } };

  const [appts, off, closures] = await Promise.all([
    prisma.appointment.findMany({
      where: { staffId: staff.id, status: { notIn: [...INACTIVE] }, ...overlap,
        ...(opts.excludeAppointmentId && { id: { not: opts.excludeAppointmentId } }) },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.timeOff.findMany({ where: { staffId: staff.id, ...overlap } }),
    prisma.closure.findMany({ where: { shopId: shop.id, ...overlap } }),
  ]);

  return computeSlots({
    date: opts.date, tz: shop.timezone, shopHours: shop.hours, staffHours: staff.schedule,
    busy: [...appts, ...off, ...closures].map((x) => ({ start: x.startsAt.getTime(), end: x.endsAt.getTime() })),
    minutes, step: shop.slotMinutes, now: Date.now(), noticeMinutes: opts.ignoreNotice ? 0 : shop.minNoticeMinutes,
  });
}

export async function book(input: {
  shopId: string; staffId: string; serviceIds: string[]; startsAt: Date;
  customer: { id?: string; name?: string; phone?: string; email?: string };
  source: AppointmentSource; notes?: string; checkAvailability?: { ignoreNotice: boolean; date: string };
}) {
  const { services, minutes } = await servicesFor(input.shopId, input.serviceIds);
  const staff = await prisma.staff.findFirst({
    where: { id: input.staffId, shopId: input.shopId, active: true,
      AND: services.map((s) => ({ services: { some: { serviceId: s.id } } })) },
  });
  if (!staff) throw new BookingError("Ese barbero no hace alguno de los servicios elegidos.");

  if (input.checkAvailability) {
    const free = await slotsFor({ shopId: input.shopId, staffId: staff.id, serviceIds: input.serviceIds,
      date: input.checkAvailability.date, ignoreNotice: input.checkAvailability.ignoreNotice });
    if (!free.includes(input.startsAt.getTime())) throw new BookingError("Ese horario ya no está disponible. Elige otro.");
  }

  let customerId = input.customer.id;
  if (!customerId) {
    const phone = (input.customer.phone ?? "").replace(/\D/g, "");
    if (phone.length < 10 || !input.customer.name?.trim()) throw new BookingError("Escribe nombre y un teléfono de 10 dígitos.");
    const c = await prisma.customer.upsert({
      where: { shopId_phone: { shopId: input.shopId, phone } },
      update: { name: input.customer.name.trim(), ...(input.customer.email && { email: input.customer.email }) },
      create: {
        shopId: input.shopId, phone, name: input.customer.name.trim(), email: input.customer.email || null,
        ...(input.source === "ONLINE" && { origin: "ONLINE_BOOKING" as const }),
      },
    });
    customerId = c.id;
  }

  try {
    return await prisma.appointment.create({
      data: {
        shopId: input.shopId, staffId: staff.id, customerId,
        startsAt: input.startsAt, endsAt: new Date(input.startsAt.getTime() + minutes * 60_000),
        source: input.source, status: input.source === "ONLINE" ? "PENDING" : "CONFIRMED", notes: input.notes || null,
        services: { create: services.map((s) => ({ serviceId: s.id, name: s.name, minutes: s.minutes, price: s.price })) },
      },
    });
  } catch (e) {
    if (String(e).includes("appointments_no_overlap")) throw new BookingError("Ese horario se acaba de ocupar. Elige otro.");
    throw e;
  }
}
