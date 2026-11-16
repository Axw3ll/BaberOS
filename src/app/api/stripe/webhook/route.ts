import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { planFromPrice, stripe } from "@/lib/billing";

/**
 * Webhook de Stripe. En Stripe → Developers → Webhooks, apunta a /api/stripe/webhook con los eventos
 * checkout.session.completed y customer.subscription.created / updated / deleted.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return new Response("Falta configuración", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return new Response("Firma no válida", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    if (s.mode === "subscription" && typeof s.subscription === "string") {
      await syncSubscription(await stripe().subscriptions.retrieve(s.subscription), s.metadata?.shopId);
    }
  } else if (event.type.startsWith("customer.subscription.")) {
    await syncSubscription(event.data.object as Stripe.Subscription);
  }
  return Response.json({ received: true });
}

async function syncSubscription(sub: Stripe.Subscription, shopIdHint?: string | null) {
  const shopId = shopIdHint ?? sub.metadata?.shopId;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const shop = shopId
    ? await prisma.barbershop.findUnique({ where: { id: shopId } })
    : await prisma.barbershop.findUnique({ where: { stripeCustomerId: customer } });
  if (!shop) return;
  const item = sub.items.data[0];
  // En versiones recientes de la API el fin de periodo vive en cada renglón de la suscripción
  const end = (item as unknown as { current_period_end?: number })?.current_period_end
    ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const plan = planFromPrice(item?.price.id);
  await prisma.barbershop.update({
    where: { id: shop.id },
    data: {
      stripeCustomerId: customer, stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status === "canceled" || sub.cancel_at_period_end ? "canceled" : sub.status,
      currentPeriodEnd: end ? new Date(end * 1000) : null,
      ...(plan && { plan }),
    },
  });
}
