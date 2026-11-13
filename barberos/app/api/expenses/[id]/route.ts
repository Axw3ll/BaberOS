import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, notFound } from "@/lib/http";
import { ExpenseSchema } from "@/lib/schemas";

type P = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("expenses");
  const { id } = await params;
  const d = ExpenseSchema.partial().parse(await body(req));
  const r = await prisma.expense.updateMany({ where: { id, barbershopId: c.shopId }, data: d });
  if (!r.count) throw notFound("Gasto no encontrado");
  return json({ expense: await prisma.expense.findUnique({ where: { id } }) });
});

export const DELETE = handle(async (_req: Request, { params }: P) => {
  const c = await requireCtx("expenses");
  const { id } = await params;
  const r = await prisma.expense.deleteMany({ where: { id, barbershopId: c.shopId } });
  if (!r.count) throw notFound("Gasto no encontrado");
  return json({ deleted: true });
});
