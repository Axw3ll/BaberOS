import "server-only";
import Stripe from "stripe";
import type { Barbershop } from "@/generated/prisma/client";
import type { Plan } from "@/generated/prisma/enums";

// ─────────────────────────────────────────────────────────────────────
// Suscripción a BarberOS
//
// Cada barbería empieza con 14 días de prueba (todo incluido). Después necesita un plan pagado.
// Tres modos:
//  - Con STRIPE_SECRET_KEY: pagan con tarjeta desde /suscripcion (Stripe).
//  - Con COBRO_WHATSAPP (tu número) y sin Stripe: cobro manual. La prueba vence igual; para pagar te escriben
//    por WhatsApp, te transfieren y activas el plan desde /admin (30 días cada vez).
//  - Sin ninguno: el cobro está apagado y todo queda disponible (desarrollo o instalación propia).
// ─────────────────────────────────────────────────────────────────────

export const PLANS = {
  BASIC: {
    name: "Básico", price: 299, priceId: process.env.STRIPE_PRICE_BASIC, staff: 2 as number | null,
    tagline: "Para el barbero independiente o la barbería chica",
    features: ["Agenda y reservas en línea", "Clientes y seguimiento", "Caja, inventario, corte de caja y comisiones", "Hasta 2 personas en el equipo"],
  },
  STANDARD: {
    name: "Estándar", price: 399, priceId: process.env.STRIPE_PRICE_STANDARD, staff: 5 as number | null,
    tagline: "Para la barbería con equipo",
    features: ["Todo lo del Básico", "Recordatorios y confirmaciones, listos para enviar por WhatsApp con un toque", "Tarjeta de sellos o puntos",
      "Calificaciones después de cada visita", "Fila virtual con QR", "Lista de espera", "Paquetes y membresías", "Hasta 5 personas en el equipo"],
  },
  PRO: {
    name: "Completo", price: 599, priceId: process.env.STRIPE_PRICE_PRO, staff: null as number | null,
    tagline: "Para administrar y hacer crecer tu barbería",
    features: ["Todo lo del Estándar", "Reportes", "Gastos y utilidad", "Metas por barbero", "Campañas a grupos de clientes (se envían por WhatsApp con un toque)",
      "Bitácora de cambios", "Equipo sin límite"],
  },
} as const;
export type PaidPlan = keyof typeof PLANS;
export const PLAN_ORDER: PaidPlan[] = ["BASIC", "STANDARD", "PRO"];

/** Funciones que no vienen en todos los planes y el plan mínimo que las incluye. */
export const FEATURES = {
  mensajes: { plan: "STANDARD", label: "los recordatorios y mensajes automáticos" },
  lealtad: { plan: "STANDARD", label: "la tarjeta de sellos o puntos" },
  fila: { plan: "STANDARD", label: "la fila virtual" },
  espera: { plan: "STANDARD", label: "la lista de espera" },
  paquetes: { plan: "STANDARD", label: "paquetes y membresías" },
  reportes: { plan: "PRO", label: "los reportes" },
  gastos: { plan: "PRO", label: "gastos y utilidad" },
  metas: { plan: "PRO", label: "las metas por barbero" },
  campanas: { plan: "PRO", label: "las campañas" },
  bitacora: { plan: "PRO", label: "la bitácora" },
} as const satisfies Record<string, { plan: PaidPlan; label: string }>;
export type Feature = keyof typeof FEATURES;
const RANK: Record<Plan, number> = { TRIAL: 0, BASIC: 1, STANDARD: 2, PRO: 3 };

export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);
/** Tu WhatsApp para cobro manual (10 dígitos), si no usas Stripe. */
export const manualBillingPhone = () => (stripeEnabled() ? null : (process.env.COBRO_WHATSAPP ?? "").replace(/\D/g, "") || null);
/** ¿Se cobra la suscripción? (con Stripe o a mano). Si no, todo es gratis. */
export const billingEnabled = () => stripeEnabled() || manualBillingPhone() !== null;

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
/** ¿Su plan incluye esta función? Durante la prueba y con el cobro apagado se puede todo. */
export function hasFeature(a: Access, f: Feature) {
  if (a.state === "free" || a.state === "trial") return true;
  return RANK[a.plan] >= RANK[FEATURES[f].plan];
}
/** Programa de lealtad que de verdad aplica: si su plan no lo incluye, está apagado (sin borrar lo que ya tenían). */
export function loyaltyModeOf(shop: Pick<Barbershop, "loyaltyMode" | "plan" | "trialEndsAt" | "subscriptionStatus" | "currentPeriodEnd">) {
  return hasFeature(accessFor(shop), "lealtad") ? shop.loyaltyMode : "OFF";
}

/** Personas activas que permite su plan (null = sin límite). */
export function staffLimit(a: Access): number | null {
  if (a.state === "free" || a.state === "trial") return null;
  return PLANS[a.plan as PaidPlan]?.staff ?? null;
}

export function planFromPrice(priceId: string | undefined | null): Plan | null {
  if (!priceId) return null;
  if (priceId === PLANS.PRO.priceId) return "PRO";
  if (priceId === PLANS.STANDARD.priceId) return "STANDARD";
  if (priceId === PLANS.BASIC.priceId) return "BASIC";
  return null;
}
