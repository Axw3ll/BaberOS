import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handle, json, notFound, bad } from "@/lib/http";
import { createCheckout, requireStripe } from "@/lib/domain/stripe";

type P = { params: Promise<{ slug: string }> };
const Schema = z.object({ token: z.string().min(10) });

/** El cliente intenta pagar su anticipo con tarjeta. El monto se toma del servidor, nunca del navegador. */
export const POST = handle(async (req: Request, { params }: P) => {
  const { slug } = await params;
  const shop = await prisma.barbershop.findUnique({ where: { slug } });
  if (!shop) throw notFound("Barbería no encontrada");
  const { token } = Schema.parse(await body(req));
  const appt = await prisma.appointment.findFirst({ where: { publicToken: token, barbershopId: shop.id }, include: { deposit: true, service: true } });
  if (!appt?.deposit) throw notFound("Esta reserva no tiene anticipo");
  if (appt.deposit.status !== "PENDING") throw bad("Este anticipo ya no está pendiente");
  const stripe = requireStripe(shop); // -> 409 "Stripe no está conectado" si no hay llaves
  const session = await createCheckout(stripe, shop, {
    amount: appt.deposit.amount, description: `Anticipo: ${appt.service.name} — ${shop.name}`, kind: "deposit", refId: appt.deposit.id,
    successPath: `/${shop.slug}/reservar?pagado=1`, cancelPath: `/${shop.slug}/reservar`,
  });
  await prisma.deposit.update({ where: { id: appt.deposit.id }, data: { stripeSessionId: session.id } });
  return json({ url: session.url });
});
