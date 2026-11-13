import { ServiceSchema } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const c = await requireCtx("services", "booking");
  return json({ services: await prisma.service.findMany({ where: { barbershopId: c.shopId }, orderBy: [{ active: "desc" }, { name: "asc" }] }) });
});

export const POST = handle(async (req: Request) => {
  const c = await requireCtx("services");
  const d = ServiceSchema.parse(await body(req));
  return json({ service: await prisma.service.create({ data: { ...d, barbershopId: c.shopId } }) }, 201);
});
