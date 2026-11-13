"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentContext } from "@/lib/auth";
import { baseUrl } from "@/lib/messages";
import { PLANS, stripe, type PaidPlan } from "@/lib/billing";

async function ownerContext() {
  const ctx = await currentContext();
  if (ctx.me.role !== "OWNER") redirect("/suscripcion");
  return ctx;
}

async function customerId(shop: { id: string; name: string; stripeCustomerId: string | null }, email: string) {
  if (shop.stripeCustomerId) return shop.stripeCustomerId;
  const c = await stripe().customers.create({ email, name: shop.name, metadata: { shopId: shop.id } });
  await prisma.barbershop.update({ where: { id: shop.id }, data: { stripeCustomerId: c.id } });
  return c.id;
}

export async function startCheckout(data: FormData) {
  const { shop, user } = await ownerContext();
  const plan = String(data.get("plan")) as PaidPlan;
  const price = PLANS[plan]?.priceId;
  if (!price) redirect("/suscripcion?error=plan");
  const base = await baseUrl();
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await customerId(shop, user.email),
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    locale: "es-419",
    success_url: `${base}/suscripcion?ok=1`,
    cancel_url: `${base}/suscripcion`,
    metadata: { shopId: shop.id },
    subscription_data: { metadata: { shopId: shop.id } },
  });
  redirect(session.url!);
}

/** Portal de Stripe: cambiar tarjeta, cambiar de plan, ver facturas o cancelar. */
export async function openPortal() {
  const { shop, user } = await ownerContext();
  const session = await stripe().billingPortal.sessions.create({
    customer: await customerId(shop, user.email),
    return_url: `${await baseUrl()}/suscripcion`,
  });
  redirect(session.url);
}
