import "server-only";
import { prisma } from "./prisma";
import { slotsFor } from "./booking";
import { dateLabel, timeLabel, toLocalDate, today } from "./time";
import type { Barbershop } from "@/generated/prisma/client";

// ─────────────────────────────────────────────────────────────────────
// Lista de espera y clientes que faltan
//
// Si un día ya no tiene horarios, el cliente deja su teléfono. Cuando alguien cancela ese día,
// a los primeros de la lista les llega "se liberó un lugar" con su enlace para reservar.
// El primero que reserva se lo queda (no apartamos el lugar: así nadie lo bloquea sin venir).
// ─────────────────────────────────────────────────────────────────────

const NOTIFY_AT_ONCE = 3;
const NO_SHOW_WINDOW_DAYS = 180;

export class WaitlistError extends Error {}

export async function joinWaitlist(shop: Barbershop, input: { customerId: string; date: string; serviceId: string | null; staffId: string | null }) {
  if (input.date < today(shop.timezone)) throw new WaitlistError("Ese día ya pasó.");
  const dup = await prisma.waitlistEntry.findFirst({
    where: { shopId: shop.id, customerId: input.customerId, date: new Date(`${input.date}T00:00:00Z`), status: { in: ["ACTIVE", "NOTIFIED"] } },
  });
  if (dup) return dup;
  const open = await prisma.waitlistEntry.count({ where: { shopId: shop.id, customerId: input.customerId, status: "ACTIVE" } });
  if (open >= 3) throw new WaitlistError("Ya estás en la lista de espera de 3 días. Espera a que te avisemos.");
  return prisma.waitlistEntry.create({
    data: { shopId: shop.id, customerId: input.customerId, date: new Date(`${input.date}T00:00:00Z`), serviceId: input.serviceId, staffId: input.staffId },
  });
}

/** Se canceló (o no llegó) una cita: avisa a los primeros de la lista de ese día a los que de verdad les queda un lugar. */
export async function notifyWaitlist(shop: Barbershop, freed: { startsAt: Date; staffId: string }, base: string) {
  if (freed.startsAt.getTime() < Date.now()) return 0;
  const date = toLocalDate(freed.startsAt, shop.timezone);
  const entries = await prisma.waitlistEntry.findMany({
    where: { shopId: shop.id, date: new Date(`${date}T00:00:00Z`), status: "ACTIVE", OR: [{ staffId: null }, { staffId: freed.staffId }] },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  let notified = 0;
  for (const e of entries) {
    if (notified >= NOTIFY_AT_ONCE) break;
    // ¿Le sirve el hueco? Debe haber horario libre con ese barbero para su servicio
    if (e.serviceId) {
      const ok = await prisma.staffService.findFirst({ where: { staffId: freed.staffId, serviceId: e.serviceId } });
      if (!ok) continue;
      const slots = await slotsFor({ shopId: shop.id, staffId: freed.staffId, serviceIds: [e.serviceId], date }).catch(() => []);
      if (!slots.length) continue;
    }
    const nombre = e.customer.name.split(/\s+/)[0];
    const cuando = `el ${dateLabel(date, { weekday: "long", day: "numeric", month: "long" }).toLowerCase()} a las ${timeLabel(freed.startsAt, shop.timezone)}`;
    const params = new URLSearchParams({ c: e.customer.token, fecha: date, ...(e.serviceId && { servicio: e.serviceId }), barbero: freed.staffId });
    const link = `${base}/b/${shop.slug}?${params}`;
    await prisma.$transaction([
      prisma.outboundMessage.createMany({
        data: [{
          shopId: shop.id, customerId: e.customerId, kind: "WAITLIST_OPEN", dedupeKey: `WL:${e.id}`, dueAt: new Date(),
          body: `Hola ${nombre}, ¡se liberó un lugar en ${shop.name} ${cuando}! Apártalo antes que alguien más: ${link}`,
          params: [nombre, shop.name, cuando, link],
        }],
        skipDuplicates: true,
      }),
      prisma.waitlistEntry.update({ where: { id: e.id }, data: { status: "NOTIFIED", notifiedAt: new Date() } }),
    ]);
    notified++;
  }
  return notified;
}

/** Ya reservó ese día: sale de la lista. */
export function markWaitlistBooked(shopId: string, customerId: string, date: string) {
  return prisma.waitlistEntry.updateMany({
    where: { shopId, customerId, date: new Date(`${date}T00:00:00Z`), status: { in: ["ACTIVE", "NOTIFIED"] } },
    data: { status: "BOOKED" },
  });
}

export function expireWaitlist(shop: Barbershop) {
  return prisma.waitlistEntry.updateMany({
    where: { shopId: shop.id, status: { in: ["ACTIVE", "NOTIFIED"] }, date: { lt: new Date(`${today(shop.timezone)}T00:00:00Z`) } },
    data: { status: "EXPIRED" },
  });
}

/** "No llegó" de los últimos 6 meses, por cliente. */
export async function noShowCounts(shopId: string, customerIds: string[]) {
  if (!customerIds.length) return new Map<string, number>();
  const rows = await prisma.appointment.groupBy({
    by: ["customerId"],
    where: { shopId, customerId: { in: customerIds }, status: "NO_SHOW", startsAt: { gt: new Date(Date.now() - NO_SHOW_WINDOW_DAYS * 86_400_000) } },
    _count: true,
  });
  return new Map(rows.map((r) => [r.customerId, r._count]));
}

export async function noShowFlag(shop: Barbershop, customerId: string) {
  const n = (await noShowCounts(shop.id, [customerId])).get(customerId) ?? 0;
  return { count: n, flagged: n >= shop.noShowLimit, blocked: n >= shop.noShowLimit && shop.noShowPolicy === "BLOCK" };
}
