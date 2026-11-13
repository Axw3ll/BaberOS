import { BarberSchema } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";
import { barberDaySummary } from "@/lib/domain/agenda";
import { todayLocal } from "@/lib/time";

export const GET = handle(async () => {
  const c = await requireCtx("barbers", "booking");
  const [barbers, ratings, summary] = await Promise.all([
    prisma.barber.findMany({ where: { barbershopId: c.shopId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { member: { select: { id: true } } } }),
    prisma.rating.groupBy({ by: ["barberId"], where: { barbershopId: c.shopId }, _avg: { stars: true }, _count: true }),
    barberDaySummary(c.shop, todayLocal(c.shop.timezone)),
  ]);
  return json({
    barbers: barbers.map((b) => {
      const r = ratings.find((x) => x.barberId === b.id);
      return { ...b, hasMember: !!b.member, rating: r ? { avg: Math.round((r._avg.stars ?? 0) * 10) / 10, count: r._count } : null, today: summary[b.id] };
    }),
  });
});

export const POST = handle(async (req: Request) => {
  const c = await requireCtx("barbers");
  const d = BarberSchema.parse(await body(req));
  return json({ barber: await prisma.barber.create({ data: { ...d, email: d.email || null, barbershopId: c.shopId } }) }, 201);
});
