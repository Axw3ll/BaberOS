// Validación de campos, igual en el navegador y en el servidor.
// Cada función devuelve { value } o { error } con un mensaje para mostrar tal cual.
// Regla general: nunca se "corrige" en silencio un dato inválido; se avisa.

export type Check<T> = { value: T; error?: undefined } | { error: string; value?: undefined };

/** Tope de dinero por campo (Decimal(10,2) aguanta más, pero nada real en una barbería pasa de esto). */
export const MAX_MONEY = 1_000_000;

const raw = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

/** Pesos: acepta "1,250.50", "$300", "300". Rechaza negativos, letras y más de 2 decimales. */
export function money(v: unknown, label: string, o: { required?: boolean; min?: number; max?: number; allowZero?: boolean } = {}): Check<number | null> {
  const s = raw(v).replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (!s) return o.required ? { error: `Escribe ${label}.` } : { value: null };
  if (s.startsWith("-")) return { error: `${cap(label)} no puede ser un número negativo.` };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: `${cap(label)} no es un monto válido (usa números, por ejemplo 250 o 250.50).` };
  const n = Number(s);
  const min = o.min ?? 0, max = o.max ?? MAX_MONEY;
  if (n === 0 && o.allowZero === false) return { error: `${cap(label)} debe ser mayor a 0.` };
  if (n < min) return { error: `${cap(label)} debe ser al menos $${min.toLocaleString("es-MX")}.` };
  if (n > max) return { error: `${cap(label)} no puede pasar de $${max.toLocaleString("es-MX")}.` };
  return { value: n };
}

/** Enteros (piezas, minutos, días). */
export function int(v: unknown, label: string, o: { required?: boolean; min?: number; max?: number } = {}): Check<number | null> {
  const s = raw(v).replace(/,/g, "");
  if (!s) return o.required ? { error: `Escribe ${label}.` } : { value: null };
  if (!/^-?\d+$/.test(s)) return { error: `${cap(label)} debe ser un número entero.` };
  const n = Number(s);
  if (o.min !== undefined && n < o.min) return { error: o.min === 0 ? `${cap(label)} no puede ser un número negativo.` : `${cap(label)} debe ser al menos ${o.min}.` };
  if (o.max !== undefined && n > o.max) return { error: `${cap(label)} no puede pasar de ${o.max.toLocaleString("es-MX")}.` };
  return { value: n };
}

/** Porcentaje 0–100 (acepta "40" o "40%"). Devuelve la fracción (0.4). */
export function percent(v: unknown, label: string): Check<number> {
  const s = raw(v).replace("%", "");
  if (!s) return { error: `Escribe ${label}.` };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: `${cap(label)} debe ser un número entre 0 y 100.` };
  const n = Number(s);
  if (n > 100) return { error: `${cap(label)} no puede pasar de 100%.` };
  return { value: n / 100 };
}

/** Texto con largo máximo. */
export function text(v: unknown, label: string, o: { required?: boolean; max?: number } = {}): Check<string | null> {
  const s = raw(v).replace(/\s+/g, " ");
  if (!s) return o.required ? { error: `Escribe ${label}.` } : { value: null };
  if (s.length > (o.max ?? 120)) return { error: `${cap(label)} es demasiado largo (máximo ${o.max ?? 120} caracteres).` };
  return { value: s };
}

/** Texto largo (notas): respeta saltos de línea. */
export function longText(v: unknown, label: string, max = 1000): Check<string | null> {
  const s = raw(v);
  if (!s) return { value: null };
  if (s.length > max) return { error: `${cap(label)} es demasiado larga (máximo ${max} caracteres).` };
  return { value: s };
}

/** Teléfono de México: 10 dígitos (acepta espacios, guiones, +52 y 521). */
export function phone(v: unknown, o: { required?: boolean } = {}): Check<string | null> {
  let d = raw(v).replace(/\D/g, "");
  if (!d) return o.required ? { error: "Escribe el teléfono." } : { value: null };
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  if (d.length !== 10) return { error: "El teléfono debe tener 10 dígitos." };
  return { value: d };
}

export function email(v: unknown, o: { required?: boolean } = {}): Check<string | null> {
  const s = raw(v).toLowerCase();
  if (!s) return o.required ? { error: "Escribe el correo." } : { value: null };
  if (s.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return { error: "El correo no es válido." };
  return { value: s };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Junta varias validaciones: devuelve el primer error o los valores. */
export function first(...checks: Check<unknown>[]) {
  return checks.find((c) => c.error)?.error ?? null;
}
