import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound, bad, forbidden } from "@/lib/http";

type P = { params: Promise<{ id: string }> };
const Schema = z.object({ stars: z.number().int().min(1).max(5) });

/** Calificación 1-5 del barbero, una sola vez por cita completada. */
export const POST = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("agenda.all", "agenda.own");
  const { id } = await params;
  const { stars } = Schema.parse(await body(req));
  const a = await prisma.appointment.findFirst({ where: { id, barbershopId: c.shopId } });
  if (!a) throw notFound("Cita no encontrada");
  if (c.role === "BARBER") throw forbidden("Un barbero no puede calificarse a sí mismo");
  if (!["COMPLETED", "CHARGED"].includes(a.status)) throw bad("Solo se califican citas completadas");
  const r = await prisma.rating.create({ data: { barbershopId: c.shopId, appointmentId: a.id, barberId: a.barberId, stars } });
  return json({ rating: r }, 201);
});
