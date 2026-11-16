// Recorrido completo de una barbería nueva, como la usaría alguien de verdad.
// Cada paso depende del anterior (misma barbería), por eso van en serie.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cleanupShops, one, sql } from "./db";

test.describe.configure({ mode: "serial" });

const NAME = `E2E ${Date.now().toString(36)}`;
const TZ = "America/Mexico_City";
const PHONE = { ana: "3120002001", beto: "3120002002", caro: "3120002003", dani: "3120002004" };

let ctx: BrowserContext;
let page: Page;
let shop: { id: string; slug: string };
let owner: { id: string; name: string };

// Fecha de hoy en la zona de la barbería y días siguientes ("YYYY-MM-DD")
const todayMx = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const money = (s: string | null) => Number((s ?? "").replace(/[^\d.]/g, ""));

/** POS: agrega un servicio, elige al barbero y registra al cliente por teléfono. */
async function posStart(opts: { service?: string; phone?: string; name?: string; pkg?: string }) {
  await page.goto("/ventas/nueva");
  if (opts.pkg) {
    await page.getByRole("tab", { name: "Paquetes" }).click();
    await page.getByRole("button", { name: new RegExp(opts.pkg) }).click();
  }
  if (opts.service) {
    await page.getByRole("tab", { name: "Servicios" }).click();
    await page.getByRole("button", { name: new RegExp(opts.service) }).first().click();
    await page.locator('select[aria-label="Barbero"]').first().selectOption({ index: 1 });
  }
  if (opts.phone) {
    await page.getByText("Registrar cliente (opcional)").click();
    await page.getByLabel("Teléfono").fill(opts.phone);
    if (opts.name) await page.getByLabel("Nombre", { exact: true }).fill(opts.name);
    else await page.getByText(/Ya es cliente/).waitFor();
    await page.waitForTimeout(500);
  }
}

async function posCharge() {
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  await page.waitForURL(/\/ventas\/[0-9a-f-]+\?nueva=1/);
  return page.url().match(/ventas\/([0-9a-f-]+)/)![1];
}

/** Página pública: elige servicio y día; devuelve los horarios que ofrece. */
async function publicDay(dayIndex: number) {
  await page.goto(`/b/${shop.slug}`);
  await page.getByRole("button", { name: /Corte clásico/ }).click();
  await page.getByRole("option").nth(dayIndex).click();
  await expect(page.getByText("Buscando horarios…")).toHaveCount(0);
  return page.locator("button[aria-pressed]");
}

test.beforeAll(async ({ browser }) => {
  await cleanupShops(); // restos de una corrida anterior que se interrumpió
  // Los límites de intentos de la página pública (por IP y teléfono) se llenarían al correr las pruebas varias veces
  await sql(`DELETE FROM rate_limits`);
  ctx = await browser.newContext();
  page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
});

test.afterAll(async () => {
  await ctx?.close();
});

test("1. crear la barbería desde cero", async () => {
  await page.goto("/onboarding?nueva=1");
  await page.getByLabel("Nombre de la barbería").fill(NAME);
  await page.getByLabel("Teléfono").fill("3120001111");
  await page.getByRole("button", { name: "Crear barbería" }).click();
  await page.waitForURL("**/hoy");
  await expect(page.getByRole("heading", { name: "Primeros pasos" })).toBeVisible();

  shop = await one(`SELECT id, slug FROM barbershops WHERE name = $1`, [NAME]);
  owner = await one(`SELECT id, name FROM staff WHERE "shopId" = $1 AND role = 'OWNER'`, [shop.id]);
  const services = await sql(`SELECT name FROM services WHERE "shopId" = $1`, [shop.id]);
  expect(services.length).toBeGreaterThanOrEqual(4);

  // Tarjeta de 2 sellos para poder probar el premio rápido
  await page.goto("/ajustes");
  const loyalty = page.locator("form", { has: page.locator("input[name=stampsRequired]") });
  await loyalty.locator("input[name=stampsRequired]").fill("2");
  await loyalty.getByRole("button", { name: "Guardar" }).click();
  await expect.poll(async () => (await one<{ n: number }>(`SELECT "stampsRequired" AS n FROM barbershops WHERE id = $1`, [shop.id])).n).toBe(2);
});

test("2. un cliente reserva en línea, confirma y cambia su horario", async () => {
  // Primer día con horarios (hoy puede estar cerrado o ya tarde)
  let i = 0;
  for (; i < 8; i++) if ((await (await publicDay(i)).count()) > 0) break;
  expect(i).toBeLessThan(8);
  await page.locator("button[aria-pressed]").first().click();
  await page.getByLabel("Nombre").fill("Ana E2E");
  await page.getByLabel("Teléfono").fill(PHONE.ana);
  await page.getByRole("button", { name: /^Reservar/ }).click();
  await expect(page.getByText(/¡Listo, Ana!/)).toBeVisible();

  const manage = await page.locator('a[href^="/c/"]').first().getAttribute("href");
  await page.goto(manage!);
  await page.getByRole("button", { name: "Confirmar que voy" }).click();
  await expect(page.getByText("Confirmada").first()).toBeVisible();

  await page.getByRole("button", { name: "Cambiar horario" }).click();
  const before = await one<{ startsAt: Date }>(`SELECT "startsAt" FROM appointments WHERE token = $1`, [manage!.split("/c/")[1]]);
  const slots = page.locator("button:not([aria-pressed])", { hasText: /^\d{1,2}:\d{2}$/ });
  await slots.last().click();
  await expect.poll(async () => (await one<{ startsAt: Date }>(`SELECT "startsAt" FROM appointments WHERE token = $1`, [manage!.split("/c/")[1]])).startsAt.getTime())
    .not.toBe(before.startsAt.getTime());
});

test("3. día lleno: lista de espera y aviso al cancelar", async () => {
  // Un día futuro (no domingo) con el barbero ocupado de 10:00 a 19:00
  const t = todayMx();
  let k = 2;
  while (weekday(addDays(t, k)) === 0) k++;
  const day = addDays(t, k);
  await page.goto(`/equipo/${owner.id}`);
  const off = page.locator("form", { has: page.getByRole("button", { name: "Registrar ausencia" }) });
  await off.locator("input[name=from]").fill(day);
  await off.locator("input[name=to]").fill(day);
  await off.locator("input[name=start]").fill("10:00");
  await off.locator("input[name=end]").fill("19:00");
  await off.locator("input[name=reason]").fill("Prueba");
  await off.getByRole("button", { name: "Registrar ausencia" }).click();
  await expect(off.getByRole("status")).toBeVisible();

  // Beto toma el último lugar
  const slots = await publicDay(k);
  await expect(slots.first()).toHaveText("19:00");
  await slots.first().click();
  await page.getByLabel("Nombre").fill("Beto E2E");
  await page.getByLabel("Teléfono").fill(PHONE.beto);
  await page.getByRole("button", { name: /^Reservar/ }).click();
  await expect(page.getByText(/¡Listo, Beto!/)).toBeVisible();

  // Caro ya no encuentra lugar y se apunta a la lista
  expect(await (await publicDay(k)).count()).toBe(0);
  await page.getByRole("button", { name: "Avísame si se libera un lugar" }).click();
  await page.getByLabel("Nombre").fill("Caro E2E");
  await page.getByLabel("Teléfono").fill(PHONE.caro);
  await page.getByRole("button", { name: "Avísame", exact: true }).click();
  await expect(page.getByText(/estás en la lista de espera/)).toBeVisible();

  // Se cancela la cita de Beto desde el panel → a Caro le llega el aviso
  const beto = await one<{ id: string }>(`SELECT a.id FROM appointments a JOIN customers c ON c.id = a."customerId" WHERE a."shopId" = $1 AND c.phone = $2`, [shop.id, PHONE.beto]);
  await page.goto(`/citas/${beto.id}`);
  await page.getByRole("button", { name: /^Cancelar/ }).first().click();
  await expect.poll(async () => (await sql(`SELECT 1 FROM outbound_messages m JOIN customers c ON c.id = m."customerId" WHERE m."shopId" = $1 AND m.kind = 'WAITLIST_OPEN' AND c.phone = $2`, [shop.id, PHONE.caro])).length, { timeout: 20_000 }).toBe(1);
  await page.goto("/seguimiento/mensajes");
  await expect(page.getByText(/se liberó un lugar/).first()).toBeVisible();
});

test("4. fila virtual: llega sin cita, pasa a la silla y paga en efectivo", async () => {
  await page.goto("/fila");
  const add = page.locator("form", { has: page.getByRole("button", { name: "Agregar" }) });
  await add.locator("input[name=name]").fill("Dani E2E");
  await add.locator("input[name=phone]").fill(PHONE.dani);
  await add.locator("select[name=serviceId]").selectOption({ label: "Corte clásico" });
  await add.getByRole("button", { name: "Agregar" }).click();
  const row = page.locator("li", { hasText: "Dani E2E" });
  await expect(row).toBeVisible();
  await expect(page.getByRole("heading", { name: "Barberos ahora" })).toBeVisible();

  await row.locator("select[name=staffId]").selectOption({ index: 1 });
  await row.getByRole("button", { name: "Pasar a la silla" }).click();
  await page.waitForURL(/\/citas\/[0-9a-f-]+/);

  // Efectivo: pide cuánto le dio y no deja cobrar si falta
  await page.getByRole("button", { name: /Cobrar \$180 en efectivo/ }).click();
  await page.getByLabel(/¿Cuánto te dio\?/).fill("100");
  await expect(page.getByText("Faltan $80.00")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar cobro" })).toBeDisabled();
  await page.getByLabel(/¿Cuánto te dio\?/).fill("200");
  await expect(page.getByText("$20.00")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar cobro" }).click();
  await page.waitForURL(/\/ventas\/[0-9a-f-]+/);

  const c = await one<{ stamps: number }>(`SELECT stamps FROM customers WHERE "shopId" = $1 AND phone = $2`, [shop.id, PHONE.dani]);
  expect(c.stamps).toBe(1);
});

test("5. caja: segundo sello, premio y validaciones", async () => {
  // Con efectivo insuficiente no deja cobrar
  await posStart({ service: "Corte clásico", phone: PHONE.dani });
  await page.getByLabel("Recibido").fill("50");
  await expect(page.getByRole("button", { name: /^Cobrar/ })).toBeDisabled();
  await page.getByLabel("Recibido").fill("180");
  await posCharge();
  const c = await one<{ stamps: number; stampRewards: number }>(`SELECT stamps, "stampRewards" FROM customers WHERE "shopId" = $1 AND phone = $2`, [shop.id, PHONE.dani]);
  expect(c).toEqual({ stamps: 0, stampRewards: 1 });

  // Tercera visita: usa el premio y el corte sale gratis
  await posStart({ service: "Corte clásico", phone: PHONE.dani });
  await page.locator("label", { hasText: "Tiene un premio" }).locator("input").check();
  await expect(page.getByRole("button", { name: /^Cobrar/ })).toHaveText(/\$0\.00/);
  const saleId = await posCharge();
  const s = await one<{ total: string; rewardRedeemed: boolean }>(`SELECT total, "rewardRedeemed" FROM sales WHERE id = $1`, [saleId]);
  expect(Number(s.total)).toBe(0);
  expect(s.rewardRedeemed).toBe(true);
});

test("6. paquetes: se vende y se descuenta solo en la siguiente visita", async () => {
  await page.goto("/servicios/paquetes");
  const form = page.locator("aside form");
  await form.locator("input[name=name]").fill("3 cortes E2E");
  await form.locator("input[name=price]").fill("450");
  await form.locator("input[name=uses]").fill("3");
  await form.locator("input[name=days]").fill("60");
  await form.getByText("Corte clásico").click();
  await form.getByRole("button", { name: "Crear" }).click();
  await expect(form.getByRole("status")).toBeVisible();

  await posStart({ pkg: "3 cortes E2E", phone: PHONE.ana });
  await page.getByRole("button", { name: "Tarjeta" }).click();
  await posCharge();

  await posStart({ service: "Corte clásico", phone: PHONE.ana });
  await expect(page.locator("label", { hasText: "Usar su paquete" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Cobrar/ })).toHaveText(/\$0\.00/);
  await posCharge();
  const p = await one<{ usesLeft: number }>(`SELECT "usesLeft" FROM customer_packages WHERE "shopId" = $1`, [shop.id]);
  expect(p.usesLeft).toBe(2);
});

test("7. gastos, corte de caja y comisiones", async () => {
  await page.goto("/gastos");
  const form = page.locator("form", { has: page.getByRole("button", { name: "Registrar gasto" }) });
  await form.locator("input[name=amount]").fill("100");
  await form.locator("select[name=category]").selectOption({ index: 1 });
  await form.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(form.getByRole("status")).toBeVisible();

  // Efectivo: 180 (fila) + 180 (caja) = 360; menos el gasto de 100 = 260 esperados en caja
  await page.goto("/ventas/corte");
  await expect(page.locator("input[name=withdrawals]")).toHaveValue("100");
  await page.locator("input[name=counted]").fill("260");
  await page.getByRole("button", { name: "Hacer corte" }).click();
  await expect.poll(async () => (await sql(`SELECT 1 FROM cash_closures WHERE "shopId" = $1`, [shop.id])).length).toBe(1);
  const cc = await one<{ expectedCash: string; difference: string }>(`SELECT "expectedCash", difference FROM cash_closures WHERE "shopId" = $1`, [shop.id]);
  expect(Number(cc.expectedCash)).toBe(260);
  expect(Number(cc.difference)).toBe(0);

  await page.goto("/ventas/comisiones");
  await page.getByRole("button", { name: /^(Pagar|Adelantar|Todo)/ }).first().click();
  await expect.poll(async () => (await sql(`SELECT 1 FROM commission_payouts WHERE "shopId" = $1`, [shop.id])).length).toBeGreaterThan(0);
});

test("8. reportes, gastos y bitácora reflejan lo que pasó", async () => {
  await page.goto("/reportes");
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  await page.goto("/gastos");
  await expect(page.getByText(/Utilidad/).first()).toBeVisible();
  await page.goto("/bitacora");
  await expect(page.getByText(/Canceló la cita de Beto E2E/)).toBeVisible();
  await page.goto("/hoy");
  await expect(page.getByText("Vendido hoy")).toBeVisible();
});

test("9. el cliente califica su visita y ve su tarjeta", async () => {
  const visit = await one<{ token: string }>(
    `SELECT a.token FROM appointments a JOIN customers c ON c.id = a."customerId" WHERE a."shopId" = $1 AND c.phone = $2 AND a.status = 'COMPLETED'`,
    [shop.id, PHONE.dani]);
  await page.goto(`/c/${visit.token}`);
  await page.getByRole("radio", { name: "5 de 5" }).click();
  await page.getByLabel(/Algo que quieras contarnos/).fill("Muy buen corte");
  await page.getByRole("button", { name: "Enviar calificación" }).click();
  await expect(page.getByText("¡Gracias por tu calificación!")).toBeVisible();

  const dani = await one<{ token: string }>(`SELECT token FROM customers WHERE "shopId" = $1 AND phone = $2`, [shop.id, PHONE.dani]);
  await page.goto(`/mi/${dani.token}`);
  await expect(page.getByText(/Hola, Dani/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tus visitas" })).toBeVisible();

  const ana = await one<{ token: string }>(`SELECT token FROM customers WHERE "shopId" = $1 AND phone = $2`, [shop.id, PHONE.ana]);
  await page.goto(`/mi/${ana.token}`);
  await expect(page.getByText("Te quedan 2 de 3")).toBeVisible();
});
