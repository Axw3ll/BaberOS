import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { supabaseServer } from "./supabase/server";
import type { Role } from "@/generated/prisma/enums";

const DEV_EMAIL = process.env.NODE_ENV !== "production" ? process.env.DEV_AUTH_EMAIL : undefined;
const DEV_ID = "00000000-0000-4000-8000-000000000001";
export const devAuth = Boolean(DEV_EMAIL);

/** Quién está en sesión, sin tocar la base. getClaims valida el JWT localmente (llaves asimétricas). */
const session = cache(async (): Promise<{ id: string; email: string; name: string } | null> => {
  if (DEV_EMAIL) return { id: DEV_ID, email: DEV_EMAIL, name: "Desarrollo" };
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub || typeof c.email !== "string" || !c.email) return null;
  const meta = (c.user_metadata ?? {}) as { name?: string };
  return { id: c.sub, email: c.email, name: meta.name ?? c.email.split("@")[0] };
});

/** Crea la fila en `users` la primera vez y vincula invitaciones pendientes (staff con su email y sin cuenta). */
async function ensureUser(s: { id: string; email: string; name: string }, exists: boolean, pendingInvite: boolean) {
  const user = exists
    ? await prisma.user.findUniqueOrThrow({ where: { id: s.id } })
    : await prisma.user.upsert({ where: { id: s.id }, update: {}, create: s });
  if (pendingInvite || !exists) {
    await prisma.staff.updateMany({ where: { email: user.email, userId: null }, data: { userId: user.id } });
  }
  return user;
}

/** Usuario actual (fila en `users`), o null. */
export const currentUser = cache(async () => {
  const s = await session();
  if (!s) return null;
  const [user, invite] = await Promise.all([
    prisma.user.findUnique({ where: { id: s.id } }),
    prisma.staff.findFirst({ where: { email: s.email, userId: null }, select: { id: true } }),
  ]);
  if (user && !invite) return user;
  return ensureUser(s, Boolean(user), Boolean(invite));
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export const SHOP_COOKIE = "barberos_shop";

/**
 * Barbería activa + mi perfil de staff en ella.
 * En el caso normal es UNA sola ida a la base: usuario, membresías e invitaciones van en paralelo.
 */
export const currentContext = cache(async () => {
  const s = await session();
  if (!s) redirect("/login");
  const membershipsQuery = () => prisma.staff.findMany({
    where: { userId: s.id, active: true },
    include: { shop: true },
    orderBy: { createdAt: "asc" },
  });
  let [user, invite, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: s.id } }),
    prisma.staff.findFirst({ where: { email: s.email, userId: null }, select: { id: true } }),
    membershipsQuery(),
  ]);
  if (!user || invite) {
    user = await ensureUser(s, Boolean(user), Boolean(invite));
    memberships = await membershipsQuery();
  }
  if (memberships.length === 0) redirect("/onboarding");

  const wanted = (await cookies()).get(SHOP_COOKIE)?.value;
  const me = memberships.find((m) => m.shopId === wanted) ?? memberships[0];
  return { user, me, shop: me.shop, shops: memberships.map((m) => m.shop) };
});

export type Section =
  | "hoy" | "agenda" | "ventas" | "clientes" | "seguimiento" | "campanas" | "reportes"
  | "productos" | "servicios" | "equipo" | "ajustes";

const ACCESS: Record<Role, Section[]> = {
  OWNER: ["hoy", "agenda", "ventas", "clientes", "seguimiento", "campanas", "reportes", "productos", "servicios", "equipo", "ajustes"],
  MANAGER: ["hoy", "agenda", "ventas", "clientes", "seguimiento", "campanas", "reportes", "productos", "servicios", "equipo", "ajustes"],
  RECEPTIONIST: ["hoy", "agenda", "ventas", "clientes", "seguimiento", "campanas", "productos"],
  BARBER: ["hoy", "agenda", "ventas", "clientes", "seguimiento"],
};

export const canAccess = (role: Role, s: Section) => ACCESS[role].includes(s);
export const sectionsFor = (role: Role) => ACCESS[role];

/** Para páginas y server actions: corta si el rol no tiene acceso. */
export async function requireSection(s: Section) {
  const ctx = await currentContext();
  if (!canAccess(ctx.me.role, s)) redirect("/hoy");
  return ctx;
}

/** Un barbero solo ve y toca su propia agenda. */
export const seesOnlyOwnAgenda = (role: Role) => role === "BARBER";

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Dueño",
  MANAGER: "Encargado",
  BARBER: "Barbero",
  RECEPTIONIST: "Recepción",
};
