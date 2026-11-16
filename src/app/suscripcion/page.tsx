import Link from "next/link";
import { Check, ChevronLeft, CreditCard, Crown, MessageCircle, Scissors } from "lucide-react";
import { currentContext } from "@/lib/auth";
import { accessFor, billingEnabled, FEATURES, manualBillingPhone, PLAN_ORDER, PLANS, type Feature, type PaidPlan } from "@/lib/billing";
import { whatsappUrl } from "@/lib/crm";
import { dateLabel, toLocalDate } from "@/lib/time";
import { openPortal, startCheckout } from "./actions";

export const metadata = { title: "Suscripción" };


export default async function SuscripcionPage({ searchParams }: { searchParams: Promise<{ ok?: string; pro?: string; error?: string }> }) {
  const { shop, me, user } = await currentContext();
  const sp = await searchParams;
  const access = accessFor(shop);
  const owner = me.role === "OWNER";
  const tz = shop.timezone;
  const enabled = billingEnabled();
  // Cobro manual (sin Stripe): el botón abre WhatsApp contigo con el mensaje listo
  const manualPhone = manualBillingPhone();
  const askToPay = (plan: string) => whatsappUrl(manualPhone ?? "",
    `Hola, quiero activar el plan ${plan} de BarberOS para "${shop.name}" (${shop.slug}). Mi correo es ${user.email}. ¿Me pasas los datos para transferir?`);

  const status =
    access.state === "free" ? { tone: "success", text: "Cobro desactivado: todas las funciones disponibles." }
    : access.state === "trial" ? { tone: "brand", text: `Prueba gratis: te quedan ${access.daysLeft} ${access.daysLeft === 1 ? "día" : "días"} (hasta el ${dateLabel(toLocalDate(shop.trialEndsAt, tz), { day: "numeric", month: "long" })}).` }
    : access.state === "active" ? { tone: "success", text: `Plan ${PLANS[access.plan as PaidPlan]?.name ?? access.plan} activo${shop.currentPeriodEnd ? `. Siguiente cobro o vencimiento: ${dateLabel(toLocalDate(shop.currentPeriodEnd, tz), { day: "numeric", month: "long" })}` : ""}.` }
    : access.state === "past_due" ? { tone: "warning", text: `No pudimos cobrar tu tarjeta. Actualízala en los próximos ${access.daysLeft} días para no perder el acceso.` }
    : { tone: "danger", text: "Tu prueba o tu plan terminó. Elige un plan para seguir usando BarberOS; tus datos están a salvo." };
  const tones: Record<string, string> = { brand: "bg-brand-soft text-brand", success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning", danger: "bg-danger/10 text-danger" };

  return (
    <main className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand"><Scissors className="size-5" /></span>
            <span className="font-display text-lg">BarberOS</span>
          </span>
          {access.state !== "expired" && <Link href="/hoy" className="btn-ghost"><ChevronLeft className="size-4" />Volver al panel</Link>}
        </div>

        <h1 className="font-display text-3xl">Suscripción de {shop.name}</h1>
        {shop.isDemo && <p className="mt-4 rounded-xl bg-brand-soft p-4 text-brand">Esta es una demostración: aquí no se cobra nada. Así se ven los planes que elegirías al crear tu barbería.</p>}
        {sp.ok && <p className="mt-4 rounded-xl bg-success/10 p-4 text-success">¡Gracias! Tu pago se está confirmando; en unos segundos verás tu plan activo.</p>}
        {sp.pro && sp.pro in FEATURES && (
          <p className="mt-4 rounded-xl bg-brand-soft p-4 text-brand">
            <Crown className="mr-1.5 inline size-4" />Para usar {FEATURES[sp.pro as Feature].label} necesitas el plan {PLANS[FEATURES[sp.pro as Feature].plan].name}{FEATURES[sp.pro as Feature].plan !== "PRO" && " o uno mayor"}.
          </p>
        )}
        <p className={`mt-4 rounded-xl p-4 ${tones[status.tone]}`}>{status.text}</p>

        {!owner ? (
          <p className="mt-6 text-muted">Solo el dueño de la barbería puede cambiar el plan. Avísale si ves este mensaje.</p>
        ) : !enabled ? null : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {PLAN_ORDER.map((k) => {
                const p = PLANS[k];
                const current = access.state === "active" && access.plan === k;
                return (
                  <div key={k} className={`card flex flex-col p-6 ${k === "STANDARD" ? "border-brand ring-1 ring-brand" : ""}`}>
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-xl">{p.name}</h2>
                      {k === "STANDARD" && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-on-brand">El más elegido</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                    <p className="mt-3"><span className="font-display text-4xl tnum">${p.price}</span> <span className="text-muted">MXN al mes</span></p>
                    <ul className="mt-5 flex-1 space-y-2 text-sm">
                      {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{f}</li>)}
                    </ul>
                    {current ? (
                      <span className="btn-quiet mt-6 cursor-default">Tu plan actual</span>
                    ) : manualPhone ? (
                      <a href={askToPay(p.name)} target="_blank" rel="noopener" className={`${k === "STANDARD" ? "btn-primary" : "btn-quiet"} mt-6 w-full`}>
                        <MessageCircle className="size-4" />Pagar {p.name} por transferencia
                      </a>
                    ) : shop.stripeSubscriptionId && access.state !== "expired" ? (
                      <form action={openPortal} className="mt-6"><button className={k === "STANDARD" ? "btn-primary w-full" : "btn-quiet w-full"}>Cambiar a {p.name}</button></form>
                    ) : (
                      <form action={startCheckout} className="mt-6">
                        <input type="hidden" name="plan" value={k} />
                        <button disabled={!p.priceId} className={k === "STANDARD" ? "btn-primary w-full" : "btn-quiet w-full"}>Elegir {p.name}</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
            {shop.stripeCustomerId && (
              <form action={openPortal} className="mt-6">
                <button className="btn-ghost"><CreditCard className="size-4" />Cambiar tarjeta, ver facturas o cancelar</button>
              </form>
            )}
            <p className="mt-6 text-sm text-faint">
              {manualPhone
                ? "Pago por transferencia o depósito: te mandamos los datos por WhatsApp y en cuanto se refleje activamos tu plan por 30 días. Precios con IVA incluido."
                : "Pagos seguros con Stripe (tarjeta). Cancela cuando quieras. Precios con IVA incluido."}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
