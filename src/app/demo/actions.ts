"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SHOP_COOKIE } from "@/lib/auth";
import { allow, clientIp } from "@/lib/guard";
import { createDemo } from "@/lib/demo";
import { DEMO_COOKIE, DEMO_HOURS, demoEnabled, signDemo } from "@/lib/demo-session";

/** "Ver demo": crea una barbería de ejemplo solo para esta persona y la deja dentro del panel. */
export async function startDemo(_: { error?: string } | void): Promise<{ error?: string } | void> {
  if (!demoEnabled()) return { error: "La demostración no está disponible por ahora." };
  if (!(await allow(`demo:${await clientIp()}`, 6, 3600))) return { error: "Ya abriste varias demostraciones. Espera un rato e intenta de nuevo." };
  const { userId, shopId } = await createDemo();
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: DEMO_HOURS * 3600 };
  jar.set(DEMO_COOKIE, await signDemo(userId), opts);
  jar.set(SHOP_COOKIE, shopId, opts);
  redirect("/hoy");
}

/** Salir de la demo: a la página de inicio o a crear su barbería de verdad. */
export async function exitDemo(data: FormData) {
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  jar.delete(SHOP_COOKIE);
  redirect(data.get("to") === "registro" ? "/registro" : "/?ver=1");
}
