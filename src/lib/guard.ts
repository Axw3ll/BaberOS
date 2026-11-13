import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";

/** IP del visitante (detrás de Vercel o de un proxy llega en x-forwarded-for). */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

/**
 * Cuenta un intento y dice si todavía está dentro del límite.
 * Vive en Postgres: no necesita Redis ni otro servicio, y funciona con varias instancias.
 */
export async function allow(key: string, limit: number, windowSeconds: number) {
  const [row] = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count     = CASE WHEN rate_limits."resetAt" < now() THEN 1 ELSE rate_limits.count + 1 END,
      "resetAt" = CASE WHEN rate_limits."resetAt" < now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE rate_limits."resetAt" END
    RETURNING count`;
  // De vez en cuando, limpia contadores viejos
  if (Math.random() < 0.01) await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 86_400_000) } } });
  return row.count <= limit;
}

/** Cloudflare Turnstile (captcha invisible). Si no hay llaves configuradas, no se exige. */
export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

export async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    return Boolean(((await r.json()) as { success?: boolean }).success);
  } catch {
    return false;
  }
}
