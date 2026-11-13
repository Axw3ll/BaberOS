"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection } from "@/lib/auth";
import { payrollInfo } from "@/lib/payroll";

/** Marca como pagadas todas las comisiones pendientes de una persona hasta este momento. */
export async function payCommissions(data: FormData) {
  const { shop, me } = await requireSection("ventas");
  if (!canAccess(me.role, "ajustes")) return; // solo dueño y encargado
  const staffId = String(data.get("staffId"));
  const note = String(data.get("note") ?? "").trim().slice(0, 200) || null;
  // Por defecto paga lo del periodo cerrado; "todo" adelanta también lo que va del periodo en curso
  const { cutoff } = payrollInfo(shop);
  const upTo = data.get("scope") === "todo" ? new Date() : new Date(cutoff.getTime() - 1);
  await prisma.$transaction(async (tx) => {
    const items = await tx.saleItem.findMany({
      where: { staffId, payoutId: null, commission: { gt: 0 }, sale: { shopId: shop.id, status: "PAID", ...(data.get("scope") !== "todo" && { createdAt: { lte: upTo } }) } },
      select: { id: true, commission: true },
    });
    if (!items.length) return;
    const amount = items.reduce((a, i) => a + Number(i.commission), 0);
    const p = await tx.commissionPayout.create({
      data: { shopId: shop.id, staffId, paidById: me.id, amount: Math.round(amount * 100) / 100, items: items.length, upTo, note },
    });
    await tx.saleItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { payoutId: p.id } });
    const who = await tx.staff.findUnique({ where: { id: staffId }, select: { name: true } });
    await tx.auditLog.create({ data: { shopId: shop.id, staffId: me.id, action: "comision.pago", summary: `Pagó $${p.amount.toFixed(2)} de comisiones a ${who?.name ?? "—"}`, entityType: "payout", entityId: p.id } });
  });
  revalidatePath("/ventas/comisiones");
  revalidatePath("/hoy");
}
