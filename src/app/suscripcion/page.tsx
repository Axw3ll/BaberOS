import Link from "next/link";
import { Check, ChevronLeft, CreditCard, Crown, Scissors } from "lucide-react";
import { currentContext } from "@/lib/auth";
import { accessFor, billingEnabled, PLANS, type PaidPlan } from "@/lib/billing";
import { dateLabel, toLocalDate } from "@/lib/time";
import { openPortal, startCheckout } from "./actions";

export const metadata = { title: "Suscripción" };

const PRO_NAME: Record<string, string> = { campanas: "Campañas", reportes: "Reportes" };

export default async function SuscripcionPage({ searchParams }: { searchParams: Promise<{ ok?: string; pro?: string; error?: string }> }) {
  const { shop, me } = await currentContext();
  const sp = await searchParams;
  const access = accessFor(shop);
  const owner = me.role === "OWNER";
  const tz = shop.timezone;
  const enabled = billingEnabled();

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
        {sp.ok && <p className="mt-4 rounded-xl bg-success/10 p-4 text-success">¡Gracias! Tu pago se está confirmando; en unos segundos verás tu plan activo.</p>}
        {sp.pro && <p className="mt-4 rounded-xl bg-brand-soft p-4 text-brand"><Crown className="mr-1.5 inline size-4" />{PRO_NAME[sp.pro] ?? "Esta sección"} es parte del plan Pro.</p>}
        <p className={`mt-4 rounded-xl p-4 ${tones[status.tone]}`}>{status.text}</p>

        {!owner ? (
          <p className="mt-6 text-muted">Solo el dueño de la barbería puede cambiar el plan. Avísale si ves este mensaje.</p>
        ) : !enabled ? null : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {(Object.keys(PLANS) as PaidPlan[]).map((k) => {
                const p = PLANS[k];
                const current = access.state === "active" && access.plan === k;
                return (
                  <div key={k} className={`card flex flex-col p-6 ${k === "PRO" ? "border-brand ring-1 ring-brand" : ""}`}>
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-xl">{p.name}</h2>
                      {k === "PRO" && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-on-brand">Recomendado</span>}
                    </div>
                    <p className="mt-3"><span className="font-display text-4xl tnum">${p.price}</span> <span className="text-muted">MXN al mes</span></p>
                    <ul className="mt-5 flex-1 space-y-2 text-sm">
                      {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{f}</li>)}
                    </ul>
                    {current ? (
                      <span className="btn-quiet mt-6 cursor-default">Tu plan actual</span>
                    ) : shop.stripeSubscriptionId && access.state !== "expired" ? (
                      <form action={openPortal} className="mt-6"><button className={k === "PRO" ? "btn-primary w-full" : "btn-quiet w-full"}>Cambiar a {p.name}</button></form>
                    ) : (
                      <form action={startCheckout} className="mt-6">
                        <input type="hidden" name="plan" value={k} />
                        <button disabled={!p.priceId} className={k === "PRO" ? "btn-primary w-full" : "btn-quiet w-full"}>Elegir {p.name}</button>
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
            <p className="mt-6 text-sm text-faint">Pagos seguros con Stripe (tarjeta). Cancela cuando quieras. Precios con IVA incluido.</p>
          </>
        )}
      </div>
    </main>
  );
}
