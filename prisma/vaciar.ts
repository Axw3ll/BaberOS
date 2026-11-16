// Deja la base de datos en blanco para probar el sistema desde cero.
// Borra TODOS los datos (barberías, usuarios, clientes, citas, ventas, demos…) y conserva las tablas y migraciones.
// Uso:  npm run db:vaciar          (pide confirmación)
//       npm run db:vaciar -- --si  (sin preguntar)
// Después, abre la app: empiezas como dueño nuevo en "Registra tu barbería".
// Para volver a tener la barbería de ejemplo: npm run db:seed
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("No se vacía una base de producción.");
  const host = (() => { try { return new URL(process.env.DATABASE_URL!).host; } catch { return "?"; } })();
  const counts = await prisma.$queryRaw<{ shops: number; customers: number; sales: number; users: number }[]>`
    SELECT (SELECT count(*)::int FROM barbershops) AS shops, (SELECT count(*)::int FROM customers) AS customers,
           (SELECT count(*)::int FROM sales) AS sales, (SELECT count(*)::int FROM users) AS users`;
  const c = counts[0];
  console.log(`Base: ${host}`);
  console.log(`Se borrará: ${c.shops} barberías, ${c.customers} clientes, ${c.sales} ventas y ${c.users} usuarios.`);

  if (!process.argv.includes("--si")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Escribe VACIAR para confirmar: ');
    rl.close();
    if (answer.trim() !== "VACIAR") { console.log("Cancelado. No se borró nada."); return; }
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  console.log(`Listo: ${tables.length} tablas en blanco. Abre la app y registra tu barbería desde cero.`);
}

main().finally(() => prisma.$disconnect());
