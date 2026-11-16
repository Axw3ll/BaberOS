// Sesión de demostración: una cookie firmada con el id del usuario de demo y su vencimiento.
// La usan proxy.ts (para dejar pasar al panel) y lib/auth.ts (para saber quién es). Sin base de datos ni "server-only".
//
// En producción necesita DEMO_SECRET (una cadena larga al azar). Sin ella, el botón "Ver demo" no aparece.

export const DEMO_COOKIE = "barberos_demo";
export const DEMO_HOURS = 24;
export const DEMO_EMAIL_DOMAIN = "demo.barberos.local";

function secret() {
  const s = process.env.DEMO_SECRET;
  if (s && s.length >= 16) return s;
  return process.env.NODE_ENV !== "production" ? "barberos-demo-desarrollo" : null;
}

export const demoEnabled = () => secret() !== null;
export const demoEmail = (userId: string) => `demo-${userId}@${DEMO_EMAIL_DOMAIN}`;

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valor de la cookie: "<userId>.<vence en ms>.<firma>" */
export async function signDemo(userId: string) {
  const exp = Date.now() + DEMO_HOURS * 3_600_000;
  return `${userId}.${exp}.${await hmac(`${userId}.${exp}`)}`;
}

/** Id del usuario de demo si la cookie es válida y no ha vencido; si no, null. */
export async function verifyDemo(value: string | undefined | null) {
  if (!value || !secret()) return null;
  const [userId, exp, sig] = value.split(".");
  if (!/^[0-9a-f-]{36}$/.test(userId ?? "") || !/^\d+$/.test(exp ?? "") || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const expected = await hmac(`${userId}.${exp}`);
  // Comparación sin atajos (mismo tiempo sin importar dónde difiera)
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? userId : null;
}
