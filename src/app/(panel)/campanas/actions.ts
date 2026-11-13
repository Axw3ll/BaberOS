"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { customerStats, inSegment, SEGMENTS } from "@/lib/crm";
import type { ActionResult } from "@/components/action-form";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function createCampaign(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { shop, me } = await requireSection("campanas");
  const name = str(data.get("name")).slice(0, 80);
  const audience = str(data.get("audience"));
  const message = str(data.get("message")).slice(0, 1000);
  if (!name) return { error: "Ponle nombre a la campaña." };
  if (!message) return { error: "Escribe el mensaje." };

  const validSeg = SEGMENTS.some((s) => s.id === audience) ||
    (audience.startsWith("tag:") && (await prisma.tag.findFirst({ where: { id: audience.slice(4), shopId: shop.id } })));
  if (!validSeg) return { error: "Elige a quién va dirigida." };

  const stats = await customerStats(shop.id, { lostAfterDays: shop.lostAfterDays });
  const ids = stats.filter((c) => c.acceptsMarketing && inSegment(c, audience, shop.timezone)).map((c) => c.id);
  if (ids.length === 0) return { error: "Nadie en ese segmento acepta promociones." };

  const c = await prisma.campaign.create({
    data: {
      shopId: shop.id, createdById: me.id, name, audience, message,
      recipients: { createMany: { data: ids.map((customerId) => ({ customerId })) } },
    },
  });
  revalidatePath("/campanas");
  redirect(`/campanas/${c.id}`);
}

/** Se llama al abrir el WhatsApp de cada destinatario. También queda en su bitácora. */
export async function markSent(recipientId: string) {
  const { shop, me } = await requireSection("campanas");
  const r = await prisma.campaignRecipient.findFirst({
    where: { id: recipientId, campaign: { shopId: shop.id } }, include: { campaign: true },
  });
  if (!r || r.sentAt) return;
  await prisma.$transaction([
    prisma.campaignRecipient.update({ where: { id: r.id }, data: { sentAt: new Date() } }),
    prisma.customerActivity.create({
      data: { shopId: shop.id, customerId: r.customerId, staffId: me.id, type: "WHATSAPP", body: `Campaña “${r.campaign.name}”` },
    }),
  ]);
  const left = await prisma.campaignRecipient.count({ where: { campaignId: r.campaignId, sentAt: null } });
  if (left === 0) await prisma.campaign.update({ where: { id: r.campaignId }, data: { status: "DONE" } });
  revalidatePath(`/campanas/${r.campaignId}`);
}

export async function closeCampaign(data: FormData) {
  const { shop } = await requireSection("campanas");
  const id = str(data.get("id"));
  await prisma.campaign.updateMany({ where: { id, shopId: shop.id }, data: { status: "DONE" } });
  revalidatePath(`/campanas/${id}`);
  revalidatePath("/campanas");
}

export async function deleteCampaign(data: FormData) {
  const { shop } = await requireSection("campanas");
  await prisma.campaign.deleteMany({ where: { id: str(data.get("id")), shopId: shop.id } });
  revalidatePath("/campanas");
  redirect("/campanas");
}
