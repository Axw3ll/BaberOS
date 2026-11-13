// Pago en línea con Stripe — "conexión pendiente".
// Si la barbería no tiene llaves configuradas en Ajustes, NO se crea enlace, NO se cobra y NO se marca nada.
// Un pago en línea solo se marca como hecho cuando llega el webhook checkout.session.completed firmado.
import Stripe from "stripe";
import type { Barbershop } from "../db";
import { decrypt } from "../crypto";
import { ApiError } from "../http";

export const STRIPE_NOT_CONNECTED = "Stripe no está conectado para esta barbería. No se generó enlace de pago ni se cobró nada. El dueño puede conectarlo en Ajustes → Pagos en línea.";

export function stripeFor(shop: Barbershop): Stripe | null {
  if (!shop.stripeSecretKeyEnc) return null;
  return new Stripe(decrypt(shop.stripeSecretKeyEnc));
}

export function requireStripe(shop: Barbershop): Stripe {
  const s = stripeFor(shop);
  if (!s) throw new ApiError(409, STRIPE_NOT_CONNECTED, "STRIPE_NOT_CONNECTED");
  return s;
}

// Stripe de la PLATAFORMA (cobra la suscripción de BarberOS a la barbería). Variables STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET.
export const PLATFORM_STRIPE_NOT_CONNECTED = "El cobro de suscripciones con tarjeta aún no está conectado (faltan las llaves de Stripe de la plataforma). Tu cambio de plan quedó guardado, pero no se cobró nada ni se marcó como pagado.";
export function platformStripe(): Stripe {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new ApiError(409, PLATFORM_STRIPE_NOT_CONNECTED, "STRIPE_NOT_CONNECTED");
  return new Stripe(k);
}

export async function createCheckout(stripe: Stripe, shop: Barbershop, opts: {
  amount: number; description: string; kind: "deposit" | "subscription"; refId: string; successPath: string; cancelPath: string;
}) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "mxn",
    line_items: [{ quantity: 1, price_data: { currency: "mxn", unit_amount: opts.amount, product_data: { name: opts.description } } }],
    metadata: { barbershopId: shop.id, kind: opts.kind, refId: opts.refId },
    success_url: base + opts.successPath,
    cancel_url: base + opts.cancelPath,
  });
  return session;
}
