// Datos de ejemplo de una barbería completa: equipo, servicios, productos, clientes con meses de historial,
// citas, ventas, lealtad, paquetes, calificaciones, gastos, fila y lista de espera.
//
// Se usa en dos lugares:
//  - `npm run db:seed` (barbería "el-filo" para desarrollo)
//  - el botón "Ver demo" (una barbería por visitante, se borra sola a las 24 h)
//
// Todo se inserta en bloque (createMany con ids generados aquí) para que tarde un par de segundos y no decenas.
// Importaciones relativas: también lo usa prisma/seed.ts.
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client";
import { addDays, localToUtc, today } from "./time";

type Db = PrismaClient;
const id = (): string => randomUUID();
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function buildDemoShop(db: Db, opts: {
  owner: { id: string; name: string; email: string };
  slug: string;
  isDemo: boolean;
  timezone?: string;
}) {
  const TZ = opts.timezone ?? "America/Mexico_City";
  const now = Date.now();
  const d0 = today(TZ);
  // La demo abre toda la semana para que se vea viva cualquier día; la de desarrollo, de lunes a sábado
  const week = opts.isDemo ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6];

  // ── Barbería ──
  const shop = await db.barbershop.create({
    data: {
      name: "Barbería El Filo", slug: opts.slug, ownerId: opts.owner.id, isDemo: opts.isDemo,
      phone: "312 555 0142", address: "Av. Constitución 210, Colima", timezone: TZ,
      description: "Cortes clásicos y modernos en el centro de Colima. Café de cortesía y estacionamiento.",
      instagram: "elfilo.barberia",
      loyaltyMode: "STAMPS", stampsRequired: 9, stampReward: "FREE_SERVICE",
      loyaltyPointsPerPeso: 1, loyaltyPesoPerPoint: 0.05,
      hours: { create: week.map((weekday) => ({ weekday, startMinute: 600, endMinute: 1200 })) },
    },
  });

  // ── Equipo ──
  const owner = { id: id(), name: opts.owner.name, serviceCommission: 0, productCommission: 0.1 };
  const toño = { id: id(), name: "Toño Mendoza", serviceCommission: 0.4, productCommission: 0.1 };
  const luis = { id: id(), name: "Luis Carrillo", serviceCommission: 0.45, productCommission: 0.1 };
  const mariana = { id: id(), name: "Mariana Ruiz" };
  await db.staff.createMany({
    data: [
      { ...owner, shopId: shop.id, role: "OWNER", userId: opts.owner.id, email: opts.owner.email, monthlyGoal: 30000,
        bio: "Dueño. 15 años cortando en Colima; especialista en clásicos." },
      { ...toño, shopId: shop.id, role: "BARBER", monthlyGoal: 18000, bio: "Especialista en degradados y barba. 8 años de experiencia." },
      { ...luis, shopId: shop.id, role: "BARBER", monthlyGoal: 15000, bio: "Diseños, líneas y cortes de tendencia." },
      { ...mariana, shopId: shop.id, role: "RECEPTIONIST", takesAppointments: false },
    ],
  });
  const shifts: [string, [number, number][]][] = [[owner.id, [[600, 840], [900, 1200]]], [toño.id, [[600, 1080]]], [luis.id, [[720, 1200]]]];
  await db.staffHours.createMany({
    data: shifts.flatMap(([staffId, blocks]) => week.flatMap((weekday) => blocks.map(([startMinute, endMinute]) => ({ staffId, weekday, startMinute, endMinute })))),
  });

  // ── Servicios ──
  const all = [owner.id, toño.id, luis.id];
  const mkSvc = (name: string, minutes: number, price: number, who: string[], description?: string) => ({ id: id(), name, minutes, price, who, description });
  const corte = mkSvc("Corte clásico", 40, 180, all, "Tijera y máquina");
  const fade = mkSvc("Degradado", 45, 220, all, "Fade bajo, medio o alto");
  const barba = mkSvc("Arreglo de barba", 30, 140, all, "Toalla caliente y navaja");
  const combo = mkSvc("Corte y barba", 75, 320, [owner.id, toño.id]);
  const lineas = mkSvc("Diseño o líneas", 15, 60, [luis.id]);
  const services = [corte, fade, barba, combo, lineas];
  await db.service.createMany({
    data: services.map((s, position) => ({ id: s.id, shopId: shop.id, name: s.name, minutes: s.minutes, price: s.price, description: s.description, position })),
  });
  await db.staffService.createMany({ data: services.flatMap((s) => s.who.map((staffId) => ({ staffId, serviceId: s.id }))) });

  // ── Productos ──
  const productRows = ([
    ["Cera mate 100 g", "Reuzel", "Ceras", 260, 150, 12],
    ["Pomada brillo medio", "Suavecito", "Pomadas", 240, 130, 8],
    ["Gel fijación fuerte 250 ml", "Ego", "Geles", 95, 48, 20],
    ["Aceite para barba 30 ml", "Proraso", "Aceites", 310, 175, 2],
    ["Bálsamo para barba", "Proraso", "Aceites", 290, 160, 5],
    ["Shampoo anticaída", "Nioxin", "Shampoo", 420, 260, 4],
    ["Polvo texturizante", "Slick Gorilla", "Ceras", 280, 150, 0],
    ["Gel de afeitar", "Proraso", "Afeitado", 180, 95, 9],
  ] as const).map(([name, brand, category, price, cost, stock]) => ({ id: id(), name, brand, category, price, cost, stock }));
  await db.product.createMany({ data: productRows.map((p) => ({ ...p, shopId: shop.id, minStock: 3 })) });
  await db.stockMovement.createMany({
    data: productRows.filter((p) => p.stock).map((p) => ({ shopId: shop.id, productId: p.id, type: "PURCHASE" as const, quantity: p.stock, stockAfter: p.stock, unitCost: p.cost, note: "Inventario inicial" })),
  });

  // ── Clientes ──
  const names = ["Carlos Ramírez", "Jorge Valencia", "Emiliano Ochoa", "Diego Cárdenas", "Ricardo Núñez", "Andrés Silva",
    "Fernando Topete", "Iván Larios", "Raúl Preciado", "Sebastián Gil", "Óscar Ceballos", "Hugo Brizuela"];
  // Historial por cliente: [visitas pasadas, cada cuántos días, días desde la última]
  const history: [number, number, number][] = [
    [9, 21, 6], [6, 28, 12], [5, 30, 70], [4, 35, 20], [8, 14, 30], [2, 25, 130],
    [3, 30, 3], [7, 20, 15], [1, 0, 2], [5, 40, 160], [10, 18, 9], [3, 21, 55],
  ];
  const origins = ["WALK_BY", "REFERRAL", "INSTAGRAM", "GOOGLE", "INSTAGRAM", "TIKTOK", "WALK_BY", "FACEBOOK", "ONLINE_BOOKING", "REFERRAL", "INSTAGRAM", "WALK_BY"] as const;
  const notes = ["Degradado bajo, nunca muy corto arriba", null, "Alérgico a la loción con alcohol", null, "Trae a su hijo los sábados"];
  const [, m0, dd0] = d0.split("-").map(Number);
  const customers = names.map((name, i) => ({ id: id(), name, phone: `312${String(5550100 + i * 37).padStart(7, "0")}` }));

  // ── Citas: historial (todas terminadas y cobradas) y las de hoy/mañana ──
  type Appt = { id: string; staffId: string; customerId: string; svc: (typeof services)[number]; startsAt: Date; status: "COMPLETED" | "CONFIRMED" | "PENDING" | "IN_PROGRESS" | "NO_SHOW"; source: "ONLINE" | "WALK_IN" };
  const appts: Appt[] = [];
  const barbers = [owner, toño, luis];
  const svcCycle = [corte, fade, barba, corte, fade];
  const custTotals = customers.map(() => ({ points: 0, visits: 0 }));
  for (const [i, [n, every, since]] of history.entries()) {
    for (let k = 0; k < n; k++) {
      const st = barbers[(i + k) % 3], sv = svcCycle[(i + k) % svcCycle.length];
      appts.push({
        id: id(), staffId: st.id, customerId: customers[i].id, svc: sv, status: "COMPLETED", source: k % 3 ? "WALK_IN" : "ONLINE",
        startsAt: localToUtc(addDays(d0, -(since + k * every)), 600 + (i % 8) * 60 + (k % 2) * 30, TZ),
      });
      custTotals[i].points += sv.price;
      custTotals[i].visits += 1;
    }
  }
  type Plan = [day: number, minute: number, staffId: string, svc: (typeof services)[number], cust: number, planned: "CONFIRMED" | "PENDING" | "NO_SHOW"];
  const plan: Plan[] = [
    [0, 600, toño.id, fade, 0, "CONFIRMED"], [0, 660, toño.id, corte, 1, "CONFIRMED"], [0, 720, toño.id, combo, 2, "CONFIRMED"],
    [0, 840, toño.id, barba, 3, "CONFIRMED"], [0, 960, toño.id, fade, 4, "PENDING"],
    [0, 615, owner.id, corte, 5, "CONFIRMED"], [0, 690, owner.id, barba, 6, "NO_SHOW"], [0, 900, owner.id, combo, 7, "CONFIRMED"],
    [0, 1035, owner.id, corte, 8, "CONFIRMED"],
    [0, 735, luis.id, fade, 9, "CONFIRMED"], [0, 810, luis.id, corte, 10, "CONFIRMED"], [0, 1110, luis.id, barba, 11, "PENDING"],
    [1, 630, toño.id, corte, 2, "CONFIRMED"], [1, 780, luis.id, fade, 5, "CONFIRMED"], [1, 900, owner.id, barba, 0, "PENDING"],
  ];
  const todays: Appt[] = plan.map(([day, minute, staffId, svc, c, planned]) => {
    const startsAt = localToUtc(addDays(d0, day), minute, TZ);
    const end = startsAt.getTime() + svc.minutes * 60_000;
    // El estado depende de la hora a la que se abre la demo: lo que ya pasó está terminado y cobrado
    const status: Appt["status"] = planned === "NO_SHOW" ? (startsAt.getTime() < now ? "NO_SHOW" : "CONFIRMED")
      : end <= now ? "COMPLETED" : startsAt.getTime() <= now ? "IN_PROGRESS" : planned;
    return { id: id(), staffId, customerId: customers[c].id, svc, startsAt, status, source: planned === "PENDING" ? "ONLINE" : "WALK_IN" };
  });
  appts.push(...todays);
  // ── Ventas de cada cita terminada (con comisión, IVA incluido y pago) ──
  const staffById = new Map(barbers.map((b) => [b.id, b]));
  const sales: { id: string; folio: number; customerId: string; appointmentId: string; subtotal: number; tip: number; createdAt: Date; method: "CASH" | "CARD" }[] = [];
  const items: { saleId: string; kind: "SERVICE" | "PRODUCT"; serviceId?: string; productId?: string; staffId: string; name: string; unitPrice: number; total: number; commission: number }[] = [];
  const loyalty: { customerId: string; kind: "EARN"; points: number; balance: number; note: string; saleId: string }[] = [];
  let folio = 1000;
  const running = new Map<string, number>();
  const done = appts.filter((a) => a.status === "COMPLETED").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (const [k, a] of done.entries()) {
    const st = staffById.get(a.staffId)!;
    const saleId = id();
    // La primera venta de hoy lleva una cera
    const withProduct = todays.includes(a) && !items.some((x) => x.kind === "PRODUCT");
    const p = productRows[0];
    const tip = k % 7 === 3 ? 30 : 0;
    const subtotal = a.svc.price + (withProduct ? p.price : 0);
    const endsAt = new Date(a.startsAt.getTime() + a.svc.minutes * 60_000);
    sales.push({ id: saleId, folio: ++folio, customerId: a.customerId, appointmentId: a.id, subtotal, tip, createdAt: endsAt, method: k % 2 ? "CARD" : "CASH" });
    items.push({ saleId, kind: "SERVICE", serviceId: a.svc.id, staffId: st.id, name: a.svc.name, unitPrice: a.svc.price, total: a.svc.price, commission: round2(a.svc.price * st.serviceCommission) });
    if (withProduct) items.push({ saleId, kind: "PRODUCT", productId: p.id, staffId: st.id, name: p.name, unitPrice: p.price, total: p.price, commission: round2(p.price * st.productCommission) });
    const bal = (running.get(a.customerId) ?? 0) + a.svc.price;
    running.set(a.customerId, bal);
    loyalty.push({ customerId: a.customerId, kind: "EARN", points: a.svc.price, balance: bal, note: "Visita", saleId });
  }
  // ── Clientes (con sellos, puntos, cumpleaños, origen y notas ya calculados) ──
  const visitsOf = (cid: string) => done.filter((a) => a.customerId === cid).length;
  await db.customer.createMany({
    data: [
      ...customers.map((c, i) => {
        const v = visitsOf(c.id);
        // Uno cumple hoy, otro en 3 días, y el resto repartido en el año
        const birthday = i === 0 ? new Date(Date.UTC(1992, m0 - 1, dd0)) : i === 3 ? new Date(Date.UTC(1988, m0 - 1, dd0 + 3))
          : new Date(Date.UTC(1985 + i, (i * 5) % 12, 1 + ((i * 7) % 27)));
        return {
          ...c, shopId: shop.id, points: running.get(c.id) ?? 0, stamps: v % 9, stampRewards: Math.floor(v / 9),
          origin: origins[i], birthday, preferredStaffId: i % 4 === 0 ? toño.id : null,
          referredById: origins[i] === "REFERRAL" && i !== 0 ? customers[0].id : null, acceptsMarketing: i !== 7, notes: notes[i % 5],
          createdAt: localToUtc(addDays(d0, -(history[i][2] + history[i][0] * history[i][1] + 2)), 600, TZ),
        };
      }),
      ...([["Mauricio Peña", "INSTAGRAM"], ["Alonso Vega", "GOOGLE"], ["Tomás Rangel", "REFERRAL"]] as const).map(([name, origin], k) => ({
        id: id(), shopId: shop.id, name, origin, phone: `312555${String(9100 + k).padStart(4, "0")}`,
      })),
    ],
  });
  await db.appointment.createMany({
    data: appts.map((a) => ({
      id: a.id, shopId: shop.id, staffId: a.staffId, customerId: a.customerId, status: a.status, source: a.source,
      startsAt: a.startsAt, endsAt: new Date(a.startsAt.getTime() + a.svc.minutes * 60_000),
      createdAt: new Date(Math.min(now, a.startsAt.getTime() - 3 * 86_400_000)),
    })),
  });
  await db.appointmentService.createMany({
    data: appts.map((a) => ({ appointmentId: a.id, serviceId: a.svc.id, name: a.svc.name, minutes: a.svc.minutes, price: a.svc.price })),
  });

  await db.sale.createMany({
    data: sales.map((s) => ({
      id: s.id, shopId: shop.id, folio: s.folio, customerId: s.customerId, appointmentId: s.appointmentId, chargedById: owner.id,
      subtotal: s.subtotal, tax: round2(s.subtotal - s.subtotal / 1.16), tip: s.tip, total: s.subtotal + s.tip, createdAt: s.createdAt, stampGiven: true,
    })),
  });
  await db.saleItem.createMany({ data: items });
  await db.payment.createMany({ data: sales.map((s) => ({ saleId: s.id, method: s.method, amount: s.subtotal + s.tip, createdAt: s.createdAt })) });
  await db.loyaltyMovement.createMany({ data: loyalty.map((l) => ({ ...l, shopId: shop.id, createdAt: sales.find((s) => s.id === l.saleId)!.createdAt })) });
  if (items.some((x) => x.kind === "PRODUCT")) {
    const p = productRows[0];
    await db.product.update({ where: { id: p.id }, data: { stock: p.stock - 1 } });
    await db.stockMovement.create({ data: { shopId: shop.id, productId: p.id, type: "SALE", quantity: -1, stockAfter: p.stock - 1 } });
  }

  // Resumen de sellos de cada cliente
  await db.loyaltyMovement.createMany({
    data: customers.filter((c) => visitsOf(c.id)).map((c) => ({ shopId: shop.id, customerId: c.id, kind: "STAMP" as const, points: visitsOf(c.id), balance: visitsOf(c.id) % 9, note: `${visitsOf(c.id)} visitas` })),
  });

  // ── Etiquetas, bitácora del cliente, seguimientos y una campaña ──
  const tags = [["Barba", "sand"], ["Estudiante", "sage"], ["Trae niños", "nickel"], ["Siempre puntual", "ash"]].map(([name, color]) => ({ id: id(), name, color }));
  await db.tag.createMany({ data: tags.map((t) => ({ ...t, shopId: shop.id })) });
  const [tBarba, tEstudiante, tNino, tPuntual] = tags;
  await db.customerTag.createMany({
    data: ([[0, tBarba], [0, tPuntual], [1, tEstudiante], [4, tNino], [4, tBarba], [6, tEstudiante], [10, tPuntual], [10, tBarba]] as const)
      .map(([i, t]) => ({ customerId: customers[i].id, tagId: t.id })),
  });
  const ago = (h: number) => new Date(now - h * 3_600_000);
  await db.customerActivity.createMany({
    data: [
      { customerId: customers[0].id, staffId: owner.id, type: "CALL" as const, body: "Confirmó la cita de mañana. Quiere probar el diseño de líneas.", createdAt: ago(30) },
      { customerId: customers[0].id, staffId: toño.id, type: "NOTE" as const, body: "Le gustó la cera mate, preguntó por la de 200 g.", createdAt: ago(200) },
      { customerId: customers[2].id, staffId: owner.id, type: "COMPLAINT" as const, body: "Esperó 25 minutos aunque tenía cita. Le ofrecimos 10% en su próxima visita.", createdAt: ago(24 * 75) },
      { customerId: customers[5].id, staffId: owner.id, type: "WHATSAPP" as const, body: "Te extrañamos. No respondió.", createdAt: ago(24 * 40) },
    ].map((a) => ({ ...a, shopId: shop.id })),
  });
  const due = (n: number) => new Date(`${addDays(d0, n)}T00:00:00Z`);
  await db.task.createMany({
    data: [
      { customerId: customers[2].id, assignedToId: owner.id, title: "Llamar a Emiliano: ofrecerle el 10% que le prometimos", dueOn: due(-2) },
      { customerId: customers[4].id, assignedToId: owner.id, title: "Avisar a Ricardo que ya llegó el bálsamo", dueOn: due(0) },
      { customerId: null, assignedToId: null, title: "Pedir más polvo texturizante al proveedor", dueOn: due(1) },
      { customerId: customers[9].id, assignedToId: luis.id, title: "Mandar promoción de regreso a Sebastián", dueOn: due(3) },
    ].map((t) => ({ ...t, shopId: shop.id, createdById: owner.id })),
  });
  await db.campaign.create({
    data: {
      shopId: shop.id, createdById: owner.id, name: "Te extrañamos, octubre", audience: "perdido",
      message: "¡Hola {nombre}! Hace rato que no te vemos en {barberia}. Esta semana tu corte va con 15% de descuento: {enlace}",
      recipients: { create: [customers[5], customers[9]].map((c, i) => ({ customerId: c.id, sentAt: i === 0 ? ago(24 * 40) : null })) },
    },
  });

  // ── Paquete: "5 cortes", uno ya vendido a Carlos con 3 usos restantes ──
  const pkg = await db.package.create({
    data: { shopId: shop.id, name: "5 cortes", kind: "BUNDLE", price: 800, uses: 5, days: 90, services: { create: [{ serviceId: corte.id }] } },
  });
  await db.customerPackage.create({
    data: { shopId: shop.id, customerId: customers[0].id, packageId: pkg.id, name: pkg.name, kind: "BUNDLE", usesTotal: 5, usesLeft: 3,
      serviceIds: [corte.id], expiresAt: new Date(now + 60 * 86_400_000), createdAt: ago(24 * 30) },
  });

  // ── Calificaciones de visitas pasadas ──
  const lastVisit = (i: number) => done.filter((a) => a.customerId === customers[i].id && !todays.includes(a)).at(-1);
  const reviews = ([[0, 5, "Siempre salgo como quiero. Toño es el mejor."], [1, 5, "Puntuales y muy limpios."], [3, 4, null],
    [4, 5, "Excelente atención, el café es un plus."], [10, 5, "El mejor degradado de Colima."], [6, 2, "Esperé más de 20 minutos."]] as const)
    .map(([i, rating, comment]) => ({ a: lastVisit(i), rating, comment }))
    .filter((r) => r.a);
  await db.review.createMany({
    data: reviews.map((r) => ({ shopId: shop.id, appointmentId: r.a!.id, customerId: r.a!.customerId, staffId: r.a!.staffId, rating: r.rating, comment: r.comment, createdAt: new Date(r.a!.startsAt.getTime() + 3 * 3_600_000) })),
  });

  // ── Gastos del mes ──
  const firstOfMonth = `${d0.slice(0, 8)}01`;
  await db.expense.createMany({
    data: [
      { date: new Date(`${firstOfMonth}T00:00:00Z`), category: "Renta", amount: 8000, method: "TRANSFER" as const, note: "Local de noviembre" },
      { date: new Date(`${d0}T00:00:00Z`), category: "Insumos y material", amount: 350, method: "CASH" as const, note: "Navajas y talco" },
    ].map((e) => ({ ...e, shopId: shop.id, createdById: owner.id })),
  });

  // ── Fila (dos llegaron sin cita) y lista de espera para mañana ──
  await db.queueEntry.createMany({
    data: [
      { name: "Pablo", serviceId: corte.id, createdAt: ago(0.2) },
      { name: "Kevin", serviceId: fade.id, staffId: toño.id, createdAt: ago(0.05) },
    ].map((q) => ({ ...q, shopId: shop.id, source: "PANEL" })),
  });
  await db.waitlistEntry.create({ data: { shopId: shop.id, customerId: customers[7].id, serviceId: fade.id, date: new Date(`${addDays(d0, 1)}T00:00:00Z`) } });

  // ── Bitácora ──
  const lastSale = sales.at(-1);
  await db.auditLog.createMany({
    data: [
      { action: "gasto.registro", summary: "Registró un gasto de $8,000.00 en Renta (Local de noviembre)", createdAt: ago(24 * 10) },
      { action: "precio.cambio", summary: "Cambió el precio de Degradado: $200.00 → $220.00", createdAt: ago(24 * 5) },
      ...(lastSale ? [{ action: "venta.cobro", summary: `Cobró la venta #${lastSale.folio} por $${(lastSale.subtotal + lastSale.tip).toFixed(2)}`, createdAt: lastSale.createdAt }] : []),
    ].map((l) => ({ ...l, shopId: shop.id, staffId: owner.id })),
  });

  return shop;
}
