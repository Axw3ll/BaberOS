import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { buildDemoShop } from "./demo-data";
import { DEMO_EMAIL_DOMAIN, DEMO_HOURS, demoEmail } from "./demo-session";

// ─────────────────────────────────────────────────────────────────────
// Modo demo: cada visitante que toca "Ver demo" recibe su propia barbería de ejemplo (nadie ve los cambios de otro).
// Se borra sola a las 24 h (en la tarea programada de mensajes y cada vez que alguien abre una demo nueva).
// En una barbería de demo no salen WhatsApp automáticos, invitaciones por correo ni cobros (ver `isDemo`).
// ─────────────────────────────────────────────────────────────────────

export const isDemoEmail = (email: string) => email.endsWith(`@${DEMO_EMAIL_DOMAIN}`);

export async function createDemo() {
  await cleanupDemos().catch((e) => console.error("cleanupDemos", e));
  const userId = randomUUID();
  const user = await prisma.user.create({ data: { id: userId, email: demoEmail(userId), name: "Dueño" } });
  const slug = `demo-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const shop = await buildDemoShop(prisma, { owner: { id: user.id, name: user.name, email: user.email }, slug, isDemo: true });
  return { userId, shopId: shop.id };
}

/** Borra las demos vencidas: su usuario y todo lo que haya creado (incluidas otras barberías que abrió desde la demo). */
export async function cleanupDemos(olderThanHours = DEMO_HOURS) {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, createdAt: { lt: new Date(Date.now() - olderThanHours * 3_600_000) } },
    select: { id: true },
    take: 200,
  });
  for (const u of users) {
    const shops = await prisma.barbershop.findMany({ where: { ownerId: u.id }, select: { id: true } });
    for (const { id } of shops) {
      // Lo que no se borra en cascada con la barbería va primero
      await prisma.packageUse.deleteMany({ where: { sale: { shopId: id } } });
      await prisma.customerPackage.deleteMany({ where: { shopId: id } });
      await prisma.sale.deleteMany({ where: { shopId: id } });
      await prisma.appointment.deleteMany({ where: { shopId: id } });
      await prisma.barbershop.delete({ where: { id } });
    }
    await prisma.staff.updateMany({ where: { userId: u.id }, data: { userId: null } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  return users.length;
}
