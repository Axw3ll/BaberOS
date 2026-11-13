import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, forbidden, conflict } from "@/lib/http";
import { chargeAppointment, chargeQuote } from "@/lib/domain/appointments";

type P = { params: Promise<{ id: string }> };

/** Cotización del cobro calculada en el servidor: precio, anticipo pagado, descuento de lealtad y resto. */
export const GET = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("charge");
  const { id } = await params;
  const useReward = new URL(req.url).searchParams.get("useReward") === "1";
  const q = await chargeQuote(prisma, c.shopId, id, useReward);
  if (c.role === "BARBER" && q.appointment.barberId !== c.barberId) throw forbidden("Esa cita no es tuya");
  return json({ price: q.price, depositPaid: q.depositPaid, depositPending: q.depositPending, discount: q.discount, remaining: q.remaining, availableRewards: q.availableRewards, rewardPercent: q.rewardPercent, alreadyCharged: !!q.appointment.payment });
});

const Schema = z.object({
  method: z.enum(["CASH", "TRANSFER", "CARD"]),
  useReward: z.boolean().default(false),
  expectedRemaining: z.number().int().optional(), // lo que vio la pantalla; si cambió en el servidor, se rechaza
});

export const POST = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("charge");
  const { id } = await params;
  const d = Schema.parse(await body(req));
  if (d.expectedRemaining !== undefined) {
    const q = await chargeQuote(prisma, c.shopId, id, d.useReward);
    if (q.remaining !== d.expectedRemaining) throw conflict("El monto cambió desde que abriste el cobro. Revísalo de nuevo.", "AMOUNT_CHANGED");
  }
  return json({ result: await chargeAppointment(c, id, d.method, d.useReward) });
});
