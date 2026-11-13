// Datos de demostración: una barbería con equipo, servicios, productos, clientes, citas y ventas.
// Uso:  SEED_OWNER_EMAIL=tu@email.com npm run db:seed
// Con Supabase Auth: entra una vez a la app con ese email antes de correrlo, para que exista tu usuario.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { addDays, localToUtc, today } from "../src/lib/time";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const TZ = "America/Mexico_City";

async function main() {
  const email = (process.env.SEED_OWNER_EMAIL ?? process.env.DEV_AUTH_EMAIL ?? "").toLowerCase();
  if (!email) throw new Error("Define SEED_OWNER_EMAIL");
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({ data: { id: "00000000-0000-4000-8000-000000000001", email, name: "Dueño" } }));

  const slug = "el-filo";
  await prisma.barbershop.deleteMany({ where: { slug } });

  const week = [1, 2, 3, 4, 5, 6];
  const shop = await prisma.barbershop.create({
    data: {
      name: "Barbería El Filo", slug, ownerId: user.id, phone: "312 555 0142", address: "Av. Constitución 210, Colima",
      loyaltyPointsPerPeso: 1, loyaltyPesoPerPoint: 0.05,
      hours: { create: week.map((weekday) => ({ weekday, startMinute: 600, endMinute: 1200 })) },
    },
  });

  const mk = (name: string, role: "OWNER" | "BARBER" | "RECEPTIONIST", blocks: [number, number][], extra = {}) =>
    prisma.staff.create({
      data: {
        shopId: shop.id, name, role, takesAppointments: role !== "RECEPTIONIST", ...extra,
        schedule: { create: role === "RECEPTIONIST" ? [] : week.flatMap((weekday) => blocks.map(([s, e]) => ({ weekday, startMinute: s, endMinute: e }))) },
      },
    });

  const owner = await mk(user.name, "OWNER", [[600, 840], [900, 1200]], { userId: user.id, email: user.email, serviceCommission: 0 });
  const toño = await mk("Toño Mendoza", "BARBER", [[600, 1080]]);
  const luis = await mk("Luis Carrillo", "BARBER", [[720, 1200]], { serviceCommission: 0.45 });
  await mk("Mariana Ruiz", "RECEPTIONIST", []);

  const svc = async (name: string, minutes: number, price: number, position: number, who: string[], description?: string) =>
    prisma.service.create({ data: { shopId: shop.id, name, minutes, price, position, description, staff: { create: who.map((staffId) => ({ staffId })) } } });
  const all = [owner.id, toño.id, luis.id];
  const corte = await svc("Corte clásico", 40, 180, 0, all, "Tijera y máquina");
  const fade = await svc("Degradado", 45, 220, 1, all, "Fade bajo, medio o alto");
  const barba = await svc("Arreglo de barba", 30, 140, 2, all, "Toalla caliente y navaja");
  const combo = await svc("Corte y barba", 75, 320, 3, [owner.id, toño.id]);
  await svc("Diseño o líneas", 15, 60, 4, [luis.id]);

  const products = [
    ["Cera mate 100 g", "Reuzel", "Ceras", 260, 150, 12],
    ["Pomada brillo medio", "Suavecito", "Pomadas", 240, 130, 8],
    ["Gel fijación fuerte 250 ml", "Ego", "Geles", 95, 48, 20],
    ["Aceite para barba 30 ml", "Proraso", "Aceites", 310, 175, 2],
    ["Bálsamo para barba", "Proraso", "Aceites", 290, 160, 5],
    ["Shampoo anticaída", "Nioxin", "Shampoo", 420, 260, 4],
    ["Polvo texturizante", "Slick Gorilla", "Ceras", 280, 150, 0],
    ["Gel de afeitar", "Proraso", "Afeitado", 180, 95, 9],
  ] as const;
  const prods = [];
  for (const [name, brand, category, price, cost, stock] of products) {
    prods.push(await prisma.product.create({
      data: { shopId: shop.id, name, brand, category, price, cost, stock, minStock: 3,
        moves: stock ? { create: { shopId: shop.id, type: "PURCHASE", quantity: stock, stockAfter: stock, unitCost: cost, note: "Inventario inicial" } } : undefined },
    }));
  }

  const names = ["Carlos Ramírez", "Jorge Valencia", "Emiliano Ochoa", "Diego Cárdenas", "Ricardo Núñez", "Andrés Silva",
    "Fernando Topete", "Iván Larios", "Raúl Preciado", "Sebastián Gil", "Óscar Ceballos", "Hugo Brizuela"];
  const customers: { id: string; name: string }[] = [];
  for (const [i, name] of names.entries()) {
    customers.push(await prisma.customer.create({ data: { shopId: shop.id, name, phone: `312${String(5550100 + i * 37).padStart(7, "0")}` } }));
  }

  const d0 = today(TZ);
  type Plan = [day: number, minute: number, staff: typeof owner, svc: typeof corte, cust: number, status: "CONFIRMED" | "PENDING" | "COMPLETED" | "IN_PROGRESS" | "NO_SHOW"];
  const plan: Plan[] = [
    [0, 600, toño, fade, 0, "COMPLETED"], [0, 660, toño, corte, 1, "COMPLETED"], [0, 720, toño, combo, 2, "CONFIRMED"],
    [0, 840, toño, barba, 3, "CONFIRMED"], [0, 960, toño, fade, 4, "PENDING"],
    [0, 615, owner, corte, 5, "COMPLETED"], [0, 690, owner, barba, 6, "NO_SHOW"], [0, 900, owner, combo, 7, "CONFIRMED"],
    [0, 1035, owner, corte, 8, "CONFIRMED"],
    [0, 735, luis, fade, 9, "CONFIRMED"], [0, 810, luis, corte, 10, "CONFIRMED"], [0, 1110, luis, barba, 11, "PENDING"],
    [1, 630, toño, corte, 2, "CONFIRMED"], [1, 780, luis, fade, 5, "CONFIRMED"], [1, 900, owner, barba, 0, "PENDING"],
  ];
  const created = [];
  for (const [day, minute, st, sv, c, status] of plan) {
    const startsAt = localToUtc(addDays(d0, day), minute, TZ);
    created.push(await prisma.appointment.create({
      data: {
        shopId: shop.id, staffId: st.id, customerId: customers[c].id, status,
        source: status === "PENDING" ? "ONLINE" : "WALK_IN",
        startsAt, endsAt: new Date(startsAt.getTime() + sv.minutes * 60_000),
        services: { create: { serviceId: sv.id, name: sv.name, minutes: sv.minutes, price: sv.price } },
      },
      include: { services: true },
    }));
  }

  // Ventas de las citas terminadas, una con producto
  let folio = 0;
  for (const a of created.filter((x) => x.status === "COMPLETED")) {
    const st = [owner, toño, luis].find((s) => s.id === a.staffId)!;
    const svcItem = a.services[0];
    const withProduct = folio === 0;
    const p = prods[0];
    const subtotal = Number(svcItem.price) + (withProduct ? Number(p.price) : 0);
    await prisma.sale.create({
      data: {
        shopId: shop.id, folio: ++folio, customerId: a.customerId, appointmentId: a.id, chargedById: owner.id,
        subtotal, tax: +(subtotal - subtotal / 1.16).toFixed(2), tip: folio === 2 ? 30 : 0, total: subtotal + (folio === 2 ? 30 : 0),
        createdAt: a.endsAt,
        items: {
          create: [
            { kind: "SERVICE", serviceId: svcItem.serviceId, staffId: st.id, name: svcItem.name, unitPrice: svcItem.price, total: svcItem.price,
              commission: +(Number(svcItem.price) * Number(st.serviceCommission)).toFixed(2) },
            ...(withProduct ? [{ kind: "PRODUCT" as const, productId: p.id, staffId: st.id, name: p.name, unitPrice: p.price, total: p.price,
              commission: +(Number(p.price) * Number(st.productCommission)).toFixed(2) }] : []),
          ],
        },
        payments: { create: { method: folio === 3 ? "CARD" : "CASH", amount: subtotal + (folio === 2 ? 30 : 0) } },
      },
    });
    if (withProduct) {
      const up = await prisma.product.update({ where: { id: p.id }, data: { stock: { decrement: 1 } } });
      await prisma.stockMovement.create({ data: { shopId: shop.id, productId: p.id, type: "SALE", quantity: -1, stockAfter: up.stock } });
    }
  }

  // ── CRM: historial de meses, etiquetas, bitácora, seguimientos y una campaña ──
  // Patrón por cliente: [visitas pasadas, cada cuántos días, días desde la última]
  const history: [number, number, number][] = [
    [9, 21, 6], [6, 28, 12], [5, 30, 70], [4, 35, 20], [8, 14, 30], [2, 25, 130],
    [3, 30, 3], [7, 20, 15], [1, 0, 2], [5, 40, 160], [10, 18, 9], [3, 21, 55],
  ];
  const barbers = [owner, toño, luis];
  const svcs = [corte, fade, barba, corte, fade];
  let pastFolio = 1000;
  for (const [i, [n, every, since]] of history.entries()) {
    const cust = customers[i];
    let points = 0;
    for (let k = 0; k < n; k++) {
      const st = barbers[(i + k) % 3], sv = svcs[(i + k) % svcs.length];
      const startsAt = localToUtc(addDays(d0, -(since + k * every)), 600 + (i % 8) * 60 + (k % 2) * 30, TZ);
      const a = await prisma.appointment.create({
        data: {
          shopId: shop.id, staffId: st.id, customerId: cust.id, status: "COMPLETED", source: k % 3 ? "WALK_IN" : "ONLINE",
          startsAt, endsAt: new Date(startsAt.getTime() + sv.minutes * 60_000),
          services: { create: { serviceId: sv.id, name: sv.name, minutes: sv.minutes, price: sv.price } },
        },
      });
      const price = Number(sv.price);
      points += price;
      await prisma.sale.create({
        data: {
          shopId: shop.id, folio: ++pastFolio, customerId: cust.id, appointmentId: a.id, chargedById: owner.id,
          subtotal: price, tax: +(price - price / 1.16).toFixed(2), total: price, createdAt: a.endsAt,
          items: { create: { kind: "SERVICE", serviceId: sv.id, staffId: st.id, name: sv.name, unitPrice: price, total: price,
            commission: +(price * Number(st.serviceCommission)).toFixed(2) } },
          payments: { create: { method: k % 2 ? "CARD" : "CASH", amount: price } },
          loyalty: { create: { shopId: shop.id, customerId: cust.id, kind: "EARN", points: price, balance: points, note: "Visita" } },
        },
      });
    }
    await prisma.customer.update({ where: { id: cust.id }, data: { points } });
  }

  const origins = ["WALK_BY", "REFERRAL", "INSTAGRAM", "GOOGLE", "INSTAGRAM", "TIKTOK", "WALK_BY", "FACEBOOK", "ONLINE_BOOKING", "REFERRAL", "INSTAGRAM", "WALK_BY"] as const;
  const [, m0, dd0] = d0.split("-").map(Number);
  for (const [i, c] of customers.entries()) {
    // Uno cumple hoy, otro en 3 días, y el resto repartido en el año
    const bd = i === 0 ? new Date(Date.UTC(1992, m0 - 1, dd0)) : i === 3 ? new Date(Date.UTC(1988, m0 - 1, dd0 + 3)) : new Date(Date.UTC(1985 + i, (i * 5) % 12, 1 + ((i * 7) % 27)));
    await prisma.customer.update({
      where: { id: c.id },
      data: {
        origin: origins[i], birthday: bd, preferredStaffId: i % 4 === 0 ? toño.id : null,
        referredById: origins[i] === "REFERRAL" ? customers[0].id : null, acceptsMarketing: i !== 7,
        notes: ["Degradado bajo, nunca muy corto arriba", null, "Alérgico a la loción con alcohol", null, "Trae a su hijo los sábados"][i % 5],
        createdAt: localToUtc(addDays(d0, -(history[i][2] + history[i][0] * history[i][1] + 2)), 600, TZ),
      },
    });
  }

  const extra = [["Mauricio Peña", "INSTAGRAM"], ["Alonso Vega", "GOOGLE"], ["Tomás Rangel", "REFERRAL"]] as const;
  for (const [k, [name, origin]] of extra.entries()) {
    await prisma.customer.create({ data: { shopId: shop.id, name, origin, phone: `312555${String(9100 + k).padStart(4, "0")}` } });
  }

  const tag = (name: string, color: string) => prisma.tag.create({ data: { shopId: shop.id, name, color } });
  const [tBarba, tEstudiante, tNino, tPuntual] = await Promise.all([tag("Barba", "sand"), tag("Estudiante", "sage"), tag("Trae niños", "nickel"), tag("Siempre puntual", "ash")]);
  await prisma.customerTag.createMany({
    data: [
      [0, tBarba], [0, tPuntual], [1, tEstudiante], [4, tNino], [4, tBarba], [6, tEstudiante], [10, tPuntual], [10, tBarba],
    ].map(([i, t]) => ({ customerId: customers[i as number].id, tagId: (t as { id: string }).id })),
  });

  const ago = (h: number) => new Date(Date.now() - h * 3_600_000);
  await prisma.customerActivity.createMany({
    data: [
      { customerId: customers[0].id, staffId: owner.id, type: "CALL", body: "Confirmó la cita de mañana. Quiere probar el diseño de líneas.", createdAt: ago(30) },
      { customerId: customers[0].id, staffId: toño.id, type: "NOTE", body: "Le gustó la cera mate, preguntó por la de 200 g.", createdAt: ago(200) },
      { customerId: customers[2].id, staffId: owner.id, type: "COMPLAINT", body: "Esperó 25 minutos aunque tenía cita. Le ofrecimos 10% en su próxima visita.", createdAt: ago(24 * 75) },
      { customerId: customers[5].id, staffId: owner.id, type: "WHATSAPP", body: "Te extrañamos. No respondió.", createdAt: ago(24 * 40) },
    ].map((a) => ({ ...a, type: a.type as "CALL" | "NOTE" | "COMPLAINT" | "WHATSAPP", shopId: shop.id })),
  });

  const due = (n: number) => new Date(`${addDays(d0, n)}T00:00:00Z`);
  await prisma.task.createMany({
    data: [
      { customerId: customers[2].id, assignedToId: owner.id, title: "Llamar a Emiliano: ofrecerle el 10% que le prometimos", dueOn: due(-2) },
      { customerId: customers[4].id, assignedToId: owner.id, title: "Avisar a Ricardo que ya llegó el bálsamo", dueOn: due(0) },
      { customerId: null, assignedToId: null, title: "Pedir más polvo texturizante al proveedor", dueOn: due(1) },
      { customerId: customers[9].id, assignedToId: luis.id, title: "Mandar promoción de regreso a Sebastián", dueOn: due(3) },
    ].map((t) => ({ ...t, shopId: shop.id, createdById: owner.id })),
  });

  const lost = [customers[5], customers[9]];
  await prisma.campaign.create({
    data: {
      shopId: shop.id, createdById: owner.id, name: "Te extrañamos, octubre", audience: "perdido",
      message: "¡Hola {nombre}! Hace rato que no te vemos en {barberia}. Esta semana tu corte va con 15% de descuento: {enlace}",
      recipients: { create: lost.map((c, i) => ({ customerId: c.id, sentAt: i === 0 ? ago(24 * 40) : null })) },
    },
  });

  console.log(`Listo: ${shop.name} (/b/${shop.slug}) para ${email}`);
}

main().finally(() => prisma.$disconnect());
