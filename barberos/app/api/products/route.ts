import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";
import { ProductSchema } from "@/lib/schemas";

export const GET = handle(async () => {
  const c = await requireCtx("products.sell", "products.manage");
  const products = await prisma.product.findMany({ where: { barbershopId: c.shopId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  const canSeeCost = c.role === "OWNER" || c.role === "ADMIN";
  return json({
    products: products.map((p) => ({
      ...p,
      cost: canSeeCost ? p.cost : undefined,
      margin: canSeeCost ? p.price - p.cost : undefined,
      marginPct: canSeeCost && p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : undefined,
      stockState: p.stock === 0 ? "out" : p.stock <= p.lowStockAlert ? "low" : "ok",
    })),
  });
});

export const POST = handle(async (req: Request) => {
  const c = await requireCtx("products.manage");
  const d = ProductSchema.parse(await body(req));
  const p = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data: { ...d, stock: d.stock ?? 0, barbershopId: c.shopId } });
    if (p.stock > 0) await tx.stockMovement.create({ data: { barbershopId: c.shopId, productId: p.id, delta: p.stock, reason: "Inventario inicial", memberId: c.memberId } });
    return p;
  });
  return json({ product: p }, 201);
});
