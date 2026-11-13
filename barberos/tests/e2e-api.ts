// Pruebas de extremo a extremo contra el servidor corriendo (npm start). Uso: npm test
// Recorre los pasos de "Cómo comprobar que la réplica quedó bien" y reglas críticas del servidor.
import Stripe from "stripe";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let pass = 0, fail = 0;
function ok(cond: unknown, name: string, extra?: unknown) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; console.log("  ✘", name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
}

class Client {
  cookie = "";
  async req(method: string, path: string, body?: unknown) {
    const r = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie");
    if (sc) { const m = sc.match(/bos_session=([^;]*)/); if (m) this.cookie = m[1] ? `bos_session=${m[1]}` : ""; }
    let data: any = null; try { data = await r.json(); } catch {}
    return { status: r.status, data };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b: unknown = {}) => this.req("POST", p, b);
  patch = (p: string, b: unknown) => this.req("PATCH", p, b);
  del = (p: string) => this.req("DELETE", p);
}
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };

async function main() {
  const owner = new Client();
  const uniq = Date.now().toString().slice(-6);
  console.log("\n1) Setup, PIN y roles");
  const setup = await owner.post("/api/setup", { name: `Barbería Prueba ${uniq}`, city: "Colima", phone: "3120000000", ownerName: "Dueña Prueba", pin: "4321", workDays: [0, 1, 2, 3, 4, 5, 6], openTime: "08:00", closeTime: "22:00" });
  ok(setup.status === 201, "setup crea barbería y deja sesión", setup.data);
  const slug = setup.data.slug;
  const me = await owner.get("/api/auth/me");
  ok(me.data.member.role === "OWNER" && me.data.trial.status === "TRIALING" && me.data.trial.daysLeft === 14, "dueño en prueba de 14 días", me.data.trial);
  const today = me.data.shop.today, tomorrow = addDays(today, 1);

  const b1 = (await owner.post("/api/barbers", { name: "Beto Barbero", specialty: "Fade", phone: "3121231234", email: "beto@prueba.mx", commissionPct: 50 })).data.barber;
  const b2 = (await owner.post("/api/barbers", { name: "Chema", commissionPct: 40 })).data.barber;
  const svc = (await owner.post("/api/services", { name: "Corte", price: 20000, durationMin: 45 })).data.service;
  ok(b1?.id && svc?.id, "CRUD: crea barbero y servicio");

  let pub = await owner.get(`/api/public/${slug}`);
  ok(pub.data.members.length === 1, "pantalla de bloqueo: solo el dueño mientras el barbero no es miembro");
  const bad = await owner.post("/api/team", { name: "Beto", role: "BARBER", pin: "1111" });
  ok(bad.status === 400, "miembro barbero sin vínculo es rechazado");
  const mem = await owner.post("/api/team", { name: "Beto Barbero", role: "BARBER", barberId: b1.id, pin: "5555" });
  ok(mem.status === 201, "crea miembro barbero con PIN", mem.data);
  const rec = await owner.post("/api/team", { name: "Recepción", role: "RECEPTION", pin: "7777" });
  pub = await owner.get(`/api/public/${slug}`);
  ok(pub.data.members.length === 3, "ahora aparecen dueño, barbero y recepción");
  ok(!JSON.stringify(pub.data).includes("pinHash") && !JSON.stringify(pub.data).includes("scrypt"), "la API pública no expone hashes de PIN");

  console.log("\n2) Bloqueo tras 5 intentos fallidos");
  const atk = new Client();
  let last: any;
  for (let i = 0; i < 5; i++) last = await atk.post("/api/auth/login", { slug, memberId: rec.data.member.id, pin: "0000" });
  ok(last.status === 423, "5º intento fallido bloquea el perfil", last.data);
  const locked = await atk.post("/api/auth/login", { slug, memberId: rec.data.member.id, pin: "7777" });
  ok(locked.status === 423, "con PIN correcto sigue bloqueado 15 min");
  await owner.patch(`/api/team/${rec.data.member.id}`, { unlock: true });
  const reception = new Client();
  ok((await reception.post("/api/auth/login", { slug, memberId: rec.data.member.id, pin: "7777" })).status === 200, "el dueño desbloquea y recepción entra");

  console.log("\n3) Anti-choques y reprogramación");
  const c1 = await owner.post("/api/appointments", { barberId: b1.id, serviceId: svc.id, date: tomorrow, time: "10:00", newClient: { name: "Cliente Uno", phone: "3129990001" } });
  ok(c1.status === 201, "crea cita 10:00", c1.data);
  const c2 = await owner.post("/api/appointments", { barberId: b1.id, serviceId: svc.id, date: tomorrow, time: "10:30", newClient: { name: "Cliente Dos", phone: "3129990002" } });
  ok(c2.status === 409, "rechaza cita traslapada (10:30 dentro de 10:00–10:45)", c2.data);
  const c3 = await owner.post("/api/appointments", { barberId: b2.id, serviceId: svc.id, date: tomorrow, time: "10:00", newClient: { name: "Cliente Dos", phone: "3129990002" } });
  ok(c3.status === 201, "otro barbero sí puede a la misma hora");
  const resch = await owner.patch(`/api/appointments/${c1.data.appointment.id}`, { date: addDays(today, 2), time: "11:00" });
  ok(resch.status === 200 && resch.data.appointment.id === c1.data.appointment.id, "reprograma a otro día sin cancelar (mismo id)");
  const reschBad = await owner.patch(`/api/appointments/${c3.data.appointment.id}`, { barberId: b1.id, date: addDays(today, 2), time: "11:15" });
  ok(reschBad.status === 409, "reprogramar a un horario ocupado también se rechaza");
  // carrera: dos peticiones simultáneas al mismo hueco
  const race = await Promise.all([1, 2].map((i) => owner.post("/api/appointments", { barberId: b2.id, serviceId: svc.id, date: addDays(today, 3), time: "15:00", newClient: { name: `Carrera ${i}`, phone: `312888000${i}` } })));
  ok(race.filter((r) => r.status === 201).length === 1, "dos reservas simultáneas al mismo hueco: solo una entra (restricción en BD)", race.map((r) => r.status));

  console.log("\n4) Permisos en el servidor");
  const barber = new Client();
  ok((await barber.post("/api/auth/login", { slug, memberId: mem.data.member.id, pin: "5555" })).status === 200, "barbero entra con su PIN");
  const bAg = await barber.get(`/api/appointments?date=${tomorrow}`);
  ok(bAg.status === 200 && bAg.data.appointments.every((a: any) => a.barber.id === b1.id), "barbero solo ve su columna");
  ok(Object.keys(bAg.data.summary).length === 1 && bAg.data.summary[b1.id], "barbero recibe solo su franja Mi jornada");
  for (const p of ["/api/reports", "/api/plan", "/api/settings", "/api/expenses", "/api/cash", "/api/clients", "/api/team"]) ok((await barber.get(p)).status === 403, `barbero 403 en ${p}`);
  const otherAppt = c3.data.appointment.id;
  ok((await barber.get(`/api/appointments/${otherAppt}`)).status === 403, "barbero no abre citas de otro barbero");
  for (const p of ["/api/reports", "/api/plan", "/api/settings", "/api/expenses", "/api/cash"]) ok((await reception.get(p)).status === 403, `recepción 403 en ${p}`);
  ok((await reception.get(`/api/appointments?date=${tomorrow}`)).status === 200 && (await reception.get("/api/clients")).status === 200, "recepción ve agenda y clientes");
  ok((await reception.post("/api/cash/close", { date: today, countedCash: 0 })).status === 403, "recepción no puede cerrar caja");

  console.log("\n5) Recordatorios manuales");
  const rem = await owner.get("/api/reminders");
  const r1 = rem.data.tomorrow.find((x: any) => x.appointmentId === c3.data.appointment.id);
  ok(rem.data.automatic === false, "el sistema declara que el envío NO es automático");
  ok(r1 && r1.link.startsWith("https://wa.me/523129990002?text=") && decodeURIComponent(r1.link).includes("Chema") && decodeURIComponent(r1.link).includes("10:00"), "enlace wa.me con mensaje armado (cliente, barbero, hora)", r1);
  ok((await owner.post("/api/reminders", { appointmentId: r1.appointmentId, kind: "TOMORROW" })).status === 201, "marca enviado → ReminderLog");
  ok((await owner.post("/api/reminders", { appointmentId: r1.appointmentId, kind: "TOMORROW" })).status === 409, "no se puede marcar dos veces");

  console.log("\n6) Anticipo y Stripe pendiente");
  ok((await owner.patch("/api/settings", { depositEnabled: true, depositMode: "FIXED", depositValue: 5000 })).status === 200, "activa anticipo fijo $50");
  ok(c1.data.appointment && !(await owner.get(`/api/appointments/${c1.data.appointment.id}`)).data.appointment.deposit, "citas que ya existían no reciben anticipo");
  const slots = await owner.get(`/api/public/${slug}/slots?serviceId=${svc.id}&barberId=${b2.id}&date=${addDays(today, 4)}`);
  ok(slots.data.slots.length > 0, "reserva en línea muestra horarios libres reales");
  const book = await new Client().post(`/api/public/${slug}/book`, { serviceId: svc.id, barberId: b2.id, date: addDays(today, 4), time: slots.data.slots[0], name: "Cliente Web", phone: "3127770001" });
  ok(book.status === 201 && book.data.confirmation.deposit === 5000 && book.data.confirmation.total === 20000, "reserva en línea con anticipo requerido", book.data);
  const slots2 = await owner.get(`/api/public/${slug}/slots?serviceId=${svc.id}&barberId=${b2.id}&date=${addDays(today, 4)}`);
  ok(!slots2.data.slots.includes(slots.data.slots[0]), "el horario reservado desaparece de los libres");
  const rebook = await new Client().post(`/api/public/${slug}/book`, { serviceId: svc.id, barberId: b2.id, date: addDays(today, 4), time: slots.data.slots[0], name: "Otro", phone: "3127770002" });
  ok(rebook.status === 409, "no se puede reservar un horario ya tomado");
  const anySlots = await owner.get(`/api/public/${slug}/slots?serviceId=${svc.id}&barberId=any&date=${addDays(today, 6)}`);
  const anyBook = await new Client().post(`/api/public/${slug}/book`, { serviceId: svc.id, barberId: "any", date: addDays(today, 6), time: anySlots.data.slots[0], name: "Sin Pref", phone: "3127770009" });
  ok(anySlots.data.slots.length > 0 && anyBook.status === 201 && ["Beto Barbero", "Chema"].includes(anyBook.data.confirmation.barber), "reserva «Sin preferencia» asigna un barbero libre", anyBook.data);
  const payOnline = await new Client().post(`/api/public/${slug}/pay-deposit`, { token: book.data.confirmation.token });
  ok(payOnline.status === 409 && payOnline.data.code === "STRIPE_NOT_CONNECTED" && !payOnline.data.url, "pago con tarjeta sin Stripe: sin enlace y sin cobro", payOnline.data);
  const webId = book.data.confirmation.id;
  ok((await owner.get(`/api/appointments/${webId}`)).data.appointment.deposit.status === "PENDING", "anticipo sigue pendiente tras el intento fallido");
  ok((await owner.post(`/api/appointments/${webId}/deposit-checkout`)).status === 409, "cobrar anticipo con tarjeta desde el panel: Stripe no conectado");
  ok((await owner.post(`/api/appointments/${webId}/deposit`, { method: "TRANSFER" })).status === 200, "registra anticipo por transferencia a mano");
  ok((await owner.post(`/api/appointments/${webId}/deposit`, { method: "CASH" })).status === 409, "no se registra el anticipo dos veces");
  const q = await owner.get(`/api/appointments/${webId}/charge`);
  ok(q.data.remaining === 15000 && q.data.depositPaid === 5000, "al cobrar solo pide el resto ($150)", q.data);
  const ch = await owner.post(`/api/appointments/${webId}/charge`, { method: "CASH", expectedRemaining: 15000 });
  ok(ch.status === 200 && ch.data.result.charged + ch.data.result.depositApplied + ch.data.result.discount === 20000, "anticipo + resto + descuento = precio");
  const ch2 = await owner.post(`/api/appointments/${webId}/charge`, { method: "CASH" });
  ok(ch2.status === 409, "cobrar dos veces la misma cita es imposible", ch2.data);
  const dbl = await Promise.all([1, 2].map(() => owner.post(`/api/appointments/${c3.data.appointment.id}/charge`, { method: "CARD" })));
  ok(dbl.filter((r) => r.status === 200).length === 1, "dos cobros simultáneos: solo uno pasa", dbl.map((r) => r.status));

  console.log("\n7) Webhook de Stripe (firma real, sin red)");
  const whsec = "whsec_test_" + uniq;
  await owner.patch("/api/settings", { stripeWebhookSecret: whsec });
  const bk2 = await new Client().post(`/api/public/${slug}/book`, { serviceId: svc.id, barberId: b1.id, date: addDays(today, 5), time: "12:00", name: "Pago Web", phone: "3127770003" });
  const meId = (await owner.get("/api/auth/me")).data.shop.id;
  const depId = (await owner.get(`/api/appointments/${bk2.data.confirmation.id}`)).data.appointment.deposit.id;
  const evt = JSON.stringify({ id: "evt_" + uniq, object: "event", type: "checkout.session.completed", data: { object: { id: "cs_" + uniq, object: "checkout.session", payment_status: "paid", amount_total: 5000, metadata: { kind: "deposit", barbershopId: meId, refId: depId } } } });
  const forged = await fetch(`${BASE}/api/stripe/webhook/${meId}`, { method: "POST", body: evt, headers: { "stripe-signature": "t=1,v1=fake" } });
  ok(forged.status === 400, "webhook con firma falsa es rechazado");
  ok((await owner.get(`/api/appointments/${bk2.data.confirmation.id}`)).data.appointment.deposit.status === "PENDING", "sin firma válida no se marca pagado");
  const header = Stripe.webhooks.generateTestHeaderString({ payload: evt, secret: whsec });
  const real = await fetch(`${BASE}/api/stripe/webhook/${meId}`, { method: "POST", body: evt, headers: { "stripe-signature": header } });
  ok(real.status === 200, "webhook firmado aceptado");
  const after = (await owner.get(`/api/appointments/${bk2.data.confirmation.id}`)).data.appointment.deposit;
  ok(after.status === "PAID" && after.method === "CARD", "solo con webhook firmado el anticipo queda pagado con tarjeta");

  console.log("\n8) Caja, gastos y productos");
  const prod = (await owner.post("/api/products", { name: "Cera", price: 12000, cost: 5000, stock: 5, lowStockAlert: 2 })).data.product;
  ok((await reception.post(`/api/products/${prod.id}/sell`, { qty: 2, method: "CASH" })).status === 201, "recepción vende 2 piezas en un toque");
  const over = await owner.post(`/api/products/${prod.id}/sell`, { qty: 10, method: "CASH" });
  ok(over.status === 400, "no deja vender más de lo que hay", over.data);
  const plist = (await owner.get("/api/products")).data.products.find((p: any) => p.id === prod.id);
  ok(plist.stock === 3 && plist.margin === 7000, "stock 3 y margen calculado $70");
  ok((await owner.post(`/api/products/${prod.id}/stock`, { delta: -4, reason: "merma" })).status === 400, "ajuste de salida no deja stock negativo");
  ok((await owner.post(`/api/products/${prod.id}/stock`, { delta: 10, reason: "compra" })).data.product.stock === 13, "entrada de inventario con motivo");
  const exp = await owner.post("/api/expenses", { concept: "Navajas", category: "INSUMOS", amount: 8000, date: today });
  ok(exp.status === 201, "registra gasto");
  ok((await owner.patch(`/api/expenses/${exp.data.expense.id}`, { amount: 9000 })).data.expense.amount === 9000, "edita gasto");
  const cash = (await owner.get(`/api/cash?date=${today}`)).data.totals;
  // hoy: anticipo transferencia 5000, cobro efectivo 15000, cobro tarjeta 20000 (c3), producto efectivo 24000, anticipo tarjeta (webhook) 5000
  ok(cash.services === 35000 && cash.deposits === 10000 && cash.products === 24000, "corte separa servicios, anticipos y productos", cash);
  ok(cash.byMethod.CASH === 39000 && cash.expectedCash === 39000, "efectivo esperado = cobros en efectivo");
  ok(cash.net === cash.income - cash.expenses && cash.expenses === 9000, "neto real = ingresos − gastos");
  ok(cash.commissions.find((c: any) => c.barberId === b2.id)?.commission === Math.round((20000 + 20000) * 0.4), "comisión por barbero", cash.commissions);
  const close = await owner.post("/api/cash/close", { date: today, countedCash: 38000 });
  ok(close.status === 201 && close.data.closure.difference === -1000, "cierre guarda diferencia contado − esperado (−$10)");
  ok((await owner.post("/api/cash/close", { date: today, countedCash: 38000 })).status === 409, "no se cierra caja dos veces");

  console.log("\n9) Lealtad");
  await owner.patch("/api/settings", { depositEnabled: false });
  const loyal = (await owner.post("/api/clients", { name: "Fiel", phone: "3126660001" })).data.client;
  let lastRes: any;
  for (let i = 0; i < 5; i++) {
    const a = (await owner.post("/api/appointments", { barberId: b1.id, serviceId: svc.id, date: addDays(today, 10), time: `${10 + i}:00`, clientId: loyal.id })).data.appointment;
    await owner.post(`/api/appointments/${a.id}/status`, { status: "COMPLETED" });
    lastRes = (await owner.post(`/api/appointments/${a.id}/charge`, { method: "CASH" })).data.result;
  }
  ok(lastRes.rewardEarned === true && lastRes.stamps === 0, "5 cobros = recompensa automática", lastRes);
  const sixth = (await owner.post("/api/appointments", { barberId: b1.id, serviceId: svc.id, date: addDays(today, 10), time: "16:00", clientId: loyal.id })).data.appointment;
  const sq = (await owner.get(`/api/appointments/${sixth.id}/charge?useReward=1`)).data;
  ok(sq.remaining === 0 && sq.discount === 20000, "6ª con recompensa 100% queda en $0", sq);
  const s6 = await owner.post(`/api/appointments/${sixth.id}/charge`, { method: "CASH", useReward: true });
  ok(s6.status === 200 && s6.data.result.charged === 0, "cobro de $0 registrado y recompensa canjeada");
  const seventh = (await owner.post("/api/appointments", { barberId: b1.id, serviceId: svc.id, date: addDays(today, 10), time: "17:00", clientId: loyal.id })).data.appointment;
  ok((await owner.post(`/api/appointments/${seventh.id}/charge`, { method: "CASH", useReward: true })).status === 400, "no se canjea la misma recompensa dos veces");
  ok((await owner.post(`/api/appointments/${sixth.id}/rating`, { stars: 4 })).status === 201, "califica al barbero");
  ok((await owner.post(`/api/appointments/${sixth.id}/rating`, { stars: 5 })).status === 409, "una calificación por cita");
  const bl = (await owner.get("/api/barbers")).data.barbers.find((b: any) => b.id === b1.id);
  ok(bl.rating?.avg === 4, "promedio de estrellas en la tarjeta del barbero");
  const card = (await owner.get(`/api/clients/${loyal.id}`)).data.client;
  ok(card.visits === 6 && card.history.some((h: any) => h.loyaltyDiscount === 20000) && card.loyalty.stamps === 1, "ficha: historial con descuento de lealtad y sellos", card.loyalty);

  console.log("\n10) No-show, recuperación y reportes");
  const ns = (await owner.post("/api/appointments", { barberId: b2.id, serviceId: svc.id, date: tomorrow, time: "18:00", clientId: loyal.id })).data.appointment;
  await owner.post(`/api/appointments/${ns.id}/status`, { status: "NO_SHOW" });
  const nsl = (await owner.get("/api/clients?filter=noshow")).data.clients;
  ok(nsl.some((c: any) => c.id === loyal.id && c.noShows === 1), "filtro Con faltas muestra No se presentó ×1");
  const demoOwner = new Client();
  const demo = (await demoOwner.get("/api/public/demo")).data;
  const demoOwnerId = demo.members.find((m: any) => m.role === "OWNER").id;
  await demoOwner.post("/api/auth/login", { slug: "demo", memberId: demoOwnerId, pin: "1234" });
  const recov = (await demoOwner.get("/api/clients?filter=recover")).data.clients;
  ok(recov.length > 0 && recov[0].recoveryLink.startsWith("https://wa.me/52") && recov[0].recoveryMessage.includes("días"), "Por recuperar con mensaje armado (días, último servicio, lealtad)", recov[0]?.recoveryMessage);
  ok((await demoOwner.post(`/api/clients/${recov[0].id}/recovery`)).status === 201, "marca recuperación enviada → RecoveryLog");
  const rep = (await owner.get("/api/reports")).data;
  ok(rep.week.loyalty.redeemed >= 0 && "pendingDeposits" in rep.week && "lost" in rep.week, "reportes semanales con lealtad, anticipos y perdidas");

  console.log("\n11) Aislamiento entre barberías");
  ok((await owner.get(`/api/appointments/${ns.id}`)).status === 200, "(control) el dueño ve su cita");
  ok((await demoOwner.get(`/api/appointments/${ns.id}`)).status === 404, "otra barbería no ve la cita");
  ok((await demoOwner.patch(`/api/barbers/${b1.id}`, { name: "Hackeado", commissionPct: 99 })).status === 404, "otra barbería no edita el barbero");
  ok((await demoOwner.post(`/api/appointments/${seventh.id}/charge`, { method: "CASH" })).status === 404, "otra barbería no cobra la cita");
  ok((await demoOwner.post("/api/appointments", { barberId: b1.id, serviceId: svc.id, date: tomorrow, time: "09:00", newClient: { name: "X", phone: "3120000009" } })).status === 404, "no puede agendar con barbero ajeno");

  console.log("\n12) Planes");
  ok((await owner.post("/api/plan", { plan: "PRO" })).data.subscription.plan === "PRO", "cambio de plan guardado");
  const pl = (await owner.get("/api/plan")).data;
  ok(pl.paid === false && pl.subscription.lastPaidAt === null, "cambio de plan no marca pago");
  ok((await owner.post("/api/plan/checkout")).status === 409, "pagar suscripción sin Stripe: no conectado, sin cobro");

  console.log("\n13) Bloquear");
  ok((await barber.post("/api/auth/logout")).status === 200 && (await barber.get(`/api/appointments?date=${today}`)).status === 401, "Bloquear cierra la sesión en el servidor");

  console.log(`\nResultado: ${pass} OK, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
