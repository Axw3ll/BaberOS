import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";
import { PLAN_PRICES } from "@/lib/money";

export const GET = handle(async () => {
  const c = await requireCtx("plans");
  const s = await prisma.subscription.findUniqueOrThrow({ where: { barbershopId: c.shopId } });
  const now = Date.now();
  return json({
    subscription: s,
    trialDaysLeft: s.status === "TRIALING" ? Math.max(0, Math.ceil((s.trialEndsAt.getTime() - now) / 86400_000)) : 0,
    trialExpired: s.status === "TRIALING" && s.trialEndsAt.getTime() < now,
    paid: !!s.lastPaidAt && !!s.currentPeriodEnd && s.currentPeriodEnd.getTime() > now,
    plans: Object.entries(PLAN_PRICES).map(([id, price]) => ({ id, price })),
    platformStripeConnected: !!process.env.STRIPE_SECRET_KEY,
  });
});

const Schema = z.object({ plan: z.enum(["BASICO", "PRO", "PREMIUM"]) });

/** Cambio de plan: se guarda la elección. NO marca ningún pago como hecho (eso solo lo hace el webhook de Stripe). */
export const POST = handle(async (req: Request) => {
  const c = await requireCtx("plans");
  const { plan } = Schema.parse(await body(req));
  const s = await prisma.subscription.update({ where: { barbershopId: c.shopId }, data: { plan } });
  return json({ subscription: s });
});
