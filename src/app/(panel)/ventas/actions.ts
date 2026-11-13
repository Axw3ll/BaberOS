"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection } from "@/lib/auth";
import { checkout, SaleError, voidSale, type CartLine } from "@/lib/sales";
import { book, BookingError } from "@/lib/booking";
import { money as vMoney, phone as vPhone, text as vText } from "@/lib/validate";
import { toLocalDate } from "@/lib/time";
import type { PaymentMethod } from "@/generated/prisma/enums";

export async function chargeSale(input: {
  lines: CartLine[]; discount: number; tip: number; method: PaymentMethod; redeemPoints?: number; redeemReward?: boolean;
  received?: number | null;
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
  } else if (input.customer && (input.customer.phone.trim() || input.customer.name.trim())) {
    // Si empezaron a registrar al cliente, el teléfono tiene que estar completo (no se ignora en silencio)
    const p = vPhone(input.customer.phone, { required: true });
    if (p.error) return { error: `Cliente: ${p.error}` };
    const n = vText(input.customer.name, "el nombre del cliente", { max: 80 });
    if (n.error) return { error: n.error };
    const c = await prisma.customer.upsert({
      where: { shopId_phone: { shopId: shop.id, phone: p.value! } },
      update: {},
      create: { shopId: shop.id, phone: p.value!, name: n.value || "Cliente" },
    });
    customerId = c.id;
  }

  let saleId: string;
  try {
    const sale = await checkout({
      shopId: shop.id, chargedById: me.id, customerId, appointmentId: input.appointmentId,
      lines: input.lines, discount: input.discount, tip: input.tip, method: input.method,
      redeemPoints: input.redeemPoints ?? 0, redeemReward: Boolean(input.redeemReward), received: input.received ?? null,
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
  return c && { name: c.name, points: c.points, stamps: c.stamps, rewards: c.stampRewards };
}

/** "Terminar y cobrar": cobra los servicios de la cita, sin pasar por el punto de venta. */
export async function quickCharge(_: { error?: string } | void, data: FormData): Promise<{ error?: string } | void> {
  const { shop, me } = await requireSection("ventas");
  const id = String(data.get("appointmentId"));
  const method = String(data.get("method")) as PaymentMethod;
  if (!["CASH", "CARD", "TRANSFER"].includes(method)) return { error: "Elige cómo pagó." };
  // En efectivo hay que capturar cuánto entregó el cliente (para el cambio y para no cobrar de menos)
  let received: number | null = null;
  if (method === "CASH") {
    const r = vMoney(data.get("received"), "cuánto te dio el cliente", { required: true });
    if (r.error) return { error: r.error };
    received = r.value!;
  }
  const a = await prisma.appointment.findFirst({ where: { id, shopId: shop.id }, include: { services: true, sale: true } });
  if (!a) return { error: "La cita no existe." };
  if (a.sale) redirect(`/ventas/${a.sale.id}`);
  let saleId: string;
  try {
    const sale = await checkout({
      shopId: shop.id, chargedById: me.id, customerId: a.customerId, appointmentId: a.id, discount: 0, tip: 0, method, received,
      lines: a.services.map((s) => ({ kind: "SERVICE" as const, serviceId: s.serviceId, staffId: a.staffId, quantity: 1 })),
    });
    saleId = sale.id;
  } catch (e) {
    if (e instanceof SaleError) return { error: e.message };
    throw e;
  }
  revalidatePath("/ventas");
  revalidatePath("/hoy");
  revalidatePath("/agenda");
  redirect(`/ventas/${saleId}?nueva=1`);
}

/** Después de cobrar: agenda la próxima visita con los mismos servicios y barbero. */
export async function rebook(data: FormData) {
  const { shop } = await requireSection("agenda");
  const saleId = String(data.get("saleId"));
  const at = new Date(String(data.get("at")));
  const sale = await prisma.sale.findFirst({ where: { id: saleId, shopId: shop.id }, include: { appointment: { include: { services: true } } } });
  if (!sale?.appointment || Number.isNaN(at.getTime())) return;
  let id: string;
  try {
    const a = await book({
      shopId: shop.id, staffId: sale.appointment.staffId, serviceIds: sale.appointment.services.map((s) => s.serviceId), startsAt: at,
      customer: { id: sale.appointment.customerId }, source: "WALK_IN",
      checkAvailability: { ignoreNotice: true, date: toLocalDate(at, shop.timezone) },
    });
    id = a.id;
  } catch (e) {
    if (e instanceof BookingError) redirect(`/ventas/${saleId}?nueva=1&ocupado=1`);
    throw e;
  }
  revalidatePath("/agenda");
  redirect(`/citas/${id}?nueva=1`);
}
