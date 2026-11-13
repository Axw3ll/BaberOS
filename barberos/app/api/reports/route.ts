import { requireCtx } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { dayTotals, periodTotals } from "@/lib/domain/finance";
import { addDays, todayLocal, weekStart } from "@/lib/time";

export const GET = handle(async (req: Request) => {
  const c = await requireCtx("reports");
  const today = todayLocal(c.shop.timezone);
  const ws = new URL(req.url).searchParams.get("week") ?? weekStart(today);
  const [day, week] = await Promise.all([dayTotals(c.shop, today), periodTotals(c.shop, ws, addDays(ws, 7))]);
  return json({ today, weekStart: ws, weekEnd: addDays(ws, 6), day, week });
});
