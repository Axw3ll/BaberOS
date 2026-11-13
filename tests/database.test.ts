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
