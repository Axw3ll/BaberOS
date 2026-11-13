"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentContext, SHOP_COOKIE } from "@/lib/auth";

export async function switchShop(data: FormData) {
  const { shops } = await currentContext();
  const id = String(data.get("shopId"));
  if (shops.some((s) => s.id === id)) {
    (await cookies()).set(SHOP_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect("/hoy");
}
