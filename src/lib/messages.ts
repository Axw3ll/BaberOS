import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import { customerStats, daysToBirthday, fillTemplate } from "./crm";
import { dateLabel, timeLabel, toLocalDate, today } from "./time";
import type { Barbershop } from "@/generated/prisma/client";
import type { MessageKind } from "@/generated/prisma/enums";

// ─────────────────────────────────────────────────────────────────────
// Mensajes automáticos
//
// syncOutbox() revisa la barbería y deja en la bandeja (outbound_messages) los mensajes que tocan:
// confirmación de reserva, recordatorios, "no llegaste", reseña, "ya toca tu corte" y cumpleaños.
// Es idempotente (dedupeKey): se puede llamar en cada visita a la pantalla o desde una tarea programada.
//
// Hoy se envían con un toque (wa.me). Cuando se conecte la API de WhatsApp de Meta, basta con
// implementar `sendWhatsApp` y llamar a deliverPending() desde /api/cron/mensajes.
// ─────────────────────────────────────────────────────────────────────

export const KIND: Record<MessageKind, { label: string; marketing: boolean }> = {
  CONFIRMATION: { label: "Reserva recibida", marketing: false },
  REMINDER_24H: { label: "Recordatorio un día antes", marketing: false },
  REMINDER_2H: { label: "Recordatorio 2 horas antes", marketing: false },
  NO_SHOW: { label: "No llegó", marketing: false },
  REVIEW: { label: "Reseña después de la visita", marketing: false },
  REBOOK: { label: "Ya le toca volver", marketing: true },
  BIRTHDAY: { label: "Cumpleaños", marketing: true },
};

const H = 3_600_000, D = 24 * H;

/** URL pública: la configurada o, si no hay, la de la petición actual. */
export async function baseUrl() {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  try {
    const h = await headers();
    return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  } catch {
    return "";
  }
}

type ApptCtx = { id: string; token: string; startsAt: Date; customer: { id: string; name: string }; staff: { name: string }; services: { name: string }[] };

function apptText(kind: MessageKind, shop: Barbershop, a: ApptCtx, base: string) {
  const tz = shop.timezone;
  const v = {
    nombre: a.customer.name.split(/\s+/)[0] ?? a.customer.name,
    barberia: shop.name,
    servicio: a.services.map((s) => s.name).join(", "),
    fecha: dateLabel(toLocalDate(a.startsAt, tz), { weekday: "long", day: "numeric", month: "long" }).toLowerCase(),
    hora: timeLabel(a.startsAt, tz),
    barbero: a.staff.name.split(/\s+/)[0],
    link: `${base}/c/${a.token}`,
    reservar: `${base}/b/${shop.slug}`,
  };
  switch (kind) {
    case "CONFIRMATION":
      return `Hola ${v.nombre}, recibimos tu reserva en ${v.barberia}: ${v.servicio}, el ${v.fecha} a las ${v.hora} con ${v.barbero}. Confírmala aquí: ${v.link}`;
    case "REMINDER_24H":
      return `Hola ${v.nombre}, te recordamos tu cita en ${v.barberia} el ${v.fecha} a las ${v.hora} con ${v.barbero}. Confirma, cambia o cancela aquí: ${v.link}`;
    case "REMINDER_2H":
      return `Hola ${v.nombre}, tu cita en ${v.barberia} es hoy a las ${v.hora}. ¡Te esperamos!${shop.address ? ` ${shop.address}` : ""}`;
    case "NO_SHOW":
      return `Hola ${v.nombre}, te esperábamos en ${v.barberia}. ¿Todo bien? Si quieres, aparta otro horario aquí: ${v.reservar}`;
    case "REVIEW":
      return shop.googleReviewUrl
        ? `Gracias por venir a ${v.barberia}, ${v.nombre}. Si te gustó tu corte, nos ayudas muchísimo con una reseña: ${shop.googleReviewUrl}`
        : `Gracias por venir a ${v.barberia}, ${v.nombre}. ¿Cómo te quedó el corte? Cuéntanos respondiendo este mensaje.`;
    default:
      return "";
  }
}

const REBOOK_TEXT = "Hola {nombre}, ya toca tu corte. Aparta tu lugar en {barberia}: {enlace}";
const BIRTHDAY_TEXT = "¡Feliz cumpleaños, {nombre}! De parte de todo {barberia}. Ven esta semana y te consentimos. {enlace}";

/** Prepara los mensajes que tocan para una barbería. Devuelve cuántos nuevos creó. */
export async function syncOutbox(shop: Barbershop, baseOverride?: string) {
  const now = Date.now();
  const base = baseOverride ?? (await baseUrl());
  const tz = shop.timezone;
  const include = { customer: { select: { id: true, name: true } }, staff: { select: { name: true } }, services: { select: { name: true } } } as const;
  const drafts: { kind: MessageKind; key: string; customerId: string; appointmentId?: string; body: string; dueAt: Date }[] = [];

  const [online, upcoming, missed, done] = await Promise.all([
    // Reservas en línea recientes, aún por venir
    prisma.appointment.findMany({
      where: { shopId: shop.id, source: "ONLINE", status: { in: ["PENDING", "CONFIRMED"] }, createdAt: { gt: new Date(now - 2 * D) }, startsAt: { gt: new Date(now) } },
      include,
    }),
    // Citas de las próximas 26 h
    prisma.appointment.findMany({
      where: { shopId: shop.id, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gt: new Date(now), lt: new Date(now + 26 * H) } },
      include,
    }),
    shop.autoNoShow
      ? prisma.appointment.findMany({ where: { shopId: shop.id, status: "NO_SHOW", startsAt: { gt: new Date(now - 3 * D), lt: new Date(now) } }, include })
      : [],
    shop.autoReview
      ? prisma.appointment.findMany({ where: { shopId: shop.id, status: "COMPLETED", endsAt: { gt: new Date(now - 2 * D), lt: new Date(now) } }, include })
      : [],
  ]);

  for (const a of online) {
    drafts.push({ kind: "CONFIRMATION", key: `CONF:${a.id}`, customerId: a.customer.id, appointmentId: a.id, body: apptText("CONFIRMATION", shop, a, base), dueAt: a.createdAt });
  }
  for (const a of upcoming) {
    const t = a.startsAt.getTime();
    // El de 24 h no se manda si la cita se agendó hace menos de 4 h (ya recibió la confirmación)
    if (shop.autoReminder24h && t - now > 3 * H && now - a.createdAt.getTime() > 4 * H) {
      drafts.push({ kind: "REMINDER_24H", key: `R24:${a.id}`, customerId: a.customer.id, appointmentId: a.id, body: apptText("REMINDER_24H", shop, a, base), dueAt: new Date(t - 24 * H) });
    }
    if (shop.autoReminder2h && t - now <= 3 * H) {
      drafts.push({ kind: "REMINDER_2H", key: `R2:${a.id}`, customerId: a.customer.id, appointmentId: a.id, body: apptText("REMINDER_2H", shop, a, base), dueAt: new Date(t - 2 * H) });
    }
  }

  // "No llegó": solo si no tiene otra cita ya agendada
  const futureCustomers = new Set((await prisma.appointment.findMany({
    where: { shopId: shop.id, startsAt: { gt: new Date(now) }, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { customerId: true }, distinct: ["customerId"],
  })).map((x) => x.customerId));
  for (const a of missed) {
    if (futureCustomers.has(a.customer.id)) continue;
    drafts.push({ kind: "NO_SHOW", key: `NS:${a.id}`, customerId: a.customer.id, appointmentId: a.id, body: apptText("NO_SHOW", shop, a, base), dueAt: new Date(a.startsAt.getTime() + H) });
  }

  // Reseña: una vez cada 90 días por cliente
  if (done.length) {
    const recent = new Set((await prisma.outboundMessage.findMany({
      where: { shopId: shop.id, kind: "REVIEW", createdAt: { gt: new Date(now - 90 * D) } }, select: { customerId: true },
    })).map((m) => m.customerId));
    for (const a of done) {
      if (recent.has(a.customer.id)) continue;
      recent.add(a.customer.id);
      drafts.push({ kind: "REVIEW", key: `REV:${a.id}`, customerId: a.customer.id, appointmentId: a.id, body: apptText("REVIEW", shop, a, base), dueAt: new Date(a.endsAt.getTime() + 2 * H) });
    }
  }

  // "Ya toca" y cumpleaños: solo a quien acepta promociones
  if (shop.autoRebook || shop.autoBirthday) {
    const stats = await customerStats(shop.id, { lostAfterDays: shop.lostAfterDays });
    const day = today(tz);
    const vars = (c: { name: string; points: number }) => ({ nombre: c.name, barberia: shop.name, enlace: `${base}/b/${shop.slug}`, puntos: c.points });
    for (const c of stats) {
      if (!c.acceptsMarketing) continue;
      if (shop.autoRebook && (c.stage === "activo" || c.stage === "nuevo") && c.expectedBack && c.lastVisit && !futureCustomers.has(c.id)) {
        const back = c.expectedBack.getTime();
        if (back - now <= D && now - back <= 4 * D) {
          drafts.push({ kind: "REBOOK", key: `RB:${c.id}:${toLocalDate(c.lastVisit, tz)}`, customerId: c.id, body: fillTemplate(REBOOK_TEXT, vars(c)), dueAt: new Date(back - D) });
        }
      }
      if (shop.autoBirthday && c.birthday && daysToBirthday(c.birthday, day) === 0) {
        drafts.push({ kind: "BIRTHDAY", key: `BD:${c.id}:${day.slice(0, 4)}`, customerId: c.id, body: fillTemplate(BIRTHDAY_TEXT, vars(c)), dueAt: new Date(now) });
      }
    }
  }

  let created = 0;
  if (drafts.length) {
    const r = await prisma.outboundMessage.createMany({
      data: drafts.map((d) => ({ shopId: shop.id, customerId: d.customerId, appointmentId: d.appointmentId, kind: d.kind, dedupeKey: d.key, body: d.body, dueAt: d.dueAt })),
      skipDuplicates: true,
    });
    created = r.count;
  }

  // Lo que ya no tiene sentido mandar: citas canceladas o pasadas, y pendientes de hace más de 3 días
  await prisma.$executeRaw`
    UPDATE outbound_messages m SET status = 'SKIPPED'
     WHERE m."shopId" = ${shop.id}::uuid AND m.status = 'PENDING' AND (
       m."createdAt" < now() - interval '3 days'
       OR (m.kind IN ('CONFIRMATION', 'REMINDER_24H', 'REMINDER_2H') AND EXISTS (
             SELECT 1 FROM appointments a WHERE a.id = m."appointmentId"
                AND (a.status IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') OR a."startsAt" < now()))))`;
  return created;
}

/** Mensajes listos para enviar (ya llegó su hora). */
export function pendingMessages(shopId: string, opts: { staffId?: string } = {}) {
  return prisma.outboundMessage.findMany({
    where: {
      shopId, status: "PENDING", dueAt: { lte: new Date() },
      // Un barbero ve solo los de sus citas
      ...(opts.staffId && { appointment: { staffId: opts.staffId } }),
    },
    include: { customer: { select: { id: true, name: true, phone: true } }, appointment: { select: { startsAt: true, staff: { select: { name: true } } } } },
    orderBy: [{ dueAt: "asc" }],
    take: 200,
  });
}

// ── Envío automático (pendiente: API de WhatsApp de Meta) ────────────

/** Devuelve true si se envió. Mientras no haya API configurada, no envía nada. */
async function sendWhatsApp(_phone: string, _body: string): Promise<boolean> {
  return false;
}
export const autoSendEnabled = false;

/** Para la tarea programada: prepara y, si hay API, envía. */
export async function runAutomations(base: string) {
  const shops = await prisma.barbershop.findMany();
  let created = 0, sent = 0;
  for (const shop of shops) {
    created += await syncOutbox(shop, base);
    if (!autoSendEnabled) continue;
    for (const m of await pendingMessages(shop.id)) {
      if (await sendWhatsApp(m.customer.phone, m.body)) {
        await prisma.outboundMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date() } });
        sent++;
      }
    }
  }
  return { shops: shops.length, created, sent };
}

// Preparación en segundo plano mientras alguien usa el panel (sin esperar a la tarea programada)
const lastSync = new Map<string, number>();
/** `base` se calcula durante la petición: en segundo plano ya no hay encabezados de dónde sacar el dominio. */
export function syncSoon(shop: Barbershop, base: string) {
  const last = lastSync.get(shop.id) ?? 0;
  if (Date.now() - last < 5 * 60_000) return;
  lastSync.set(shop.id, Date.now());
  return syncOutbox(shop, base).catch((e) => console.error("syncOutbox", e));
}
