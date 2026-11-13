import { prisma, type Barbershop } from "../db";
import { dayRange, localTime } from "../time";

/** Citas de un día local, opcionalmente filtradas a un barbero. */
export async function dayAppointments(shop: Barbershop, date: string, barberId?: string | null) {
  const list = await prisma.appointment.findMany({
    where: { barbershopId: shop.id, startAt: dayRange(date, shop.timezone), ...(barberId ? { barberId } : {}) },
    include: { client: true, service: true, barber: true, deposit: true, payment: true, rating: true, redeemedReward: true },
    orderBy: { startAt: "asc" },
  });
  return list.map((a) => ({
    id: a.id, status: a.status, source: a.source, notes: a.notes,
    startAt: a.startAt, endAt: a.endAt, time: localTime(a.startAt, shop.timezone), endTime: localTime(a.endAt, shop.timezone),
    durationMin: Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60000), price: a.price,
    barber: { id: a.barber.id, name: a.barber.name },
    service: { id: a.service.id, name: a.service.name },
    client: { id: a.client.id, name: a.client.name, phone: a.client.phone, stamps: a.client.loyaltyStamps },
    deposit: a.deposit ? { amount: a.deposit.amount, status: a.deposit.status, method: a.deposit.method } : null,
    payment: a.payment ? { amount: a.payment.amount, method: a.payment.method, discount: a.payment.loyaltyDiscount, depositApplied: a.payment.depositApplied } : null,
    rating: a.rating?.stars ?? null,
  }));
}

export type DayAppt = Awaited<ReturnType<typeof dayAppointments>>[number];

/** Resumen del día por barbero: citas, cobradas, ingreso generado, comisión y siguiente cita. */
export async function barberDaySummary(shop: Barbershop, date: string, appts?: DayAppt[]) {
  const list = appts ?? (await dayAppointments(shop, date));
  const barbers = await prisma.barber.findMany({ where: { barbershopId: shop.id } });
  const now = new Date();
  const out: Record<string, { appointments: number; charged: number; revenue: number; commission: number; next: { time: string; client: string; service: string } | null }> = {};
  for (const b of barbers) {
    const mine = list.filter((a) => a.barber.id === b.id && a.status !== "CANCELLED" && a.status !== "NO_SHOW");
    const charged = mine.filter((a) => a.status === "CHARGED");
    const revenue = charged.reduce((s, a) => s + (a.payment ? a.payment.amount + a.payment.depositApplied : 0), 0);
    const nx = mine.filter((a) => ["PENDING", "CONFIRMED"].includes(a.status) && new Date(a.endAt) > now).sort((x, y) => +new Date(x.startAt) - +new Date(y.startAt))[0];
    out[b.id] = {
      appointments: mine.length, charged: charged.length, revenue, commission: Math.round((revenue * b.commissionPct) / 100),
      next: nx ? { time: nx.time, client: nx.client.name, service: nx.service.name } : null,
    };
  }
  return out;
}
