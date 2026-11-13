"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection } from "@/lib/auth";
import { checkout, SaleError, voidSale, type CartLine } from "@/lib/sales";
import type { PaymentMethod } from "@/generated/prisma/enums";

export async function chargeSale(input: {
  lines: CartLine[]; discount: number; tip: number; method: PaymentMethod; redeemPoints?: number;
  appointmentId?: string | null; customer?: { phone: string; name: string } | null;
}): Promise<{ error: string } | void> {
  const { shop, me } = await requireSection("ventas");
  if (!["CASH", "CARD", "TRANSFER"].includes(input.method)) return { error: "Elige cómo pagó." };
  if (input.lines.some((l) => l.kind === "SERVICE" && !l.staffId)) return { error: "Indica qué barbero hizo cada servicio." };

  let customerId: string | null = null;
  if (input.appointmentId) {
    const a = await prisma.appointment.findFirst({ where: { id: input.appointmentId, shopId: shop.id }, include: { sale: true } });
    if (!a) return { error: "La cita no existe." };
    if (a.sale) return { error: "Esa cita ya se cobró." };
    customerId = a.customerId;
  } else if (input.customer && input.customer.phone.replace(/\D/g, "").length >= 10) {
    const phone = input.customer.phone.replace(/\D/g, "");
    const c = await prisma.customer.upsert({
      where: { shopId_phone: { shopId: shop.id, phone } },
      update: {},
      create: { shopId: shop.id, phone, name: input.customer.name.trim() || "Cliente" },
    });
    customerId = c.id;
  }

  let saleId: string;
  try {
    const sale = await checkout({
      shopId: shop.id, chargedById: me.id, customerId, appointmentId: input.appointmentId,
      lines: input.lines, discount: Number(input.discount) || 0, tip: Number(input.tip) || 0, method: input.method,
      redeemPoints: Number(input.redeemPoints) || 0,
    });
    saleId = sale.id;
  } catch (e) {
    if (e instanceof SaleError) return { error: e.message };
    throw e;
  }
  revalidatePath("/ventas");
  revalidatePath("/hoy");
  if (customerId) revalidatePath(`/clientes/${customerId}`);
  redirect(`/ventas/${saleId}?nueva=1`);
}

export async function cancelSale(data: FormData) {
  const { shop, me } = await requireSection("ventas");
  if (!canAccess(me.role, "ajustes")) return; // solo dueño y encargado
  const id = String(data.get("id"));
  await voidSale(shop.id, id);
  revalidatePath(`/ventas/${id}`);
  revalidatePath("/ventas");
}

/** Para el ticket: ¿el teléfono ya es cliente? Con su saldo de puntos. */
export async function lookupCustomer(phone: string) {
  const { shop } = await requireSection("ventas");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const c = await prisma.customer.findUnique({ where: { shopId_phone: { shopId: shop.id, phone: digits } } });
  return c && { name: c.name, points: c.points };
}
