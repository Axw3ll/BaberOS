import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";
import { ExpenseSchema } from "@/lib/schemas";

export const GET = handle(async (req: Request) => {
  const c = await requireCtx("expenses");
  const u = new URL(req.url);
  const from = u.searchParams.get("from"), to = u.searchParams.get("to");
  const expenses = await prisma.expense.findMany({
    where: { barbershopId: c.shopId, ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200,
  });
  return json({ expenses });
});

export const POST = handle(async (req: Request) => {
  const c = await requireCtx("expenses");
  const d = ExpenseSchema.parse(await body(req));
  return json({ expense: await prisma.expense.create({ data: { ...d, barbershopId: c.shopId } }) }, 201);
});
