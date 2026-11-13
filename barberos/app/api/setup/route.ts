import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handle, json } from "@/lib/http";
import { hashPin } from "@/lib/crypto";
import { createSession } from "@/lib/auth";

const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Schema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\D*(\d\D*){10,13}$/, "teléfono de 10 dígitos"),
  timezone: z.string().default("America/Mexico_City"),
  openTime: Hhmm.default("09:00"),
  closeTime: Hhmm.default("20:00"),
  workDays: z.array(z.number().int().min(0).max(6)).min(1).default([1, 2, 3, 4, 5, 6]),
  ownerName: z.string().trim().min(2).max(80),
  ownerEmail: z.string().trim().email().optional().or(z.literal("")),
  ownerPhone: z.string().trim().optional(),
  pin: z.string().regex(/^\d{4,6}$/, "el PIN debe tener de 4 a 6 dígitos"),
});

function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "barberia";
}

export const POST = handle(async (req: Request) => {
  const d = Schema.parse(await body(req));
  try { new Intl.DateTimeFormat("es-MX", { timeZone: d.timezone }); } catch { return json({ error: "Zona horaria inválida" }, 400); }
  if (d.openTime >= d.closeTime) return json({ error: "La hora de cierre debe ser después de la apertura" }, 400);

  let slug = slugify(d.name);
  for (let i = 2; await prisma.barbershop.findUnique({ where: { slug } }); i++) slug = `${slugify(d.name)}-${i}`;

  const pinHash = await hashPin(d.pin);
  const shop = await prisma.$transaction(async (tx) => {
    const s = await tx.barbershop.create({
      data: {
        slug, name: d.name, city: d.city, phone: d.phone.replace(/\D/g, ""), timezone: d.timezone,
        openTime: d.openTime, closeTime: d.closeTime, workDays: [...new Set(d.workDays)].sort().join(","),
        ownerName: d.ownerName, ownerEmail: d.ownerEmail || null, ownerPhone: d.ownerPhone || null,
      },
    });
    await tx.subscription.create({ data: { barbershopId: s.id, plan: "BASICO", status: "TRIALING", trialEndsAt: new Date(Date.now() + 14 * 86400_000) } });
    const owner = await tx.member.create({ data: { barbershopId: s.id, name: d.ownerName, email: d.ownerEmail || null, role: "OWNER", pinHash } });
    return { s, owner };
  });
  await createSession(shop.owner.id, shop.s.id);
  return json({ slug: shop.s.slug }, 201);
});
