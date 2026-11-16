import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Destino de los enlaces de correo de Supabase (invitación, confirmación, recuperar contraseña).
 * En Supabase → Authentication → Emails, cada plantilla debe apuntar a:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<invite|signup|recovery|email>
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next");
  // Invitados y quien recupera contraseña van a ponerse una; el resto, al panel
  const fallback = type === "invite" || type === "recovery" ? "/cuenta/contrasena" : "/hoy";
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;

  if (tokenHash && type) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(target, request.url));
  }
  return NextResponse.redirect(new URL("/login?enlace=vencido", request.url));
}
