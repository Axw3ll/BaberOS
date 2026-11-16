// Revisiones de la base de datos (necesitan DATABASE_URL).
import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";

const enabled = Boolean(process.env.DATABASE_URL);

test("todas las tablas tienen RLS activo (la API pública de Supabase no expone datos)", { skip: !enabled && "sin DATABASE_URL" }, async () => {
  const { prisma } = await import("../src/lib/prisma");
  after(() => prisma.$disconnect());
  const open = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity ORDER BY 1`;
  assert.deepEqual(open.map((t) => t.tablename), [], "Agrega ENABLE ROW LEVEL SECURITY a la migración de estas tablas");
});

test("demo: se crea completa y se borra sola al vencer", { skip: !enabled && "sin DATABASE_URL" }, async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { createDemo, cleanupDemos } = await import("../src/lib/demo");
  const { userId, shopId } = await createDemo();
  const shop = await prisma.barbershop.findUniqueOrThrow({ where: { id: shopId } });
  assert.equal(shop.isDemo, true);
  assert.ok((await prisma.appointment.count({ where: { shopId } })) > 50);
  // Recién creada no se borra; con 25 horas sí
  await cleanupDemos();
  assert.ok(await prisma.barbershop.findUnique({ where: { id: shopId } }));
  await prisma.user.update({ where: { id: userId }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
  await cleanupDemos();
  assert.equal(await prisma.barbershop.findUnique({ where: { id: shopId } }), null);
  assert.equal(await prisma.user.findUnique({ where: { id: userId } }), null);
});
