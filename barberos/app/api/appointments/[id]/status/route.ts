import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";
import { setStatus } from "@/lib/domain/appointments";

type P = { params: Promise<{ id: string }> };
const Schema = z.object({ status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]) });

export const POST = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("agenda.all", "agenda.own");
  const { id } = await params;
  const { status } = Schema.parse(await body(req));
  return json({ appointment: await setStatus(c, id, status) });
});
