"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { allow, clientIp } from "@/lib/guard";
import { accessFor, canUsePanel } from "@/lib/billing";
import { joinQueue, QueueError, syncQueueMessages } from "@/lib/queue";
import { baseUrl } from "@/lib/messages";
import * as v from "@/lib/validate";

export async function joinOnline(_: { error?: string } | void, data: FormData): Promise<{ error?: string } | void> {
  if (data.get("website")) return { error: "No se pudo." }; // campo trampa para bots
  const slug = String(data.get("slug"));
  const shop = await prisma.barbershop.findUnique({ where: { slug } });
  if (!shop || !canUsePanel(accessFor(shop))) return { error: "Esta barbería no está disponible." };
  if (!(await allow(`fila:${await clientIp()}`, 6, 3600))) return { error: "Demasiados intentos. Espera unos minutos." };
  const name = v.text(data.get("name"), "tu nombre", { required: true, max: 60 });
  const phone = v.phone(data.get("phone"), { required: true });
  const err = v.first(name, phone);
  if (err) return { error: err };
  let token: string;
  try {
    const e = await joinQueue(shop, {
      name: name.value!, phone: phone.value ?? null, source: "ONLINE",
      serviceId: String(data.get("serviceId") || "") || null, staffId: String(data.get("staffId") || "") || null,
    });
    token = e.token;
  } catch (e) {
    if (e instanceof QueueError) return { error: e.message };
    throw e;
  }
  await syncQueueMessages(shop, await baseUrl());
  revalidatePath("/fila");
  redirect(`/f/${slug}/${token}`);
}

export async function leaveQueue(data: FormData) {
  const token = String(data.get("token"));
  if (!/^[0-9a-f]{64}$/.test(token)) return;
  const e = await prisma.queueEntry.findUnique({ where: { token }, include: { shop: true } });
  if (!e || (e.status !== "WAITING" && e.status !== "CALLED")) return;
  await prisma.queueEntry.update({ where: { id: e.id }, data: { status: "LEFT", finishedAt: new Date() } });
  revalidatePath("/fila");
  revalidatePath(`/f/${e.shop.slug}/${token}`);
}
