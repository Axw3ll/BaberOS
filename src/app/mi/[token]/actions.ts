"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { allow } from "@/lib/guard";

/** El cliente decide si quiere promociones (los avisos de sus citas le siguen llegando). */
export async function setMarketing(token: string, accepts: boolean) {
  if (!/^[0-9a-f]{64}$/.test(token) || !(await allow(`mi:${token}`, 20, 3600))) return;
  const c = await prisma.customer.findUnique({ where: { token } });
  if (!c || c.acceptsMarketing === accepts) return;
  await prisma.$transaction([
    prisma.customer.update({ where: { id: c.id }, data: { acceptsMarketing: accepts } }),
    prisma.customerActivity.create({
      data: { shopId: c.shopId, customerId: c.id, type: "NOTE", body: accepts ? "Activó las promociones desde su enlace." : "Pidió no recibir promociones desde su enlace." },
    }),
  ]);
  revalidatePath(`/mi/${token}`);
}
