import "server-only";
import Stripe from "stripe";
import type { Barbershop } from "@/generated/prisma/client";
import type { Plan } from "@/generated/prisma/enums";

// ─────────────────────────────────────────────────────────────────────
// Suscripción a BarberOS
//
// Cada barbería empieza con 14 días de prueba (todo incluido). Después necesita un plan pagado.
// Sin STRIPE_SECRET_KEY el cobro está apagado y todo queda disponible (desarrollo o instalación propia).
// También se puede activar a mano desde /admin (por ejemplo, si te pagan por transferencia).
// ─────────────────────────────────────────────────────────────────────

export const PLANS = {
  BASIC: {
    name: "Básico", price: 299, priceId: process.env.STRIPE_PRICE_BASIC,
    features: ["Agenda y reservas en línea", "Clientes, etiquetas y seguimiento", "Tarjeta de sellos o puntos", "Ventas, inventario y corte de caja", "Recordatorios y confirmaciones", "Hasta 3 personas en el equipo"],
  },
  PRO: {
    name: "Pro", price: 599, priceId: process.env.STRIPE_PRICE_PRO,
    features: ["Todo lo del Básico", "Campañas por WhatsApp", "Reportes y comisiones por periodo", "Equipo sin límite"],
  },
} as const;
export type PaidPlan = keyof typeof PLANS;

/** Secciones que solo incluye el plan Pro (durante la prueba se puede usar todo). */
export const PRO_SECTIONS = ["campanas", "reportes"] as const;
export const BASIC_STAFF_LIMIT = 3;

export const billingEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

let client: Stripe | null = null;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Falta STRIPE_SECRET_KEY");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export type Access = { state: "free" | "trial" | "active" | "past_due" | "expired"; plan: Plan; daysLeft: number | null };

/** ¿Puede usar el panel? "past_due" sigue funcionando unos días mientras se arregla el pago. */
export function accessFor(shop: Pick<Barbershop, "plan" | "trialEndsAt" | "subscriptionStatus" | "currentPeriodEnd">): Access {
  const now = Date.now();
  const days = (d: Date) => Math.max(0, Math.ceil((d.getTime() - now) / 86_400_000));
  if (!billingEnabled()) return { state: "free", plan: shop.plan, daysLeft: null };

  const status = shop.subscriptionStatus;
  const periodOk = shop.currentPeriodEnd && shop.currentPeriodEnd.getTime() > now;
  if (status === "active" || status === "trialing" || (status === "manual" && periodOk) || (status === "canceled" && periodOk)) {
    return { state: "active", plan: shop.plan, daysLeft: shop.currentPeriodEnd ? days(shop.currentPeriodEnd) : null };
  }
  // Pago fallido: 7 días de gracia desde que terminó el periodo pagado
  if (status === "past_due" && shop.currentPeriodEnd && shop.currentPeriodEnd.getTime() + 7 * 86_400_000 > now) {
    return { state: "past_due", plan: shop.plan, daysLeft: days(new Date(shop.currentPeriodEnd.getTime() + 7 * 86_400_000)) };
  }
  if (shop.trialEndsAt.getTime() > now) return { state: "trial", plan: "TRIAL", daysLeft: days(shop.trialEndsAt) };
  return { state: "expired", plan: shop.plan, daysLeft: 0 };
}

export const canUsePanel = (a: Access) => a.state !== "expired";
/** Durante la prueba y sin cobro se puede todo; con plan Básico, las secciones Pro piden mejorar el plan. */
export const hasPro = (a: Access) => a.state === "free" || a.state === "trial" || a.plan === "PRO";

export function planFromPrice(priceId: string | undefined | null): Plan | null {
  if (!priceId) return null;
  if (priceId === PLANS.PRO.priceId) return "PRO";
  if (priceId === PLANS.BASIC.priceId) return "BASIC";
  return null;
}
