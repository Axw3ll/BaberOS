import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { PLAN_NAMES, PLAN_PRICES } from "@/lib/money";
import { createCheckout, platformStripe } from "@/lib/domain/stripe";

/** Pagar la suscripción con tarjeta. Sin llaves de Stripe de la plataforma responde 409 y no cobra nada. */
export const POST = handle(async () => {
  const c = await requireCtx("plans");
  const s = await prisma.subscription.findUniqueOrThrow({ where: { barbershopId: c.shopId } });
  const stripe = platformStripe();
  const session = await createCheckout(stripe, c.shop, {
    amount: PLAN_PRICES[s.plan], description: `BarberOS ${PLAN_NAMES[s.plan]} — 1 mes`, kind: "subscription", refId: s.id,
    successPath: `/${c.shop.slug}?plan=ok`, cancelPath: `/${c.shop.slug}`,
  });
  await prisma.subscription.update({ where: { id: s.id }, data: { stripeSessionId: session.id } });
  return json({ url: session.url });
});
