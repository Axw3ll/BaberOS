"use server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isSuperadmin, requireUser, SUPPORT_COOKIE } from "@/lib/auth";

async function guard() {
  const user = await requireUser();
  if (!isSuperadmin(user.email)) notFound();
}
const DAY = 86_400_000;

export async function extendTrial(data: FormData) {
  await guard();
  const id = String(data.get("id"));
  const shop = await prisma.barbershop.findUniqueOrThrow({ where: { id } });
  const from = Math.max(Date.now(), shop.trialEndsAt.getTime());
  await prisma.barbershop.update({ where: { id }, data: { trialEndsAt: new Date(from + 14 * DAY) } });
  revalidatePath("/admin");
}

/** Para quien te paga por transferencia o en efectivo: activa el plan por 30 días (o los suma). */
export async function activateManual(data: FormData) {
  await guard();
  const id = String(data.get("id"));
  const plan = data.get("plan") === "PRO" ? "PRO" : "BASIC";
  const shop = await prisma.barbershop.findUniqueOrThrow({ where: { id } });
  const from = shop.currentPeriodEnd && shop.currentPeriodEnd.getTime() > Date.now() ? shop.currentPeriodEnd.getTime() : Date.now();
  await prisma.barbershop.update({ where: { id }, data: { plan, subscriptionStatus: "manual", currentPeriodEnd: new Date(from + 30 * DAY) } });
  revalidatePath("/admin");
}

export async function suspend(data: FormData) {
  await guard();
  await prisma.barbershop.update({
    where: { id: String(data.get("id")) },
    data: { trialEndsAt: new Date(), subscriptionStatus: null, currentPeriodEnd: null },
  });
  revalidatePath("/admin");
}

export async function enterSupport(data: FormData) {
  await guard();
  (await cookies()).set(SUPPORT_COOKIE, String(data.get("id")), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 4 });
  redirect("/hoy");
}

export async function exitSupport() {
  (await cookies()).delete(SUPPORT_COOKIE);
  redirect("/admin");
}
