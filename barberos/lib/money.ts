// Montos en centavos (Int). Conversión y formato MXN.
export function mxn(cents: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100);
}
export function toCents(pesos: number | string) {
  const n = typeof pesos === "string" ? Number(pesos.replace(/[^\d.]/g, "")) : pesos;
  if (!Number.isFinite(n) || n < 0) throw new Error("Monto inválido");
  return Math.round(n * 100);
}
export const PLAN_PRICES = { BASICO: 29900, PRO: 49900, PREMIUM: 89900 } as const;
export const PLAN_NAMES = { BASICO: "Básico", PRO: "Pro", PREMIUM: "Premium" } as const;
export const METHOD_NAMES = { CASH: "Efectivo", TRANSFER: "Transferencia", CARD: "Tarjeta" } as const;
