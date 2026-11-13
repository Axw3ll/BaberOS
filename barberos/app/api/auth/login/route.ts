import { z } from "zod";
import { body, handle, json } from "@/lib/http";
import { loginWithPin } from "@/lib/auth";

const Schema = z.object({ slug: z.string().min(1), memberId: z.string().min(1), pin: z.string().regex(/^\d{4,6}$/, "PIN de 4 a 6 dígitos") });

export const POST = handle(async (req: Request) => {
  const d = Schema.parse(await body(req));
  const m = await loginWithPin(d.slug, d.memberId, d.pin);
  return json({ ok: true, name: m.name, role: m.role });
});
