"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { deliverPending } from "@/lib/messages";
import { whatsappEnabled } from "@/lib/whatsapp";

async function mine(id: string) {
  const { shop, me } = await requireSection("seguimiento");
  return prisma.outboundMessage.findFirst({
    where: { id, shopId: shop.id, ...(seesOnlyOwnAgenda(me.role) && { appointment: { staffId: me.id } }) },
  }).then((m) => m && { m, me, shop });
}

/** Se llama al abrir WhatsApp con el mensaje: lo marca enviado y lo deja en la bitácora del cliente. */
export async function markMessageSent(id: string) {
  const r = await mine(id);
  if (!r || r.m.status !== "PENDING") return;
  await prisma.$transaction([
    prisma.outboundMessage.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } }),
    prisma.customerActivity.create({ data: { shopId: r.shop.id, customerId: r.m.customerId, staffId: r.me.id, type: "WHATSAPP", body: r.m.body } }),
  ]);
  revalidatePath("/seguimiento/mensajes");
  revalidatePath("/hoy");
}

export async function skipMessage(data: FormData) {
  const r = await mine(String(data.get("id")));
  if (!r || r.m.status !== "PENDING") return;
  await prisma.outboundMessage.update({ where: { id: r.m.id }, data: { status: "SKIPPED" } });
  revalidatePath("/seguimiento/mensajes");
  revalidatePath("/hoy");
}

/** Con la API de WhatsApp conectada: envía ya lo pendiente sin esperar a la tarea programada. */
export async function sendAllNow() {
  const { shop, me } = await requireSection("seguimiento");
  if (me.role === "BARBER" || !whatsappEnabled()) return;
  await deliverPending(shop.id);
  revalidatePath("/seguimiento/mensajes");
  revalidatePath("/hoy");
}
