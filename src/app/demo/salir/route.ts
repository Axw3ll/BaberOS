import { NextResponse, type NextRequest } from "next/server";
import { SHOP_COOKIE, VIEW_AS_COOKIE } from "@/lib/auth";
import { DEMO_COOKIE } from "@/lib/demo-session";

/** Sale de una demo que ya no existe (se borró a las 24 h o se vació la base): limpia las cookies y vuelve al inicio. */
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/?ver=1", request.url));
  for (const name of [DEMO_COOKIE, SHOP_COOKIE, VIEW_AS_COOKIE]) res.cookies.delete(name);
  return res;
}
