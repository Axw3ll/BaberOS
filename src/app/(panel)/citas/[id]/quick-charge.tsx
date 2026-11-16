"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Banknote, CreditCard, Landmark } from "lucide-react";
import { money } from "@/lib/format";
import { money as parseMoney } from "@/lib/validate";
import { quickCharge } from "../../ventas/actions";

function Confirm({ children, disabled, className, method }: { children: React.ReactNode; disabled?: boolean; className: string; method: string }) {
  const { pending } = useFormStatus();
  return <button name="method" value={method} disabled={disabled || pending} className={className}>{pending ? "Cobrando…" : children}</button>;
}

/** Cobro rápido desde la cita. En efectivo pide cuánto entregó el cliente y calcula el cambio. */
export function QuickCharge({ appointmentId, total }: { appointmentId: string; total: number }) {
  const [state, run] = useActionState(quickCharge, undefined);
  const [cash, setCash] = useState(false);
  const [received, setReceived] = useState("");
  const r = parseMoney(received, "lo recibido");
  const value = r.value ?? null;
  const short = value !== null && value < total;
  const change = value !== null && value >= total ? Math.round((value - total) * 100) / 100 : null;
  // Billetes típicos por encima del total
  const bills = [...new Set([total, ...[100, 200, 500, 1000].map((b) => Math.ceil(total / b) * b)])].filter((b) => b >= total).sort((a, b) => a - b).slice(0, 4);

  return (
    <form action={run}>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {!cash ? (
        <>
          <button type="button" onClick={() => setCash(true)} className="btn-primary w-full py-2.5"><Banknote className="size-4" />Cobrar {money(total, true)} en efectivo</button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Confirm method="CARD" className="btn-quiet"><CreditCard className="size-4" />Tarjeta</Confirm>
            <Confirm method="TRANSFER" className="btn-quiet"><Landmark className="size-4" />Transferencia</Confirm>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="label">¿Cuánto te dio? <span className="text-faint">(total {money(total)})</span></span>
            <input name="received" value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" autoFocus
              placeholder={String(total)} className="field text-lg tnum" aria-invalid={short || Boolean(r.error)} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {bills.map((b) => (
              <button key={b} type="button" onClick={() => setReceived(String(b))}
                className={`rounded-lg border px-2.5 py-1 text-sm tnum ${value === b ? "border-brand bg-brand text-on-brand" : "border-line bg-surface hover:border-brand"}`}>
                {b === total ? "Exacto" : money(b, true)}
              </button>
            ))}
          </div>
          {r.error && received && <p className="text-sm text-danger">{r.error}</p>}
          {short && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Faltan {money(total - value!)}.</p>}
          {change !== null && (
            <p className="flex items-baseline justify-between rounded-lg bg-success/10 px-3 py-2 text-success">
              <span className="text-sm font-medium">Cambio</span><span className="font-display text-xl tnum">{money(change)}</span>
            </p>
          )}
          <div className="flex gap-2">
            <Confirm method="CASH" disabled={value === null || short} className="btn-primary flex-1 py-2.5">Confirmar cobro</Confirm>
            <button type="button" onClick={() => { setCash(false); setReceived(""); }} className="btn-ghost">Cancelar</button>
          </div>
        </div>
      )}
      {state?.error && <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
