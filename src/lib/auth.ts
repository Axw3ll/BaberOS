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

/** Usuario actual (fila en `users`), o null. Crea la fila la primera vez. */
export const currentUser = cache(async () => {
  let id: string, email: string, name: string;

  if (DEV_EMAIL) {
    id = DEV_ID; email = DEV_EMAIL; name = "Desarrollo";
  } else {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    if (!data.user?.email) return null;
    id = data.user.id; email = data.user.email;
    name = (data.user.user_metadata?.name as string | undefined) ?? email.split("@")[0];
  }

  const user = await prisma.user.upsert({ where: { id }, update: {}, create: { id, email, name } });

  // Invitaciones: staff creado con este email y aún sin cuenta
  await prisma.staff.updateMany({ where: { email: user.email, userId: null }, data: { userId: user.id } });
  return user;
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export const SHOP_COOKIE = "barberos_shop";

/** Barbería activa + mi perfil de staff en ella. */
export const currentContext = cache(async () => {
  const user = await requireUser();
  const memberships = await prisma.staff.findMany({
    where: { userId: user.id, active: true },
    include: { shop: true },
    orderBy: { createdAt: "asc" },
  });
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
