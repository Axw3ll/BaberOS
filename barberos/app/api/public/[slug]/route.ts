import { prisma } from "@/lib/db";
import { handle, json, notFound } from "@/lib/http";
import { todayLocal, addDays } from "@/lib/time";
import { computeDeposit } from "@/lib/domain/appointments";

type P = { params: Promise<{ slug: string }> };

/** Información pública para la pantalla de bloqueo y la reserva en línea. Sin datos sensibles. */
export const GET = handle(async (_req: Request, { params }: P) => {
  const { slug } = await params;
  const shop = await prisma.barbershop.findUnique({ where: { slug } });
  if (!shop) throw notFound("Barbería no encontrada");
  const [services, barbers, members] = await Promise.all([
    prisma.service.findMany({ where: { barbershopId: shop.id, active: true }, orderBy: { name: "asc" } }),
    prisma.barber.findMany({ where: { barbershopId: shop.id, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, specialty: true } }),
    prisma.member.findMany({ where: { barbershopId: shop.id, active: true }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, role: true, lockedUntil: true } }),
  ]);
  const today = todayLocal(shop.timezone);
  return json({
    shop: { slug: shop.slug, name: shop.name, city: shop.city, address: shop.address, phone: shop.phone, isDemo: shop.isDemo, openTime: shop.openTime, closeTime: shop.closeTime, workDays: shop.workDays.split(",").map(Number) },
    today, tomorrow: addDays(today, 1),
    services: services.map((s) => ({ id: s.id, name: s.name, description: s.description, price: s.price, durationMin: s.durationMin, deposit: computeDeposit(shop, s.price) })),
    barbers,
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role, locked: !!m.lockedUntil && m.lockedUntil > new Date() })),
    deposit: { enabled: shop.depositEnabled, mode: shop.depositMode, value: shop.depositValue },
  });
});
