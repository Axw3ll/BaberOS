"use server";
import { prisma } from "@/lib/prisma";
import { book, BookingError, slotsFor } from "@/lib/booking";
import { addDays, dateLabel, isDate, timeLabel, toLocalDate, today } from "@/lib/time";
import { allow, clientIp, verifyTurnstile } from "@/lib/guard";
import * as v from "@/lib/validate";
import { accessFor, canUsePanel } from "@/lib/billing";

const BUSY = "Demasiados intentos. Espera unos minutos y vuelve a intentar.";

/** Solo barberías con suscripción vigente reciben reservas en línea. */
async function shopBySlug(slug: string) {
  const shop = await prisma.barbershop.findUnique({ where: { slug } });
  return shop && canUsePanel(accessFor(shop)) ? shop : null;
}

async function candidates(shopId: string, serviceId: string, staffId: string) {
  const service = await prisma.service.findFirst({ where: { id: serviceId, shopId, active: true, bookableOnline: true } });
  if (!service) return [];
  return prisma.staff.findMany({
    where: { shopId, active: true, takesAppointments: true, services: { some: { serviceId } }, ...(staffId !== "any" && { id: staffId }) },
    orderBy: { name: "asc" },
  });
}

export async function publicSlots(input: { slug: string; serviceId: string; staffId: string; date: string }) {
  if (!(await allow(`slots:${await clientIp()}`, 120, 600))) return [];
  const shop = await shopBySlug(input.slug);
  if (!shop || !isDate(input.date)) return [];
  const t = today(shop.timezone);
  if (input.date < t || input.date > addDays(t, shop.maxAdvanceDays)) return [];

  const staff = await candidates(shop.id, input.serviceId, input.staffId);
  const byTime = new Map<number, string>();
  for (const s of staff) {
    const slots = await slotsFor({ shopId: shop.id, staffId: s.id, serviceIds: [input.serviceId], date: input.date });
    for (const t of slots) if (!byTime.has(t)) byTime.set(t, s.id);
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([t, staffId]) => ({ at: new Date(t).toISOString(), staffId }));
}

export async function publicBook(input: {
  slug: string; serviceId: string; staffId: string; at: string; name: string; phone: string; notes?: string;
  marketing?: boolean; website?: string; captcha?: string;
}): Promise<{ error: string } | { ok: true; summary: string; token: string }> {
  // Campo trampa: las personas no lo ven; los bots lo llenan
  if (input.website) return { error: "No se pudo reservar." };
  const vName = v.text(input.name, "tu nombre", { required: true, max: 80 });
  const vPhone = v.phone(input.phone, { required: true });
  const err = v.first(vName, vPhone);
  if (err) return { error: err };
  const ip = await clientIp();
  const phone = input.phone.replace(/\D/g, "");
  if (!(await allow(`book:ip:${ip}`, 8, 3600))) return { error: BUSY };
  if (!(await verifyTurnstile(input.captcha, ip))) return { error: "Confirma que no eres un robot e intenta de nuevo." };

  const shop = await shopBySlug(input.slug);
  if (!shop) return { error: "Esta barbería no existe." };
  if (!(await allow(`book:phone:${shop.id}:${phone}`, 4, 86_400))) return { error: BUSY };
  if (!(await allow(`book:shop:${shop.id}`, 60, 3600))) return { error: BUSY };
  // Máximo 2 citas futuras pendientes por teléfono: evita que alguien llene la agenda
  const upcoming = await prisma.appointment.count({
    where: { shopId: shop.id, customer: { phone }, startsAt: { gt: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } },
  });
  if (upcoming >= 2) return { error: "Ya tienes 2 citas próximas. Para agendar otra, llama a la barbería." };
  const at = new Date(input.at);
  if (Number.isNaN(at.getTime())) return { error: "Elige un horario." };
  const allowed = await candidates(shop.id, input.serviceId, input.staffId);
  if (!allowed.length) return { error: "Ese servicio ya no está disponible en línea." };

  try {
    const a = await book({
      shopId: shop.id, staffId: input.staffId, serviceIds: [input.serviceId], startsAt: at,
      customer: { name: input.name.slice(0, 80), phone: input.phone, acceptsMarketing: Boolean(input.marketing) },
      source: "ONLINE", notes: input.notes?.slice(0, 300),
      checkAvailability: { ignoreNotice: false, date: toLocalDate(at, shop.timezone) },
    });
    const staff = allowed.find((s) => s.id === a.staffId)!;
    return { ok: true, token: a.token, summary: `${dateLabel(toLocalDate(a.startsAt, shop.timezone))} a las ${timeLabel(a.startsAt, shop.timezone)} con ${staff.name}` };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}
