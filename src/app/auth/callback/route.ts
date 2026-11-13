import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Destino del enlace de confirmación de email
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    await sb.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/hoy", request.url));
}
