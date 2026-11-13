import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, bad } from "@/lib/http";
import { can } from "@/lib/permissions";
import { createAppointment, findOrCreateClient } from "@/lib/domain/appointments";
import { barberDaySummary, dayAppointments } from "@/lib/domain/agenda";
import { isValidDate, todayLocal } from "@/lib/time";

export const GET = handle(async (req: Request) => {
  const c = await requireCtx("agenda.all", "agenda.own");
  const date = new URL(req.url).searchParams.get("date") ?? todayLocal(c.shop.timezone);
  if (!isValidDate(date)) throw bad("Fecha inválida");
  // El barbero solo ve su columna: el filtro se impone en el servidor
  const onlyBarber = can(c.role, "agenda.all") ? null : (c.barberId ?? "__none__");
  const appts = await dayAppointments(c.shop, date, onlyBarber);
  const summary = await barberDaySummary(c.shop, date, appts);
  const lost = appts.filter((a) => a.status === "NO_SHOW" || a.status === "CANCELLED").length;
  return json({
    date, appointments: appts,
    summary: onlyBarber ? { [onlyBarber]: summary[onlyBarber] } : summary,
    lost: can(c.role, "agenda.all") ? lost : undefined,
  });
});

const Schema = z.object({
  barberId: z.string(), serviceId: z.string(),
  date: z.string(), time: z.string(),
  clientId: z.string().optional(),
  newClient: z.object({ name: z.string(), phone: z.string() }).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const POST = handle(async (req: Request) => {
  const c = await requireCtx("booking");
  const d = Schema.parse(await body(req));
  const appt = await prisma.$transaction(async (tx) => {
    let clientId = d.clientId;
    if (!clientId) {
      if (!d.newClient) throw bad("Elige un cliente o captura uno nuevo");
      clientId = (await findOrCreateClient(tx, c.shopId, d.newClient.name, d.newClient.phone)).id;
    }
    return createAppointment(tx, c.shop, { ...d, clientId, source: "PANEL" });
  });
  return json({ appointment: appt }, 201);
});
