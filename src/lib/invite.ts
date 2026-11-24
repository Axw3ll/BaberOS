import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Invitación al equipo con un enlace propio (/unirse/<token>).
 * No depende de que llegue un correo: el dueño puede mandarlo por WhatsApp o copiarlo,
 * y el enlace sigue sirviendo aunque se reenvíe el correo o el correo llegue tarde.
 */
export const newInviteToken = () => randomBytes(24).toString("base64url");

/** Token de invitación del miembro (lo crea si no tiene). */
export async function inviteTokenFor(staffId: string, current: string | null) {
  if (current) return current;
  const token = newInviteToken();
  await prisma.staff.update({ where: { id: staffId }, data: { inviteToken: token } });
  return token;
}

export const findInvite = (token: string) =>
  token.length < 20 || token.length > 64 ? Promise.resolve(null) : prisma.staff.findFirst({
    where: { inviteToken: token, userId: null, active: true, email: { not: null }, shop: { isDemo: false } },
    include: { shop: { select: { name: true } } },
  });

type AuthRow = { id: string; has_password: boolean };

/**
 * Crea la cuenta de quien abrió su enlace de invitación, o le pone contraseña si ya existe una cuenta
 * sin contraseña (la que crea el correo de invitación de Supabase). Nunca toca una cuenta que ya tiene contraseña.
 */
export async function createInvitedAccount(email: string, name: string, password: string):
  Promise<{ ok: true } | { error: string; hasAccount?: boolean }> {
  const admin = supabaseAdmin();
  if (!admin) return { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  const [existing] = await prisma.$queryRaw<AuthRow[]>`
    SELECT id::text, coalesce(encrypted_password, '') <> '' AS has_password
    FROM auth.users WHERE lower(email) = ${email.toLowerCase()} LIMIT 1`;
  if (existing?.has_password) return { error: "Ya tienes cuenta con este correo. Entra con tu contraseña.", hasAccount: true };

  const { error } = existing
    ? await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { name } })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error) {
    console.error("[invitación] no se pudo crear la cuenta:", error.message);
    if (/password/i.test(error.message)) return { error: "Elige una contraseña más segura (mínimo 8 caracteres, mezcla letras y números)." };
    return { error: "No se pudo crear la cuenta. Intenta de nuevo en un momento." };
  }
  return { ok: true };
}
