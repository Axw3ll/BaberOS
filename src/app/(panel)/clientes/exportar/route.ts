import { prisma } from "@/lib/prisma";
import { currentContext, canAccess } from "@/lib/auth";
import { toLocalDate } from "@/lib/time";
import { birthdayLabel, customerStats, inSegment, ORIGIN, STAGE } from "@/lib/crm";

/** CSV de clientes (con el filtro de segmento y búsqueda de la lista). Excel lo abre directo. */
export async function GET(req: Request) {
  const { shop, me } = await currentContext();
  if (!canAccess(me.role, "clientes") || me.role === "BARBER") return new Response("Sin permiso", { status: 403 });

  const url = new URL(req.url);
  const seg = url.searchParams.get("seg") || "todos";
  const term = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const tz = shop.timezone;

  const [stats, extra, tags] = await Promise.all([
    customerStats(shop.id, { lostAfterDays: shop.lostAfterDays }),
    prisma.customer.findMany({ where: { shopId: shop.id }, select: { id: true, origin: true, notes: true, preferredStaff: { select: { name: true } } } }),
    prisma.tag.findMany({ where: { shopId: shop.id } }),
  ]);
  const byId = new Map(extra.map((c) => [c.id, c]));
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const digits = term.replace(/\D/g, "");

  const rows = stats
    .filter((c) => inSegment(c, seg, tz))
    .filter((c) => !term || c.name.toLowerCase().includes(term) || (digits.length >= 3 && c.phone.includes(digits)))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Evita que Excel ejecute fórmulas (=, +, -, @) y escapa comillas
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  const head = ["Nombre", "Teléfono", "Email", "Cumpleaños", "Etapa", "VIP", "Visitas", "Primera visita", "Última visita",
    "Gastado", "No llegó", "Puntos", "Origen", "Barbero de confianza", "Etiquetas", "Acepta promociones", "Nota"];
  const lines = rows.map((c) => {
    const x = byId.get(c.id);
    return [
      c.name, c.phone, c.email, c.birthday && birthdayLabel(c.birthday), STAGE[c.stage].label, c.vip ? "Sí" : "", c.visits,
      c.firstVisit && toLocalDate(c.firstVisit, tz), c.lastVisit && toLocalDate(c.lastVisit, tz), c.spent.toFixed(2), c.noShows,
      c.points, x?.origin && ORIGIN[x.origin], x?.preferredStaff?.name, c.tagIds.map((id) => tagName.get(id)).filter(Boolean).join(", "),
      c.acceptsMarketing ? "Sí" : "No", x?.notes,
    ].map(cell).join(",");
  });

  const csv = "﻿" + [head.join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${shop.slug}-${toLocalDate(new Date(), tz)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
