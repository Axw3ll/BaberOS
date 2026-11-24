"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createInvitedAccount, findInvite } from "@/lib/invite";
import { allow, clientIp } from "@/lib/guard";
import { supabaseServer } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

export async function acceptInvite(_: ActionResult, data: FormData): Promise<ActionResult> {
  const token = String(data.get("token") ?? "");
  const name = String(data.get("name") ?? "").trim().slice(0, 80);
  const password = String(data.get("password") ?? "");
  if (!(await allow(`unirse:${await clientIp()}`, 10, 3600))) return { error: "Demasiados intentos. Espera un rato." };
  const s = await findInvite(token);
  if (!s?.email) return { error: "Esta invitación ya no es válida. Pide a tu barbería un enlace nuevo." };
  if (!name) return { error: "Escribe tu nombre." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  if (password.length > 72) return { error: "La contraseña es demasiado larga (máximo 72 caracteres)." };
  if (data.get("terms") !== "on") return { error: "Acepta los términos y el aviso de privacidad para continuar." };

  const r = await createInvitedAccount(s.email, name, password);
  if ("error" in r) return { error: r.error };

  const sb = await supabaseServer();
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: s.email, password });
  if (error || !auth.user) return { error: "Tu cuenta quedó lista, pero no pudimos entrar. Entra con tu correo y contraseña." };

  // Liga la cuenta a este miembro del equipo (y a cualquier otra invitación pendiente con su correo)
  await prisma.user.upsert({ where: { id: auth.user.id }, update: { name }, create: { id: auth.user.id, email: s.email, name } });
  await prisma.staff.updateMany({ where: { email: s.email, userId: null, shop: { isDemo: false } }, data: { userId: auth.user.id, inviteToken: null } });
  redirect("/hoy");
}
