import { prisma, type Barbershop } from "../db";
import { recoveryText, waLink } from "./messaging";

export const RECOVER_DAYS = 30;

/** Ficha calculada de clientes: total gastado, última visita, faltas, lealtad y mensaje de recuperación. */
export async function clientCards(shop: Barbershop, where: { id?: string; active?: boolean } = { active: true }) {
  const clients = await prisma.client.findMany({
    where: { barbershopId: shop.id, ...where },
    include: {
      favoriteBarber: { select: { id: true, name: true } },
      appointments: { include: { payment: true, deposit: true, service: true, barber: true, redeemedReward: true }, orderBy: { startAt: "desc" } },
      rewards: { where: { redeemedAt: null } },
      recoveryLogs: { orderBy: { sentAt: "desc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  const now = Date.now();
  return clients.map((c) => {
    const visits = c.appointments.filter((a) => a.status === "CHARGED");
    const spent = c.appointments.reduce((s, a) => s + (a.payment ? a.payment.amount + a.payment.depositApplied : a.deposit?.status === "PAID" ? a.deposit.amount : 0), 0);
    const last = visits[0];
    const daysAway = last ? Math.floor((now - last.startAt.getTime()) / 86400_000) : null;
    const noShows = c.appointments.filter((a) => a.status === "NO_SHOW").length;
    const cancelled = c.appointments.filter((a) => a.status === "CANCELLED").length;
    const recover = daysAway !== null && daysAway >= RECOVER_DAYS;
    const msg = recover ? recoveryText({
      client: c.name.split(" ")[0], days: daysAway!, lastService: last?.service.name ?? null, barber: last?.barber.name ?? null,
      stamps: c.loyaltyStamps, required: shop.loyaltyStampsRequired, rewards: c.rewards.length, shop: shop.name, shopPhone: shop.phone,
    }) : null;
    return {
      id: c.id, name: c.name, phone: c.phone, email: c.email, notes: c.notes, active: c.active,
      favoriteBarber: c.favoriteBarber,
      totalSpent: spent, visits: visits.length, lastVisit: last?.startAt ?? null, lastService: last?.service.name ?? null, daysAway,
      noShows, cancelled,
      loyalty: { stamps: c.loyaltyStamps, required: shop.loyaltyStampsRequired, rewards: c.rewards.length, discountPercent: shop.loyaltyDiscountPercent },
      recover, recoveryMessage: msg, recoveryLink: msg ? waLink(c.phone, msg) : null,
      lastRecoverySent: c.recoveryLogs[0]?.sentAt ?? null,
      history: c.appointments.map((a) => ({
        id: a.id, startAt: a.startAt, status: a.status, service: a.service.name, barber: a.barber.name, price: a.price,
        paid: a.payment ? a.payment.amount + a.payment.depositApplied : 0, loyaltyDiscount: a.payment?.loyaltyDiscount ?? 0,
      })),
    };
  });
}
