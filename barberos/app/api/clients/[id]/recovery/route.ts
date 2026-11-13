import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { handle, json, notFound, bad } from "@/lib/http";
import { clientCards } from "@/lib/domain/clients";

type P = { params: Promise<{ id: string }> };

/** Marca como ENVIADO (a mano, por WhatsApp) el mensaje de recuperación. No envía nada por sí solo. */
export const POST = handle(async (_req: Request, { params }: P) => {
  const c = await requireCtx("reminders");
  const { id } = await params;
  const [card] = await clientCards(c.shop, { id });
  if (!card) throw notFound("Cliente no encontrado");
  if (!card.recover) throw bad("Este cliente no está en Por recuperar");
  const log = await prisma.recoveryLog.create({ data: { barbershopId: c.shopId, clientId: id, daysAway: card.daysAway!, sentById: c.memberId, sentByName: c.memberName } });
  return json({ log }, 201);
});
