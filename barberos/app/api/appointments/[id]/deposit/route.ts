import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";
import { recordDeposit } from "@/lib/domain/appointments";

type P = { params: Promise<{ id: string }> };
const Schema = z.object({ method: z.enum(["CASH", "TRANSFER", "CARD"]) });

/** Registrar a mano un anticipo recibido (efectivo, transferencia o terminal física). El monto lo fija el servidor. */
export const POST = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("charge");
  const { id } = await params;
  const { method } = Schema.parse(await body(req));
  return json({ deposit: await recordDeposit(c, id, method) });
});
