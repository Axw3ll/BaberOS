"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser, SHOP_COOKIE } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { SERVICE_TEMPLATES } from "@/lib/templates";
import type { ActionResult } from "@/components/action-form";

export async function createShop(_: ActionResult, data: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(data.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Escribe el nombre de la barbería." };

  let slug = slugify(name);
  if (await prisma.barbershop.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const days = [1, 2, 3, 4, 5, 6]; // lunes a sábado
  const open = 10 * 60, close = 20 * 60;
  const works = data.get("works") === "on";
  const picked = SERVICE_TEMPLATES.filter((t) => data.getAll("tpl").includes(t.key));

  const shop = await prisma.$transaction(async (tx) => {
    const shop = await tx.barbershop.create({
      data: {
        name, slug, ownerId: user.id,
        phone: String(data.get("phone") ?? "").trim() || null,
        address: String(data.get("address") ?? "").trim() || null,
        hours: { create: days.map((weekday) => ({ weekday, startMinute: open, endMinute: close })) },
      },
    });
    const me = await tx.staff.create({
      data: {
        shopId: shop.id, userId: user.id, email: user.email, role: "OWNER", name: user.name, takesAppointments: works,
        schedule: works ? { create: days.map((weekday) => ({ weekday, startMinute: open, endMinute: close })) } : undefined,
      },
    });
    for (const [i, t] of picked.entries()) {
      await tx.service.create({
        data: {
          shopId: shop.id, name: t.name, minutes: t.minutes, price: t.price, description: t.description, position: i,
          ...(works && { staff: { create: { staffId: me.id } } }),
        },
      });
    }
    return shop;
  });

  (await cookies()).set(SHOP_COOKIE, shop.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/hoy");
}
