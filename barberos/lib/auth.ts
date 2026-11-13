import { cookies } from "next/headers";
import { prisma, type Role } from "./db";
import { newToken, sha256, verifyPin } from "./crypto";
import { ApiError, forbidden } from "./http";
import { can, type Perm } from "./permissions";

export const SESSION_COOKIE = "bos_session";
const SESSION_HOURS = 12;
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export type Ctx = {
  memberId: string;
  memberName: string;
  role: Role;
  barberId: string | null;
  shopId: string;
  shop: Awaited<ReturnType<typeof loadShop>>;
};

async function loadShop(id: string) {
  return prisma.barbershop.findUniqueOrThrow({ where: { id } });
}

export async function createSession(memberId: string, shopId: string) {
  const token = newToken();
  await prisma.session.create({
    data: { memberId, barbershopId: shopId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000) },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await prisma.session.deleteMany({ where: { tokenHash: sha256(t) } });
  jar.delete(SESSION_COOKIE);
}

export async function getCtx(): Promise<Ctx | null> {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: sha256(t) }, include: { member: true, barbershop: true } });
  if (!s || s.expiresAt < new Date() || !s.member.active || s.member.barbershopId !== s.barbershopId) return null;
  return {
    memberId: s.member.id, memberName: s.member.name, role: s.member.role, barberId: s.member.barberId,
    shopId: s.barbershopId, shop: s.barbershop,
  };
}

/** Exige sesión válida y, opcionalmente, al menos uno de los permisos indicados. */
export async function requireCtx(...perms: Perm[]): Promise<Ctx> {
  const c = await getCtx();
  if (!c) throw new ApiError(401, "Sesión expirada. Desbloquea con tu PIN.", "UNAUTHENTICATED");
  if (perms.length && !perms.some((p) => can(c.role, p))) throw forbidden();
  return c;
}

/** Login con PIN: bloqueo de 15 min tras 5 intentos fallidos. */
export async function loginWithPin(shopSlug: string, memberId: string, pin: string) {
  const shop = await prisma.barbershop.findUnique({ where: { slug: shopSlug } });
  if (!shop) throw new ApiError(404, "Barbería no encontrada");
  const m = await prisma.member.findFirst({ where: { id: memberId, barbershopId: shop.id, active: true } });
  if (!m) throw new ApiError(404, "Perfil no encontrado");

  const now = new Date();
  if (m.lockedUntil && m.lockedUntil > now) {
    const mins = Math.ceil((m.lockedUntil.getTime() - now.getTime()) / 60000);
    throw new ApiError(423, `Perfil bloqueado por intentos fallidos. Intenta en ${mins} min.`, "LOCKED");
  }
  const ok = await verifyPin(pin, m.pinHash);
  if (!ok) {
    // Incremento atómico para que intentos simultáneos no se pierdan
    const upd = await prisma.member.update({ where: { id: m.id }, data: { failedAttempts: { increment: 1 } } });
    if (upd.failedAttempts >= MAX_ATTEMPTS) {
      await prisma.member.update({ where: { id: m.id }, data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } });
      throw new ApiError(423, `PIN incorrecto. Perfil bloqueado ${LOCK_MINUTES} minutos.`, "LOCKED");
    }
    throw new ApiError(401, `PIN incorrecto. Te quedan ${MAX_ATTEMPTS - upd.failedAttempts} intentos.`, "BAD_PIN");
  }
  await prisma.member.update({ where: { id: m.id }, data: { failedAttempts: 0, lockedUntil: null } });
  await createSession(m.id, shop.id);
  return m;
}
