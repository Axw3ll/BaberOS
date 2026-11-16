"use server";
import { isDemoEmail } from "@/lib/demo";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

export async function setPassword(_: ActionResult, data: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (isDemoEmail(user.email)) return { error: "En la demostración no hay contraseña. Crea tu barbería para tener tu cuenta." };
  const password = String(data.get("password") ?? "");
  const name = String(data.get("name") ?? "").trim().slice(0, 80);
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password, ...(name && { data: { name } }) });
  if (error) return { error: "No se pudo guardar. Abre otra vez el enlace del correo." };
  if (name && name !== user.name) await prisma.user.update({ where: { id: user.id }, data: { name } });
  redirect("/hoy");
}
