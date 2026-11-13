type Num = number | string | { toString(): string };

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
const mxn0 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** $1,250.00 — o $1,250 si es entero y `compact` */
export function money(v: Num, compact = false) {
  const n = Number(v.toString());
  return compact && Number.isInteger(n) ? mxn0.format(n) : mxn.format(n);
}

export const pct = (v: Num) => `${Math.round(Number(v.toString()) * 100)}%`;

export function minutesLabel(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "barberia";
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}
