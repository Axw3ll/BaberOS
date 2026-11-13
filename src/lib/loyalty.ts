// Textos y cálculos de lealtad que se usan tanto en el servidor como en el navegador.

export type StampConfig = { stampReward: string; stampRewardValue: number | { toString(): string } };

/** "servicio gratis", "servicio gratis (hasta $200)", "20% de descuento", "$50 de descuento". */
export function stampRewardLabel(shop: StampConfig) {
  const v = Number(shop.stampRewardValue.toString());
  if (shop.stampReward === "PERCENT") return `${v}% de descuento`;
  if (shop.stampReward === "AMOUNT") return `$${v} de descuento`;
  return v > 0 ? `servicio gratis (hasta $${v})` : "servicio gratis";
}

/** Vista previa del descuento del premio en el punto de venta (el servidor lo vuelve a calcular al cobrar). */
export function previewStampDiscount(shop: StampConfig, servicePrices: number[], remaining: number) {
  const v = Number(shop.stampRewardValue.toString());
  let value = 0;
  if (shop.stampReward === "FREE_SERVICE") value = servicePrices.length ? Math.min(Math.max(...servicePrices), v > 0 ? v : Infinity) : 0;
  else if (shop.stampReward === "PERCENT") value = Math.round(remaining * Math.min(v, 100)) / 100;
  else value = v;
  return Math.max(0, Math.min(value, remaining));
}
