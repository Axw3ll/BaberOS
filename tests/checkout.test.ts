// Pruebas de cobro contra una base de datos real (la de DATABASE_URL).
// Crea una barbería de prueba aislada y la borra al terminar. Si no hay DATABASE_URL, se omiten.
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const enabled = Boolean(process.env.DATABASE_URL);

describe("cobro", { skip: !enabled && "sin DATABASE_URL" }, () => {
  // Importaciones tardías: sin base de datos no se carga Prisma
  let prisma: typeof import("../src/lib/prisma").prisma;
  let checkout: typeof import("../src/lib/sales").checkout;
  let voidSale: typeof import("../src/lib/sales").voidSale;
  let SaleError: typeof import("../src/lib/sales").SaleError;
  const ids = { user: randomUUID(), shop: "", staff: "", corte: "", barba: "", cera: "", pkg: "", customer: "" };

  before(async () => {
    ({ prisma } = await import("../src/lib/prisma"));
    ({ checkout, voidSale, SaleError } = await import("../src/lib/sales"));
    await prisma.user.create({ data: { id: ids.user, email: `prueba-${ids.user}@barberos.test`, name: "Prueba" } });
    const shop = await prisma.barbershop.create({ data: { ownerId: ids.user, name: "Prueba", slug: `prueba-${ids.user.slice(0, 8)}` } });
    ids.shop = shop.id;
    ids.staff = (await prisma.staff.create({ data: { shopId: shop.id, name: "Barbero", role: "BARBER", serviceCommission: 0.4, productCommission: 0.1 } })).id;
    ids.corte = (await prisma.service.create({ data: { shopId: shop.id, name: "Corte", minutes: 30, price: 180 } })).id;
    ids.barba = (await prisma.service.create({ data: { shopId: shop.id, name: "Barba", minutes: 20, price: 120 } })).id;
    ids.cera = (await prisma.product.create({ data: { shopId: shop.id, name: "Cera", price: 150, stock: 2 } })).id;
    ids.customer = (await prisma.customer.create({ data: { shopId: shop.id, name: "Cliente", phone: "3120000000" } })).id;
    ids.pkg = (await prisma.package.create({
      data: { shopId: shop.id, name: "3 cortes", kind: "BUNDLE", price: 450, uses: 3, days: 60, services: { create: [{ serviceId: ids.corte }] } },
    })).id;
  });

  after(async () => {
    if (!prisma) return;
    await prisma.sale.deleteMany({ where: { shopId: ids.shop } });
    await prisma.barbershop.deleteMany({ where: { id: ids.shop } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.$disconnect();
  });

  const base = () => ({ shopId: ids.shop, chargedById: ids.staff, discount: 0, tip: 0, method: "CASH" as const });
  const corte = () => ({ kind: "SERVICE" as const, serviceId: ids.corte, staffId: ids.staff, quantity: 1 });
  const rejects = (p: Promise<unknown>, msg: RegExp) => assert.rejects(p, (e: Error) => e instanceof SaleError && msg.test(e.message));

  test("calcula total, IVA incluido y comisión", async () => {
    const s = await checkout({ ...base(), lines: [corte(), { kind: "PRODUCT", productId: ids.cera, staffId: ids.staff, quantity: 1 }], received: 500 });
    assert.equal(Number(s.total), 330);
    const items = await prisma.saleItem.findMany({ where: { saleId: s.id }, orderBy: { kind: "asc" } });
    assert.deepEqual(items.map((i) => Number(i.commission)).sort(), [15, 72]); // 40% de 180 y 10% de 150
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: ids.cera } })).stock, 1);
  });

  test("no deja cobrar con efectivo menor al total", () =>
    rejects(checkout({ ...base(), lines: [corte()], received: 100 }), /menor que el total/));

  test("rechaza descuentos negativos, mayores al subtotal o arriba del tope del rol", async () => {
    await rejects(checkout({ ...base(), lines: [corte()], discount: -10 }), /negativo/);
    await rejects(checkout({ ...base(), lines: [corte()], discount: 500 }), /mayor al subtotal/);
    await rejects(checkout({ ...base(), lines: [corte()], discount: 50, maxDiscountPct: 10 }), /descuento máximo es de 10%/);
  });

  test("rechaza cantidades inválidas y productos sin existencia", async () => {
    await rejects(checkout({ ...base(), lines: [{ kind: "PRODUCT", productId: ids.cera, quantity: -1 }] }), /enteros/);
    await rejects(checkout({ ...base(), lines: [{ kind: "PRODUCT", productId: ids.cera, quantity: 1.5 }] }), /enteros/);
    await rejects(checkout({ ...base(), lines: [{ kind: "PRODUCT", productId: ids.cera, quantity: 5 }] }), /No hay suficiente/);
  });

  test("cancelar una venta regresa el inventario", async () => {
    const s = await checkout({ ...base(), lines: [{ kind: "PRODUCT", productId: ids.cera, quantity: 1 }] });
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: ids.cera } })).stock, 0);
    await voidSale(ids.shop, s.id);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: ids.cera } })).stock, 1);
  });

  test("paquete: se vende, se usa en la siguiente visita y cancelar devuelve el uso", async () => {
    await rejects(checkout({ ...base(), lines: [{ kind: "PACKAGE", packageId: ids.pkg, quantity: 1 }] }), /registra al cliente/);
    await checkout({ ...base(), customerId: ids.customer, lines: [{ kind: "PACKAGE", packageId: ids.pkg, quantity: 1 }] });
    const owned = () => prisma.customerPackage.findFirstOrThrow({ where: { customerId: ids.customer } });
    assert.equal((await owned()).usesLeft, 3);

    // Corte cubierto + barba que no cubre: solo se cobra la barba
    const visit = await checkout({ ...base(), customerId: ids.customer, usePackages: true, lines: [corte(), { kind: "SERVICE", serviceId: ids.barba, staffId: ids.staff, quantity: 1 }] });
    assert.equal(Number(visit.total), 120);
    assert.equal((await owned()).usesLeft, 2);

    await voidSale(ids.shop, visit.id);
    assert.equal((await owned()).usesLeft, 3);

    // Sin paquete que cubra, avisa en vez de cobrar completo en silencio
    await rejects(checkout({ ...base(), customerId: ids.customer, usePackages: true, lines: [{ kind: "SERVICE", serviceId: ids.barba, staffId: ids.staff, quantity: 1 }] }), /no tiene un paquete vigente/);
  });
});
