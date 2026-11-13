import { requireCtx } from "@/lib/auth";
import { handle, json, bad } from "@/lib/http";
import { freeSlots } from "@/lib/domain/appointments";

export const GET = handle(async (req: Request) => {
  const c = await requireCtx("booking");
  const u = new URL(req.url);
  const barberId = u.searchParams.get("barberId"), serviceId = u.searchParams.get("serviceId"), date = u.searchParams.get("date");
  if (!barberId || !serviceId || !date) throw bad("Faltan datos");
  return json({ slots: await freeSlots(c.shop, barberId, serviceId, date) });
});
