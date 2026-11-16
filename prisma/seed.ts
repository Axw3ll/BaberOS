// Datos de demostración para desarrollo: "Barbería El Filo" (/b/el-filo) con equipo, servicios, productos, clientes
// con meses de historial, citas, ventas, lealtad, paquetes, calificaciones, gastos, fila y lista de espera.
// Uso:  SEED_OWNER_EMAIL=tu@email.com npm run db:seed
// Con Supabase Auth: entra una vez a la app con ese email antes de correrlo, para que exista tu usuario.
// Son los mismos datos que ve quien toca "Ver demo" (src/lib/demo-data.ts).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildDemoShop } from "../src/lib/demo-data";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const email = (process.env.SEED_OWNER_EMAIL ?? process.env.DEV_AUTH_EMAIL ?? "").toLowerCase();
  if (!email) throw new Error("Define SEED_OWNER_EMAIL");
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({ data: { id: "00000000-0000-4000-8000-000000000001", email, name: "Dueño" } }));

  const slug = "el-filo";
  // Lo que no se borra en cascada con la barbería va primero
  const old = await prisma.barbershop.findUnique({ where: { slug } });
  if (old) {
    await prisma.packageUse.deleteMany({ where: { sale: { shopId: old.id } } });
    await prisma.customerPackage.deleteMany({ where: { shopId: old.id } });
    await prisma.sale.deleteMany({ where: { shopId: old.id } });
    await prisma.appointment.deleteMany({ where: { shopId: old.id } });
    await prisma.barbershop.delete({ where: { id: old.id } });
  }

  const t = Date.now();
  const shop = await buildDemoShop(prisma, { owner: { id: user.id, name: user.name, email: user.email }, slug, isDemo: false });
  console.log(`Listo en ${((Date.now() - t) / 1000).toFixed(1)} s: ${shop.name} (/b/${shop.slug}) para ${email}`);
}

main().finally(() => prisma.$disconnect());
