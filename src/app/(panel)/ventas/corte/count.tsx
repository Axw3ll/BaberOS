"use client";
import { useState } from "react";
import { money } from "@/lib/format";

/** Calcula en vivo cuánto debería haber en caja y la diferencia con lo contado. */
export function CashCount({ cashSales, cashExpenses = 0 }: { cashSales: number; cashExpenses?: number }) {
  const [opening, setOpening] = useState("");
  // Los gastos registrados como "efectivo de caja" en este turno ya vienen sumados en retiros
  const [withdrawals, setWithdrawals] = useState(cashExpenses > 0 ? String(cashExpenses) : "");
  const [counted, setCounted] = useState("");
  const n = (v: string) => Number(v.replace(/[$,\s]/g, "")) || 0;
  const expected = n(opening) + cashSales - n(withdrawals);
  const diff = counted.trim() === "" ? null : Math.round((n(counted) - expected) * 100) / 100;
  const input = "field tnum";
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="label">Fondo inicial</span><input name="opening" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" className={input} /></label>
        <label><span className="label">Retiros y gastos pagados de caja{cashExpenses > 0 && <span className="text-faint"> (incluye {money(cashExpenses)} de gastos)</span>}</span><input name="withdrawals" inputMode="decimal" value={withdrawals} onChange={(e) => setWithdrawals(e.target.value)} placeholder="0" className={input} /></label>
      </div>
      <dl className="rounded-xl bg-hover p-4 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Fondo + ventas en efectivo − retiros</dt><dd className="tnum">{money(n(opening))} + {money(cashSales)} − {money(n(withdrawals))}</dd></div>
        <div className="mt-1 flex items-baseline justify-between"><dt className="font-medium">Debe haber en caja</dt><dd className="font-display text-xl tnum">{money(expected)}</dd></div>
      </dl>
      <label className="block"><span className="label">Efectivo contado</span>
        <input name="counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} required className={`${input} text-lg`} placeholder="Cuenta billetes y monedas" />
      </label>
      {diff !== null && (
        <p className={`rounded-lg px-3 py-2 text-sm font-medium ${diff === 0 ? "bg-success/10 text-success" : diff > 0 ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"}`}>
          {diff === 0 ? "Cuadra exacto." : diff > 0 ? `Sobran ${money(diff)}.` : `Faltan ${money(-diff)}.`}
        </p>
      )}
    </div>
  );
}
