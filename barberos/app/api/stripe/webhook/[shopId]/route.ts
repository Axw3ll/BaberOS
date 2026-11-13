import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { json } from "@/lib/http";

type P = { params: Promise<{ shopId: string }> };

/**
 * Webhook de Stripe de CADA barbería (anticipos con tarjeta).
 * Es el ÚNICO lugar donde un anticipo pagado en línea pasa a PAID: solo con firma válida
 * y evento checkout.session.completed con payment_status = paid.
 */
export async function POST(req: Request, { params }: P) {
  const { shopId } = await params;
  const shop = await prisma.barbershop.findUnique({ where: { id: shopId } });
  if (!shop?.stripeWebhookSecretEnc) return json({ error: "Stripe no conectado" }, 400);
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, sig, decrypt(shop.stripeWebhookSecretEnc));
  } catch {
    return json({ error: "Firma inválida" }, 400);
  }
  // Idempotencia
  const seen = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (seen) return json({ received: true, duplicate: true });

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status === "paid" && s.metadata?.kind === "deposit" && s.metadata.barbershopId === shop.id) {
      const dep = await prisma.deposit.findFirst({ where: { id: s.metadata.refId, barbershopId: shop.id } });
      if (dep && s.amount_total === dep.amount) {
        await prisma.deposit.updateMany({ where: { id: dep.id, status: "PENDING" }, data: { status: "PAID", method: "CARD", paidAt: new Date(), stripeSessionId: s.id } });
      }
    }
  }
  await prisma.stripeEvent.create({ data: { id: event.id, barbershopId: shop.id, type: event.type } });
  return json({ received: true });
}
