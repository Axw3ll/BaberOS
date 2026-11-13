import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { handle, json, notFound, bad } from "@/lib/http";
import { createCheckout, requireStripe } from "@/lib/domain/stripe";

type P = { params: Promise<{ id: string }> };

/** Cobrar el anticipo con tarjeta en línea desde el detalle de la cita. */
export const POST = handle(async (_req: Request, { params }: P) => {
  const c = await requireCtx("charge");
  const { id } = await params;
  const a = await prisma.appointment.findFirst({ where: { id, barbershopId: c.shopId }, include: { deposit: true, service: true } });
  if (!a?.deposit) throw notFound("Esta cita no tiene anticipo");
  if (a.deposit.status !== "PENDING") throw bad("El anticipo ya no está pendiente");
  const stripe = requireStripe(c.shop);
  const s = await createCheckout(stripe, c.shop, {
    amount: a.deposit.amount, description: `Anticipo: ${a.service.name}`, kind: "deposit", refId: a.deposit.id,
    successPath: `/${c.shop.slug}`, cancelPath: `/${c.shop.slug}`,
  });
  await prisma.deposit.update({ where: { id: a.deposit.id }, data: { stripeSessionId: s.id } });
  return json({ url: s.url });
});
