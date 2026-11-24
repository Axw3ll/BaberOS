import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, verifyDemo } from "@/lib/demo-session";

// Refresca la sesión de Supabase en cada request y protege el panel.
const PUBLIC = ["/login", "/registro", "/recuperar", "/b/", "/c/", "/mi/", "/f/", "/auth/", "/privacidad", "/terminos", "/demo/", "/unirse/", "/api/cron/", "/api/stripe/", "/manifest.webmanifest"];

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_EMAIL) return NextResponse.next();
  // Quien está viendo la demo entra al panel sin cuenta (la barbería de demo es solo suya)
  if (await verifyDemo(request.cookies.get(DEMO_COOKIE)?.value)) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // getClaims valida el JWT sin ir al servidor de Auth (con llaves asimétricas) y refresca la sesión si está por vencer.
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC.some((p) => path.startsWith(p));

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Al entrar, vuelve a la página que quería abrir (p. ej. /admin)
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
