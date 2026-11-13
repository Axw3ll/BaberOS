import { prisma, type Tx, type Barbershop, type AppointmentStatus, type PaymentMethod, type AppointmentSource } from "../db";
import { bad, conflict, forbidden, notFound } from "../http";
import { dayRange, fromMinutes, isValidDate, isValidTime, localDate, toMinutes, weekday, zonedToUtc } from "../time";
import type { Ctx } from "../auth";

export const ACTIVE: AppointmentStatus[] = ["PENDING", "CONFIRMED", "COMPLETED", "CHARGED"];

export function normalizePhone(p: string) {
  const d = String(p ?? "").replace(/\D/g, "");
  if (d.length < 10) throw bad("Teléfono inválido: usa 10 dígitos");
  return d.length === 10 ? d : d.slice(-12); // guarda 10 dígitos o con lada país
}

/** Monto del anticipo según Ajustes (centavos). 0 si está desactivado. */
export function computeDeposit(shop: Pick<Barbershop, "depositEnabled" | "depositMode" | "depositValue">, price: number) {
  if (!shop.depositEnabled || shop.depositValue <= 0) return 0;
  const amt = shop.depositMode === "PERCENT" ? Math.round((price * Math.min(shop.depositValue, 100)) / 100) : shop.depositValue;
  return Math.min(amt, price);
}

export async function assertNoOverlap(tx: Tx, shopId: string, barberId: string, start: Date, end: Date, excludeId?: string) {
  const clash = await tx.appointment.findFirst({
    where: {
      barbershopId: shopId, barberId, status: { in: ACTIVE },
      startAt: { lt: end }, endAt: { gt: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: { client: true, service: true },
  });
  if (clash) {
    const tz = (await tx.barbershop.findUniqueOrThrow({ where: { id: shopId } })).timezone;
    const f = (d: Date) => d.toLocaleTimeString("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    throw conflict(`Choque de horario: el barbero ya tiene a ${clash.client.name} (${clash.service.name}) de ${f(clash.startAt)} a ${f(clash.endAt)}.`, "OVERLAP");
  }
}

async function loadBarberService(tx: Tx, shopId: string, barberId: string, serviceId: string) {
  const [barber, service] = await Promise.all([
    tx.barber.findFirst({ where: { id: barberId, barbershopId: shopId } }),
    tx.service.findFirst({ where: { id: serviceId, barbershopId: shopId } }),
  ]);
  if (!barber) throw notFound("Barbero no encontrado");
  if (!service) throw notFound("Servicio no encontrado");
  return { barber, service };
}

export async function findOrCreateClient(tx: Tx, shopId: string, name: string, phone: string) {
  const ph = normalizePhone(phone);
  const nm = String(name ?? "").trim();
  if (!nm) throw bad("Falta el nombre del cliente");
  const existing = await tx.client.findUnique({ where: { barbershopId_phone: { barbershopId: shopId, phone: ph } } });
  if (existing) {
    if (!existing.active) await tx.client.update({ where: { id: existing.id }, data: { active: true } });
    return existing;
  }
  return tx.client.create({ data: { barbershopId: shopId, name: nm, phone: ph } });
}

export async function createAppointment(tx: Tx, shop: Barbershop, input: {
  barberId: string; serviceId: string; clientId: string; date: string; time: string; source: AppointmentSource; notes?: string | null;
}) {
  if (!isValidDate(input.date) || !isValidTime(input.time)) throw bad("Fecha u hora inválida");
  const { barber, service } = await loadBarberService(tx, shop.id, input.barberId, input.serviceId);
  if (!barber.active) throw bad("Ese barbero está desactivado");
  if (!service.active) throw bad("Ese servicio está desactivado");
  const client = await tx.client.findFirst({ where: { id: input.clientId, barbershopId: shop.id } });
  if (!client) throw notFound("Cliente no encontrado");

  const startAt = zonedToUtc(input.date, input.time, shop.timezone);
  const endAt = new Date(startAt.getTime() + service.durationMin * 60000);
  await assertNoOverlap(tx, shop.id, barber.id, startAt, endAt);

  const appt = await tx.appointment.create({
    data: {
      barbershopId: shop.id, barberId: barber.id, serviceId: service.id, clientId: client.id,
      startAt, endAt, price: service.price, source: input.source, notes: input.notes ?? null,
    },
  });
  // Anticipo: solo para citas nuevas, según la configuración vigente
  const dep = computeDeposit(shop, service.price);
  if (dep > 0) await tx.deposit.create({ data: { barbershopId: shop.id, appointmentId: appt.id, amount: dep } });
  return appt;
}

/** Reprogramar / editar sin cancelar: misma cita, nueva fecha/hora/barbero/servicio, con validación anti-choques. */
export async function updateAppointment(ctx: Ctx, id: string, input: {
  barberId?: string; serviceId?: string; date?: string; time?: string; notes?: string | null; clientId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.appointment.findFirst({ where: { id, barbershopId: ctx.shopId } });
    if (!a) throw notFound("Cita no encontrada");
    if (ctx.role === "BARBER") throw forbidden("Un barbero no puede reprogramar citas");
    if (!["PENDING", "CONFIRMED"].includes(a.status)) throw bad("Solo se pueden editar citas pendientes o confirmadas");
    const tz = ctx.shop.timezone;
    const barberId = input.barberId ?? a.barberId;
    const serviceId = input.serviceId ?? a.serviceId;
    const { barber, service } = await loadBarberService(tx, ctx.shopId, barberId, serviceId);
    if (!barber.active) throw bad("Ese barbero está desactivado");
    const date = input.date ?? localDate(a.startAt, tz);
    const time = input.time ?? a.startAt.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    if (!isValidDate(date) || !isValidTime(time)) throw bad("Fecha u hora inválida");
    const startAt = zonedToUtc(date, time, tz);
    const endAt = new Date(startAt.getTime() + service.durationMin * 60000);
    await assertNoOverlap(tx, ctx.shopId, barberId, startAt, endAt, a.id);
    let clientId = a.clientId;
    if (input.clientId) {
      const c = await tx.client.findFirst({ where: { id: input.clientId, barbershopId: ctx.shopId } });
      if (!c) throw notFound("Cliente no encontrado");
      clientId = c.id;
    }
    const priceChanged = serviceId !== a.serviceId;
    const upd = await tx.appointment.update({
      where: { id: a.id },
      data: { barberId, serviceId, clientId, startAt, endAt, notes: input.notes === undefined ? a.notes : input.notes, ...(priceChanged ? { price: service.price } : {}) },
    });
    // Si cambió el servicio y el anticipo sigue pendiente, recalcúlalo dentro del nuevo precio
    if (priceChanged) {
      const dep = await tx.deposit.findUnique({ where: { appointmentId: a.id } });
      if (dep && dep.status === "PENDING") await tx.deposit.update({ where: { id: dep.id }, data: { amount: Math.min(dep.amount, service.price) } });
    }
    return upd;
  });
}

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["PENDING", "COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: ["CONFIRMED"], // deshacer "completada" mientras no se haya cobrado
  CHARGED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export async function setStatus(ctx: Ctx, id: string, status: AppointmentStatus) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.appointment.findFirst({ where: { id, barbershopId: ctx.shopId } });
    if (!a) throw notFound("Cita no encontrada");
    if (ctx.role === "BARBER" && a.barberId !== ctx.barberId) throw forbidden("Esa cita no es tuya");
    if (ctx.role === "BARBER" && status === "CANCELLED") throw forbidden("Un barbero no puede cancelar citas");
    if (status === "CHARGED") throw bad("Para cobrar usa el botón Cobrar");
    if (!TRANSITIONS[a.status].includes(status)) throw bad(`No se puede pasar de ${a.status} a ${status}`);
    const now = new Date();
    const upd = await tx.appointment.update({
      where: { id: a.id },
      data: {
        status,
        completedAt: status === "COMPLETED" ? now : status === "CONFIRMED" ? null : a.completedAt,
        cancelledAt: status === "CANCELLED" ? now : a.cancelledAt,
      },
    });
    if (status === "CANCELLED" || status === "NO_SHOW") {
      // anticipo pendiente ya no aplica; uno pagado se conserva como registro
      await tx.deposit.updateMany({ where: { appointmentId: a.id, status: "PENDING" }, data: { status: "VOID" } });
    }
    return upd;
  });
}

/** Horarios libres reales para un barbero/servicio/día. */
export async function freeSlots(shop: Barbershop, barberId: string, serviceId: string, date: string) {
  if (!isValidDate(date)) throw bad("Fecha inválida");
  const { barber, service } = await loadBarberService(prisma, shop.id, barberId, serviceId);
  if (!barber.active || !service.active) return [];
  const workDays = shop.workDays.split(",").map(Number);
  if (!workDays.includes(weekday(date))) return [];
  const open = toMinutes(shop.openTime), close = toMinutes(shop.closeTime);
  const step = Math.max(5, shop.slotMinutes);
  const busy = await prisma.appointment.findMany({
    where: { barbershopId: shop.id, barberId, status: { in: ACTIVE }, startAt: { lt: dayRange(date, shop.timezone).lt }, endAt: { gt: dayRange(date, shop.timezone).gte } },
    select: { startAt: true, endAt: true },
  });
  const now = Date.now();
  const out: string[] = [];
  for (let m = open; m + service.durationMin <= close; m += step) {
    const t = fromMinutes(m);
    const s = zonedToUtc(date, t, shop.timezone);
    const e = new Date(s.getTime() + service.durationMin * 60000);
    if (s.getTime() <= now + 5 * 60000) continue;
    if (busy.some((b) => b.startAt < e && b.endAt > s)) continue;
    out.push(t);
  }
  return out;
}

/** Cálculo del cobro, hecho SIEMPRE en el servidor. */
export async function chargeQuote(tx: Tx, shopId: string, appointmentId: string, useReward: boolean) {
  const a = await tx.appointment.findFirst({ where: { id: appointmentId, barbershopId: shopId }, include: { deposit: true, payment: true, client: true } });
  if (!a) throw notFound("Cita no encontrada");
  const depositPaid = a.deposit?.status === "PAID" ? a.deposit.amount : 0;
  const depositPending = a.deposit?.status === "PENDING" ? a.deposit.amount : 0;
  const reward = await tx.loyaltyReward.findFirst({ where: { barbershopId: shopId, clientId: a.clientId, redeemedAt: null }, orderBy: { earnedAt: "asc" } });
  const availableRewards = await tx.loyaltyReward.count({ where: { barbershopId: shopId, clientId: a.clientId, redeemedAt: null } });
  let discount = 0;
  if (useReward && reward) discount = Math.min(Math.round((a.price * reward.discountPercent) / 100), a.price - depositPaid);
  const remaining = a.price - depositPaid - discount;
  return { appointment: a, price: a.price, depositPaid, depositPending, discount, remaining, reward: useReward ? reward : null, availableRewards, rewardPercent: reward?.discountPercent ?? null };
}

export async function chargeAppointment(ctx: Ctx, id: string, method: PaymentMethod, useReward: boolean) {
  return prisma.$transaction(async (tx) => {
    // Bloqueo de fila: dos cobros simultáneos de la misma cita se serializan
    await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id = ${id} AND "barbershopId" = ${ctx.shopId} FOR UPDATE`;
    const q = await chargeQuote(tx, ctx.shopId, id, useReward);
    const a = q.appointment;
    if (ctx.role === "BARBER" && a.barberId !== ctx.barberId) throw forbidden("Esa cita no es tuya");
    if (a.payment || a.status === "CHARGED") throw conflict("Esta cita ya fue cobrada", "ALREADY_CHARGED");
    if (!["PENDING", "CONFIRMED", "COMPLETED"].includes(a.status)) throw bad("No se puede cobrar una cita cancelada o no-show");
    if (useReward && !q.reward) throw bad("El cliente no tiene recompensas disponibles");
    if (q.depositPaid + q.remaining + q.discount !== q.price) throw new Error("Descuadre de cobro"); // invariante

    const now = new Date();
    await tx.payment.create({
      data: { barbershopId: ctx.shopId, appointmentId: a.id, amount: q.remaining, depositApplied: q.depositPaid, loyaltyDiscount: q.discount, method, memberId: ctx.memberId },
    });
    if (q.reward) {
      const r = await tx.loyaltyReward.updateMany({
        where: { id: q.reward.id, redeemedAt: null },
        data: { redeemedAt: now, redeemedAppointmentId: a.id, discountAmount: q.discount },
      });
      if (r.count !== 1) throw conflict("La recompensa ya fue canjeada", "REWARD_USED");
    }
    // El anticipo que seguía pendiente se absorbió en el cobro completo
    await tx.deposit.updateMany({ where: { appointmentId: a.id, status: "PENDING" }, data: { status: "VOID" } });
    await tx.appointment.update({ where: { id: a.id }, data: { status: "CHARGED", chargedAt: now, completedAt: a.completedAt ?? now } });

    // Sello automático: cada cita completada y cobrada suma 1
    const shop = await tx.barbershop.findUniqueOrThrow({ where: { id: ctx.shopId } });
    const c = await tx.client.update({ where: { id: a.clientId }, data: { loyaltyStamps: { increment: 1 } } });
    let stamps = c.loyaltyStamps;
    let earned = 0;
    const req = Math.max(1, shop.loyaltyStampsRequired);
    while (stamps >= req) {
      await tx.loyaltyReward.create({ data: { barbershopId: ctx.shopId, clientId: a.clientId, discountPercent: shop.loyaltyDiscountPercent } });
      stamps -= req; earned++;
    }
    if (earned) await tx.client.update({ where: { id: a.clientId }, data: { loyaltyStamps: stamps } });
    return { charged: q.remaining, discount: q.discount, depositApplied: q.depositPaid, price: q.price, stamps, rewardEarned: earned > 0 };
  });
}

/** Registrar a mano un anticipo pagado en efectivo, transferencia o terminal física. */
export async function recordDeposit(ctx: Ctx, appointmentId: string, method: PaymentMethod) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.appointment.findFirst({ where: { id: appointmentId, barbershopId: ctx.shopId }, include: { deposit: true } });
    if (!a) throw notFound("Cita no encontrada");
    if (ctx.role === "BARBER" && a.barberId !== ctx.barberId) throw forbidden("Esa cita no es tuya");
    if (!a.deposit) throw bad("Esta cita no requiere anticipo");
    if (a.status === "CHARGED") throw bad("La cita ya fue cobrada");
    const r = await tx.deposit.updateMany({ where: { id: a.deposit.id, status: "PENDING" }, data: { status: "PAID", method, paidAt: new Date() } });
    if (r.count !== 1) throw conflict("El anticipo ya estaba registrado", "DEPOSIT_DONE");
    return tx.deposit.findUniqueOrThrow({ where: { id: a.deposit.id } });
  });
}

/** "Sin preferencia": horarios en los que al menos un barbero activo está libre. */
export async function freeSlotsAny(shop: Barbershop, serviceId: string, date: string) {
  const barbers = await prisma.barber.findMany({ where: { barbershopId: shop.id, active: true }, select: { id: true } });
  const all = await Promise.all(barbers.map((b) => freeSlots(shop, b.id, serviceId, date)));
  return [...new Set(all.flat())].sort();
}

/** Elige al barbero libre a esa hora con menos citas ese día. */
export async function pickBarber(shop: Barbershop, serviceId: string, date: string, time: string) {
  const barbers = await prisma.barber.findMany({ where: { barbershopId: shop.id, active: true }, select: { id: true } });
  const range = dayRange(date, shop.timezone);
  const candidates: { id: string; load: number }[] = [];
  for (const b of barbers) {
    if (!(await freeSlots(shop, b.id, serviceId, date)).includes(time)) continue;
    const load = await prisma.appointment.count({ where: { barberId: b.id, startAt: range, status: { in: ACTIVE } } });
    candidates.push({ id: b.id, load });
  }
  candidates.sort((a, b) => a.load - b.load);
  return candidates[0]?.id ?? null;
}
