import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { ROLE_PERMS } from "@/lib/permissions";
import { todayLocal } from "@/lib/time";

export const GET = handle(async () => {
  const c = await getCtx();
  if (!c) return json({ authenticated: false }, 401);
  const sub = await prisma.subscription.findUnique({ where: { barbershopId: c.shopId } });
  const barbers = await prisma.barber.findMany({ where: { barbershopId: c.shopId, active: true, ...(c.role === "BARBER" ? { id: c.barberId ?? "-" } : {}) }, orderBy: { name: "asc" } });
  return json({
    authenticated: true,
    member: { id: c.memberId, name: c.memberName, role: c.role, barberId: c.barberId },
    perms: ROLE_PERMS[c.role],
    shop: {
      id: c.shop.id, slug: c.shop.slug, name: c.shop.name, city: c.shop.city, address: c.shop.address, plan: sub?.plan ?? "BASICO", phone: c.shop.phone, timezone: c.shop.timezone, isDemo: c.shop.isDemo,
      openTime: c.shop.openTime, closeTime: c.shop.closeTime, slotMinutes: c.shop.slotMinutes,
      depositEnabled: c.shop.depositEnabled, loyaltyStampsRequired: c.shop.loyaltyStampsRequired, loyaltyDiscountPercent: c.shop.loyaltyDiscountPercent,
      today: todayLocal(c.shop.timezone),
    },
    barbers,
    trial: sub ? { status: sub.status, daysLeft: Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86400_000)) } : null,
  });
});
