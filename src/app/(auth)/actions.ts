"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

export async function signIn(_: ActionResult, data: FormData): Promise<ActionResult> {
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({
    email: String(data.get("email") ?? "").trim(),
    password: String(data.get("password") ?? ""),
  });
  if (error) return { error: "Email o contraseña incorrectos." };
  redirect("/hoy");
}

export async function signUp(_: ActionResult, data: FormData): Promise<ActionResult> {
  const name = String(data.get("name") ?? "").trim();
  const email = String(data.get("email") ?? "").trim();
  const password = String(data.get("password") ?? "");
  if (!name) return { error: "Escribe tu nombre." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  if (data.get("terms") !== "on") return { error: "Acepta los términos y el aviso de privacidad para continuar." };

  const sb = await supabaseServer();
  const { data: res, error } = await sb.auth.signUp({
    email, password,
    options: { data: { name }, emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  if (error) return { error: error.message.includes("registered") ? "Ese email ya tiene cuenta. Inicia sesión." : "No se pudo crear la cuenta. Revisa el email." };
  if (!res.session) return { ok: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a entrar." };
  // /hoy decide: si ya lo agregaron a un equipo entra directo; si no, lo manda a registrar su barbería
  redirect("/hoy");
}

export async function signOut() {
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
