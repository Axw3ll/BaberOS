import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, ApiError } from "@/lib/http";
import { hashPin, verifyPin } from "@/lib/crypto";

const Schema = z.object({ currentPin: z.string(), newPin: z.string().regex(/^\d{4,6}$/, "PIN de 4 a 6 dígitos") });

/** Cada miembro cambia su propio PIN, confirmando el actual. */
export const POST = handle(async (req: Request) => {
  const c = await requireCtx();
  const d = Schema.parse(await body(req));
  const m = await prisma.member.findFirstOrThrow({ where: { id: c.memberId, barbershopId: c.shopId } });
  if (!(await verifyPin(d.currentPin, m.pinHash))) throw new ApiError(401, "Tu PIN actual no es correcto");
  await prisma.member.update({ where: { id: m.id }, data: { pinHash: await hashPin(d.newPin) } });
  return json({ ok: true });
});
