"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { devAuth, requireSection, VIEW_AS_COOKIE } from "@/lib/auth";

// Solo en desarrollo (DEV_AUTH_EMAIL): ver el sistema exactamente como lo ve alguien del equipo.

export async function viewAs(data: FormData) {
  if (!devAuth) return;
  const { me, shop } = await requireSection("equipo");
  if (me.role !== "OWNER" && me.role !== "MANAGER") return;
  const s = await prisma.staff.findFirst({ where: { id: String(data.get("staffId")), shopId: shop.id, active: true } });
  if (!s) return;
  (await cookies()).set(VIEW_AS_COOKIE, s.id, { path: "/", httpOnly: true, sameSite: "lax" });
  redirect("/hoy");
}

export async function stopViewAs() {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/equipo");
}
