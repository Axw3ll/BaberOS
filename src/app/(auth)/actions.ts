"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DEMO_COOKIE } from "@/lib/demo-session";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperadmin } from "@/lib/auth";
import type { ActionResult } from "@/components/action-form";

export async function signIn(_: ActionResult, data: FormData): Promise<ActionResult> {
  const sb = await supabaseServer();
  const email = String(data.get("email") ?? "").trim();
  const { error } = await sb.auth.signInWithPassword({ email, password: String(data.get("password") ?? "") });
  if (error) return { error: "Email o contraseña incorrectos." };
  // Solo rutas internas (nada de "//otro-sitio")
  const next = String(data.get("next") ?? "");
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) redirect(next);
  // El administrador de BarberOS entra directo a su panel
  redirect(isSuperadmin(email) ? "/admin" : "/hoy");
}

export async function signUp(_: ActionResult, data: FormData): Promise<ActionResult> {
  const name = String(data.get("name") ?? "").trim();
  const email = String(data.get("email") ?? "").trim();
  const password = String(data.get("password") ?? "");
  if (!name) return { error: "Escribe tu nombre." };
  if (name.length > 80) return { error: "El nombre es demasiado largo (máximo 80 caracteres)." };
  if (!/^\S+@\S+\.\S{2,}$/.test(email) || email.length > 160) return { error: "El correo no es válido." };
  if (password.length > 72) return { error: "La contraseña es demasiado larga (máximo 72 caracteres)." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  if (data.get("terms") !== "on") return { error: "Acepta los términos y el aviso de privacidad para continuar." };

  const sb = await supabaseServer();
  const { data: res, error } = await sb.auth.signUp({
    email, password,
    options: { data: { name }, emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  if (error) {
    if (!error.message.includes("registered")) return { error: "No se pudo crear la cuenta. Revisa el email." };
    // El correo de invitación de Supabase deja la cuenta creada sin contraseña: su camino es el enlace de invitación
    const invited = await prisma.staff.findFirst({ where: { email: email.toLowerCase(), userId: null, shop: { isDemo: false } }, select: { id: true } });
    return { error: invited
      ? "Te invitaron a un equipo con este correo. Abre el enlace que te mandó tu barbería (por WhatsApp o correo) para elegir tu contraseña."
      : "Ese email ya tiene cuenta. Inicia sesión." };
  }
  if (!res.session) return { ok: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a entrar." };
  // /hoy decide: si ya lo agregaron a un equipo entra directo; si no, lo manda a registrar su barbería
  redirect("/hoy");
}

export async function signOut() {
  const jar = await cookies();
  if (jar.get(DEMO_COOKIE)) {
    jar.delete(DEMO_COOKIE);
    redirect("/?ver=1");
  }
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}

export async function requestReset(_: ActionResult, data: FormData): Promise<ActionResult> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Escribe un email válido." };
  const sb = await supabaseServer();
  await sb.auth.resetPasswordForEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm?next=/cuenta/contrasena` });
  // Misma respuesta exista o no la cuenta: no revela qué correos están registrados
  return { ok: "Si ese correo tiene cuenta, te llegará un enlace en unos minutos." };
}
