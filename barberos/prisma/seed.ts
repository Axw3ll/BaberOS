// Seed de DEMOSTRACIÓN. Crea una barbería marcada isDemo = true con datos de ejemplo.
// Nunca se mezcla con barberías reales: todo cuelga de su propio barbershopId.
// PINs demo: Dueño 1234 · Recepción 2222 · Barbero Luis 3333
import "dotenv/config";
import { prisma } from "../lib/db";
import { hashPin } from "../lib/crypto";
import { addDays, todayLocal, zonedToUtc } from "../lib/time";

const TZ = "America/Mexico_City";
const SLUG = "demo";

async function main() {
  const old = await prisma.barbershop.findUnique({ where: { slug: SLUG } });
  if (old) {
    if (!old.isDemo) throw new Error("Existe una barbería real con slug 'demo'; no se toca.");
    await prisma.$transaction([
      prisma.reminderLog.deleteMany({ where: { barbershopId: old.id } }),
      prisma.recoveryLog.deleteMany({ where: { barbershopId: old.id } }),
      prisma.rating.deleteMany({ where: { barbershopId: old.id } }),
      prisma.loyaltyReward.deleteMany({ where: { barbershopId: old.id } }),
      prisma.payment.deleteMany({ where: { barbershopId: old.id } }),
      prisma.deposit.deleteMany({ where: { barbershopId: old.id } }),
      prisma.appointment.deleteMany({ where: { barbershopId: old.id } }),
      prisma.productSale.deleteMany({ where: { barbershopId: old.id } }),
      prisma.barbershop.delete({ where: { id: old.id } }),
    ]);
  }

  const shop = await prisma.barbershop.create({
    data: {
      slug: SLUG, name: "Barbería Demo", city: "Colima, Col.", phone: "3121234567", timezone: TZ, isDemo: true,
      ownerName: "Dueño Demo", ownerEmail: "dueno@demo.mx", openTime: "09:00", closeTime: "20:00", workDays: "1,2,3,4,5,6",
      depositEnabled: true, depositMode: "FIXED", depositValue: 5000,
    },
  });
  await prisma.subscription.create({ data: { barbershopId: shop.id, plan: "BASICO", status: "TRIALING", trialEndsAt: new Date(Date.now() + 14 * 86400_000) } });

  const [luis, marco, ana] = await Promise.all([
    prisma.barber.create({ data: { barbershopId: shop.id, name: "Luis Hernández (demo)", specialty: "Fade y diseño", phone: "3121112233", email: "luis.hernandez@demo.mx", commissionPct: 40 } }),
    prisma.barber.create({ data: { barbershopId: shop.id, name: "Marco Rivera (demo)", specialty: "Barba clásica y toalla caliente", phone: "3124445566", email: "marco.rivera@demo.mx", commissionPct: 45 } }),
    prisma.barber.create({ data: { barbershopId: shop.id, name: "Ana Torres (demo)", specialty: "Corte con tijera", phone: "3127778899", commissionPct: 40 } }),
  ]);

  await prisma.member.createMany({
    data: [
      { barbershopId: shop.id, name: "Dueño Demo", role: "OWNER", email: "dueno@demo.mx", pinHash: await hashPin("1234") },
      { barbershopId: shop.id, name: "Recepción Demo", role: "RECEPTION", pinHash: await hashPin("2222") },
      { barbershopId: shop.id, name: "Luis Hernández (demo)", role: "BARBER", barberId: luis.id, pinHash: await hashPin("3333") },
    ],
  });

  const [corte, barba, combo, nino] = await Promise.all([
    prisma.service.create({ data: { barbershopId: shop.id, name: "Corte clásico", price: 25000, durationMin: 45 } }),
    prisma.service.create({ data: { barbershopId: shop.id, name: "Arreglo de barba", price: 15000, durationMin: 30 } }),
    prisma.service.create({ data: { barbershopId: shop.id, name: "Corte + barba", price: 35000, durationMin: 60 } }),
    prisma.service.create({ data: { barbershopId: shop.id, name: "Corte niño", price: 18000, durationMin: 30 } }),
  ]);

  const mk = (name: string, phone: string, favoriteBarberId?: string, notes?: string) =>
    prisma.client.create({ data: { barbershopId: shop.id, name, phone, favoriteBarberId, notes } });
  const juan = await mk("Juan Pérez (demo)", "3125550001", luis.id, "Le gusta degradado bajo");
  const pedro = await mk("Pedro Gómez (demo)", "3125550002", marco.id);
  const carlos = await mk("Carlos Díaz (demo)", "3125550003", undefined, "Llega tarde a veces");
  const raul = await mk("Raúl Mendoza (demo)", "3125550004", ana.id);

  const today = todayLocal(TZ);
  // Historial pasado ya cobrado (no genera anticipo: son citas viejas)
  async function past(clientId: string, barberId: string, svc: { id: string; price: number; durationMin: number }, daysAgo: number, time = "11:00") {
    const d = addDays(today, -daysAgo);
    const startAt = zonedToUtc(d, time, TZ);
    const a = await prisma.appointment.create({ data: { barbershopId: shop.id, clientId, barberId, serviceId: svc.id, startAt, endAt: new Date(+startAt + svc.durationMin * 60000), price: svc.price, status: "CHARGED", completedAt: startAt, chargedAt: startAt } });
    await prisma.payment.create({ data: { barbershopId: shop.id, appointmentId: a.id, amount: svc.price, method: "CASH", createdAt: startAt } });
    await prisma.client.update({ where: { id: clientId }, data: { loyaltyStamps: { increment: 1 } } });
    return a;
  }
  for (const d of [40, 26, 12]) await past(juan.id, luis.id, corte, d);
  await past(pedro.id, marco.id, combo, 45);
  await past(raul.id, ana.id, corte, 9);
  const r = await past(raul.id, ana.id, barba, 3, "13:00");
  await prisma.rating.create({ data: { barbershopId: shop.id, appointmentId: r.id, barberId: ana.id, stars: 5 } });
  const noShowStart = zonedToUtc(addDays(today, -5), "17:00", TZ);
  await prisma.appointment.create({ data: { barbershopId: shop.id, clientId: carlos.id, barberId: luis.id, serviceId: corte.id, startAt: noShowStart, endAt: new Date(+noShowStart + 45 * 60000), price: corte.price, status: "NO_SHOW" } });

  // Citas próximas (hoy y mañana) — con anticipo según configuración
  async function upcoming(clientId: string, barberId: string, svc: { id: string; price: number; durationMin: number }, date: string, time: string, depositPaid = false) {
    const startAt = zonedToUtc(date, time, TZ);
    const a = await prisma.appointment.create({ data: { barbershopId: shop.id, clientId, barberId, serviceId: svc.id, startAt, endAt: new Date(+startAt + svc.durationMin * 60000), price: svc.price, status: "CONFIRMED" } });
    await prisma.deposit.create({ data: { barbershopId: shop.id, appointmentId: a.id, amount: 5000, status: depositPaid ? "PAID" : "PENDING", method: depositPaid ? "TRANSFER" : null, paidAt: depositPaid ? new Date() : null } });
  }
  await upcoming(raul.id, luis.id, corte, today, "18:00", true);
  await upcoming(carlos.id, marco.id, barba, today, "19:00");
  await upcoming(juan.id, luis.id, combo, addDays(today, 1), "10:00", true);
  await upcoming(pedro.id, ana.id, nino, addDays(today, 1), "12:30");

  await prisma.product.createMany({
    data: [
      { barbershopId: shop.id, name: "Pomada mate (demo)", price: 22000, cost: 11000, stock: 8, lowStockAlert: 3 },
      { barbershopId: shop.id, name: "Aceite para barba (demo)", price: 18000, cost: 8000, stock: 2, lowStockAlert: 3 },
      { barbershopId: shop.id, name: "Shampoo (demo)", price: 15000, cost: 7000, stock: 0, lowStockAlert: 2 },
    ],
  });
  await prisma.expense.createMany({
    data: [
      { barbershopId: shop.id, concept: "Navajas desechables (demo)", category: "INSUMOS", amount: 35000, date: addDays(today, -1) },
      { barbershopId: shop.id, concept: "Limpieza semanal (demo)", category: "LIMPIEZA", amount: 20000, date: today },
    ],
  });

  console.log(`Barbería demo lista: http://localhost:3000/${SLUG}  (PIN dueño 1234, recepción 2222, barbero Luis 3333)`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
