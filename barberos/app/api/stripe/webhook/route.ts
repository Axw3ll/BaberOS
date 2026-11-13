import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { PLAN_PRICES } from "@/lib/money";

/** Webhook de la PLATAFORMA (suscripciones). Único lugar donde una suscripción queda pagada. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json({ error: "Stripe de la plataforma no conectado" }, 400);
  const raw = await req.text();
  let event: Stripe.Event;
  try { event = Stripe.webhooks.constructEvent(raw, req.headers.get("stripe-signature") ?? "", secret); }
  catch { return json({ error: "Firma inválida" }, 400); }
  if (await prisma.stripeEvent.findUnique({ where: { id: event.id } })) return json({ received: true, duplicate: true });

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status === "paid" && s.metadata?.kind === "subscription") {
      const sub = await prisma.subscription.findFirst({ where: { id: s.metadata.refId, barbershopId: s.metadata.barbershopId } });
      if (sub && s.amount_total === PLAN_PRICES[sub.plan]) {
        const base = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
        const end = new Date(base); end.setMonth(end.getMonth() + 1);
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", lastPaidAt: new Date(), currentPeriodEnd: end } });
      }
    }
  }
  await prisma.stripeEvent.create({ data: { id: event.id, barbershopId: (event.data.object as { metadata?: { barbershopId?: string } }).metadata?.barbershopId ?? "-", type: event.type } });
  return json({ received: true });
}
