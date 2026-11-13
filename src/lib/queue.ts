import "server-only";
import { prisma } from "./prisma";
import { toLocalMinute, today, weekday } from "./time";
import type { Barbershop } from "@/generated/prisma/client";

// ─────────────────────────────────────────────────────────────────────
// Fila virtual para clientes sin cita.
// WAITING → (CALLED) → DONE (pasó con un barbero) | LEFT (se fue)
// El tiempo estimado es aproximado: minutos de los servicios de quienes van antes ÷ barberos trabajando ahora.
// ─────────────────────────────────────────────────────────────────────

export class QueueError extends Error {}
const ACTIVE = ["WAITING", "CALLED"] as const;

export function activeQueue(shopId: string) {
  return prisma.queueEntry.findMany({
    where: { shopId, status: { in: [...ACTIVE] }, createdAt: { gt: new Date(Date.now() - 16 * 3_600_000) } },
    include: { staff: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Barberos que trabajan en este momento (según su horario de hoy). Al menos 1 para no dividir entre cero. */
async function barbersWorking(shop: Barbershop) {
  const tz = shop.timezone, minute = toLocalMinute(new Date(), tz), wd = weekday(today(tz));
  const n = await prisma.staff.count({
    where: { shopId: shop.id, active: true, takesAppointments: true, schedule: { some: { weekday: wd, startMinute: { lte: minute }, endMinute: { gt: minute } } } },
  });
  return Math.max(1, n);
}

/** Lugar y minutos estimados de cada persona en la fila. */
export async function withEstimates(shop: Barbershop, entries: Awaited<ReturnType<typeof activeQueue>>) {
  const services = new Map((await prisma.service.findMany({ where: { shopId: shop.id }, select: { id: true, minutes: true, name: true } })).map((s) => [s.id, s]));
  const barbers = await barbersWorking(shop);
  let ahead = 0;
  return entries.map((e, i) => {
    const minutes = (e.serviceId && services.get(e.serviceId)?.minutes) || 30;
    const wait = e.status === "CALLED" ? 0 : Math.round(ahead / barbers);
    if (e.status !== "CALLED") ahead += minutes;
    return { ...e, position: i + 1, waitMinutes: wait, serviceName: e.serviceId ? services.get(e.serviceId)?.name ?? null : null };
  });
}

export async function joinQueue(shop: Barbershop, input: { name: string; phone: string | null; serviceId?: string | null; staffId?: string | null; source: "ONLINE" | "PANEL" }) {
  if (!shop.queueEnabled && input.source === "ONLINE") throw new QueueError("La fila en línea no está disponible por ahora.");
  // Si ya está formado con ese teléfono, se le devuelve su lugar (no se duplica)
  if (input.phone) {
    const existing = await prisma.queueEntry.findFirst({
      where: { shopId: shop.id, phone: input.phone, status: { in: [...ACTIVE] }, createdAt: { gt: new Date(Date.now() - 16 * 3_600_000) } },
    });
    if (existing) return existing;
  }
  const waiting = await prisma.queueEntry.count({ where: { shopId: shop.id, status: { in: [...ACTIVE] }, createdAt: { gt: new Date(Date.now() - 16 * 3_600_000) } } });
  if (waiting >= shop.queueMax) throw new QueueError("La fila está llena por ahora. Intenta en un rato o agenda una cita.");
  const service = input.serviceId ? await prisma.service.findFirst({ where: { id: input.serviceId, shopId: shop.id, active: true } }) : null;
  const staff = input.staffId ? await prisma.staff.findFirst({ where: { id: input.staffId, shopId: shop.id, active: true, takesAppointments: true } }) : null;
  const customer = input.phone ? await prisma.customer.findUnique({ where: { shopId_phone: { shopId: shop.id, phone: input.phone } } }) : null;
  const entry = await prisma.queueEntry.create({
    data: { shopId: shop.id, name: input.name, phone: input.phone, serviceId: service?.id, staffId: staff?.id, source: input.source, customerId: customer?.id },
  });
  return entry;
}

/** Prepara "ya casi te toca" para los dos primeros de la fila que tienen teléfono (una vez por persona). */
export async function syncQueueMessages(shop: Barbershop, base: string) {
  const list = (await activeQueue(shop.id)).filter((e) => e.status === "WAITING");
  for (const [i, e] of list.slice(0, 2).entries()) {
    if (!e.phone) continue;
    let customerId = e.customerId;
    if (!customerId) {
      const c = await prisma.customer.upsert({
        where: { shopId_phone: { shopId: shop.id, phone: e.phone } }, update: {}, create: { shopId: shop.id, phone: e.phone, name: e.name },
      });
      customerId = c.id;
      await prisma.queueEntry.update({ where: { id: e.id }, data: { customerId } });
    }
    const nombre = e.name.split(/\s+/)[0], link = `${base}/f/${shop.slug}/${e.token}`, lugar = i === 0 ? "el primero" : "el segundo";
    await prisma.outboundMessage.createMany({
      data: [{
        shopId: shop.id, customerId, kind: "QUEUE_NEXT", dedupeKey: `QN:${e.id}`, dueAt: new Date(),
        body: `Hola ${nombre}, ya casi te toca en ${shop.name}: vas ${lugar} en la fila. Ve acercándote. ${link}`,
        params: [nombre, shop.name, lugar, link],
      }],
      skipDuplicates: true,
    });
  }
}

export type BarberNow = {
  id: string; name: string;
  /** busy: atendiendo; free: libre ahora; off: fuera de su turno */
  state: "busy" | "free" | "off";
  /** busy: hasta cuándo; free: hasta su siguiente cita o fin de turno */
  until: Date | null;
  freeMinutes: number;
  /** La cita que limita su tiempo libre (si la hay) */
  nextAppt: Date | null;
};

/** Cómo está cada barbero en este momento: para saber a quién pasar a un cliente de la fila. */
export async function barbersNow(shop: Barbershop): Promise<BarberNow[]> {
  const tz = shop.timezone, now = Date.now(), day = today(tz), wd = weekday(day), minute = toLocalMinute(new Date(now), tz);
  const staff = await prisma.staff.findMany({
    where: { shopId: shop.id, active: true, takesAppointments: true },
    include: {
      schedule: { where: { weekday: wd } },
      appointments: {
        where: { status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] }, endsAt: { gt: new Date(now) }, startsAt: { lt: new Date(now + 24 * 3_600_000) } },
        orderBy: { startsAt: "asc" }, select: { startsAt: true, endsAt: true },
      },
    },
    orderBy: { name: "asc" },
  });
  return staff.map((s) => {
    const shift = s.schedule.find((b) => b.startMinute <= minute && b.endMinute > minute);
    const current = s.appointments.find((a) => a.startsAt.getTime() <= now);
    if (current) return { id: s.id, name: s.name, state: "busy", until: current.endsAt, freeMinutes: 0, nextAppt: null };
    if (!shift) return { id: s.id, name: s.name, state: "off", until: null, freeMinutes: 0, nextAppt: null };
    const shiftEnd = now + (shift.endMinute - minute) * 60_000;
    const next = s.appointments[0]?.startsAt ?? null;
    const until = next && next.getTime() < shiftEnd ? next.getTime() : shiftEnd;
    return { id: s.id, name: s.name, state: "free", until: new Date(until), freeMinutes: Math.floor((until - now) / 60_000), nextAppt: next && next.getTime() < shiftEnd ? next : null };
  });
}
