import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import { customerStats, daysToBirthday, fillTemplate } from "./crm";
import { dateLabel, timeLabel, toLocalDate, today } from "./time";
import type { Barbershop } from "@/generated/prisma/client";
import type { MessageKind } from "@/generated/prisma/enums";
import { sendTemplate, TEMPLATES, whatsappEnabled } from "./whatsapp";
import { stampRewardLabel } from "./loyalty";
import { accessFor, canUsePanel } from "./billing";

// ─────────────────────────────────────────────────────────────────────
// Mensajes automáticos
//
// syncOutbox() revisa la barbería y deja en la bandeja (outbound_messages) los mensajes que tocan:
// confirmación de reserva, recordatorios, "no llegaste", reseña, "ya toca tu corte" y cumpleaños.
// Es idempotente (dedupeKey): se puede llamar en cada visita a la pantalla o desde una tarea programada.
//
// Con WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID, /api/cron/mensajes los envía solos con plantillas
// aprobadas por Meta (ver lib/whatsapp.ts). Sin eso, se envían con un toque (wa.me) desde el panel.
// ─────────────────────────────────────────────────────────────────────

export const KIND: Record<MessageKind, { label: string; marketing: boolean }> = {
  CONFIRMATION: { label: "Reserva recibida", marketing: false },
  REMINDER_24H: { label: "Recordatorio un día antes", marketing: false },
  REMINDER_2H: { label: "Recordatorio 2 horas antes", marketing: false },
  NO_SHOW: { label: "No llegó", marketing: false },
  REVIEW: { label: "Reseña después de la visita", marketing: false },
  REBOOK: { label: "Ya le toca volver", marketing: true },
  BIRTHDAY: { label: "Cumpleaños", marketing: true },
  STAMP_ALMOST: { label: "Le falta un sello", marketing: true },
  STAMP_REWARD: { label: "Completó su tarjeta", marketing: true },
  STAMP_WELCOME: { label: "Empezó su tarjeta", marketing: false },
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

function apptMessage(kind: MessageKind, shop: Barbershop, a: ApptCtx, base: string): { body: string; params: string[] } {
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
  const cuando = `el ${v.fecha} a las ${v.hora}`;
  switch (kind) {
    case "CONFIRMATION":
      return { body: `Hola ${v.nombre}, recibimos tu reserva en ${v.barberia}: ${v.servicio}, ${cuando} con ${v.barbero}. Confírmala aquí: ${v.link}`,
        params: [v.nombre, v.barberia, v.servicio, cuando, v.barbero, v.link] };
    case "REMINDER_24H":
      return { body: `Hola ${v.nombre}, te recordamos tu cita en ${v.barberia} ${cuando} con ${v.barbero}. Confirma, cambia o cancela aquí: ${v.link}`,
        params: [v.nombre, v.barberia, cuando, v.barbero, v.link] };
    case "REMINDER_2H":
      return { body: `Hola ${v.nombre}, tu cita en ${v.barberia} es hoy a las ${v.hora}. ¡Te esperamos!${shop.address ? ` ${shop.address}` : ""}`,
        params: [v.nombre, v.barberia, v.hora] };
    case "NO_SHOW":
      return { body: `Hola ${v.nombre}, te esperábamos en ${v.barberia}. ¿Todo bien? Si quieres, aparta otro horario aquí: ${v.reservar}`,
        params: [v.nombre, v.barberia, v.reservar] };
    case "REVIEW": {
      const link = shop.googleReviewUrl ?? v.reservar;
      return {
        body: shop.googleReviewUrl
          ? `Gracias por venir a ${v.barberia}, ${v.nombre}. Si te gustó tu corte, nos ayudas muchísimo con una reseña: ${shop.googleReviewUrl}`
          : `Gracias por venir a ${v.barberia}, ${v.nombre}. ¿Cómo te quedó el corte? Cuéntanos respondiendo este mensaje.`,
        params: [v.nombre, v.barberia, link],
      };
    }
    default:
      return { body: "", params: [] };
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
  const drafts: { kind: MessageKind; key: string; customerId: string; appointmentId?: string; body: string; params: string[]; dueAt: Date }[] = [];

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
    drafts.push({ kind: "CONFIRMATION", key: `CONF:${a.id}`, customerId: a.customer.id, appointmentId: a.id, ...apptMessage("CONFIRMATION", shop, a, base), dueAt: a.createdAt });
  }
  for (const a of upcoming) {
    const t = a.startsAt.getTime();
    // El de 24 h no se manda si la cita se agendó hace menos de 4 h (ya recibió la confirmación)
    if (shop.autoReminder24h && t - now > 3 * H && now - a.createdAt.getTime() > 4 * H) {
      drafts.push({ kind: "REMINDER_24H", key: `R24:${a.id}`, customerId: a.customer.id, appointmentId: a.id, ...apptMessage("REMINDER_24H", shop, a, base), dueAt: new Date(t - 24 * H) });
    }
    if (shop.autoReminder2h && t - now <= 3 * H) {
      drafts.push({ kind: "REMINDER_2H", key: `R2:${a.id}`, customerId: a.customer.id, appointmentId: a.id, ...apptMessage("REMINDER_2H", shop, a, base), dueAt: new Date(t - 2 * H) });
    }
  }

  // "No llegó": solo si no tiene otra cita ya agendada
  const futureCustomers = new Set((await prisma.appointment.findMany({
    where: { shopId: shop.id, startsAt: { gt: new Date(now) }, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { customerId: true }, distinct: ["customerId"],
  })).map((x) => x.customerId));
  for (const a of missed) {
    if (futureCustomers.has(a.customer.id)) continue;
    drafts.push({ kind: "NO_SHOW", key: `NS:${a.id}`, customerId: a.customer.id, appointmentId: a.id, ...apptMessage("NO_SHOW", shop, a, base), dueAt: new Date(a.startsAt.getTime() + H) });
  }

  // Reseña: una vez cada 90 días por cliente
  if (done.length) {
    const recent = new Set((await prisma.outboundMessage.findMany({
      where: { shopId: shop.id, kind: "REVIEW", createdAt: { gt: new Date(now - 90 * D) } }, select: { customerId: true },
    })).map((m) => m.customerId));
    for (const a of done) {
      if (recent.has(a.customer.id)) continue;
      recent.add(a.customer.id);
      drafts.push({ kind: "REVIEW", key: `REV:${a.id}`, customerId: a.customer.id, appointmentId: a.id, ...apptMessage("REVIEW", shop, a, base), dueAt: new Date(a.endsAt.getTime() + 2 * H) });
    }
  }

  // "Ya toca" y cumpleaños: solo a quien acepta promociones
  if (shop.autoRebook || shop.autoBirthday) {
    const stats = await customerStats(shop.id, { lostAfterDays: shop.lostAfterDays });
    const day = today(tz);
    const vars = (c: { name: string; points: number; token: string }) => ({ nombre: c.name, barberia: shop.name, enlace: `${base}/mi/${c.token}`, puntos: c.points });
    for (const c of stats) {
      if (!c.acceptsMarketing) continue;
      if (shop.autoRebook && (c.stage === "activo" || c.stage === "nuevo") && c.expectedBack && c.lastVisit && !futureCustomers.has(c.id)) {
        const back = c.expectedBack.getTime();
        if (back - now <= D && now - back <= 4 * D) {
          drafts.push({ kind: "REBOOK", key: `RB:${c.id}:${toLocalDate(c.lastVisit, tz)}`, customerId: c.id, body: fillTemplate(REBOOK_TEXT, vars(c)), params: [c.name.split(/\s+/)[0], shop.name, `${base}/mi/${c.token}`], dueAt: new Date(back - D) });
        }
      }
      if (shop.autoBirthday && c.birthday && daysToBirthday(c.birthday, day) === 0) {
        drafts.push({ kind: "BIRTHDAY", key: `BD:${c.id}:${day.slice(0, 4)}`, customerId: c.id, body: fillTemplate(BIRTHDAY_TEXT, vars(c)), params: [c.name.split(/\s+/)[0], shop.name, `${base}/mi/${c.token}`], dueAt: new Date(now) });
      }
    }
  }

  // Tarjeta de sellos: bienvenida (primer sello), "te falta 1" y "ganaste tu premio", justo después del sello que lo provocó
  if (shop.loyaltyMode === "STAMPS" && shop.autoLoyaltyMsgs) {
    const recent = await prisma.$queryRaw<{ id: string; customerId: string; balance: number; name: string; stamps: number; stampRewards: number; token: string; acceptsMarketing: boolean; firstStamp: boolean }[]>`
      SELECT DISTINCT ON (m."customerId") m.id, m."customerId", m.balance, c.name, c.stamps, c."stampRewards", c.token, c."acceptsMarketing",
             NOT EXISTS (SELECT 1 FROM loyalty_movements o WHERE o."customerId" = m."customerId" AND o.kind = 'STAMP' AND o.id <> m.id) AS "firstStamp"
        FROM loyalty_movements m JOIN customers c ON c.id = m."customerId"
       WHERE m."shopId" = ${shop.id}::uuid AND m.kind = 'STAMP' AND m.points > 0 AND m."createdAt" > now() - interval '3 days'
       ORDER BY m."customerId", m."createdAt" DESC`;
    const premio = stampRewardLabel(shop);
    for (const r of recent) {
      const enlace = `${base}/mi/${r.token}`;
      const nombre = r.name.split(/\s+/)[0];
      // Solo si el último movimiento sigue vigente (no se canceló la venta después)
      if (r.balance !== r.stamps) continue;
      // Primer sello de su vida: le damos su tarjeta. Es información de su cuenta, no promoción: va a todos (una sola vez)
      if (r.firstStamp && r.stamps === 1 && r.stampRewards === 0) {
        drafts.push({ kind: "STAMP_WELCOME", key: `SW:${r.customerId}`, customerId: r.customerId, dueAt: new Date(now),
          body: `¡${nombre}, empezaste tu tarjeta en ${shop.name}! Llevas 1 de ${shop.stampsRequired} sellos para tu ${premio}. Aquí la ves cuando quieras: ${enlace}`,
          params: [nombre, shop.name, `1 de ${shop.stampsRequired}`, premio, enlace] });
        continue;
      }
      if (!r.acceptsMarketing) continue;
      if (r.stampRewards > 0 && r.stamps === 0) {
        drafts.push({ kind: "STAMP_REWARD", key: `SR:${r.id}`, customerId: r.customerId, dueAt: new Date(now),
          body: `¡${nombre}, completaste tu tarjeta en ${shop.name}! En tu próxima visita tienes ${premio}. Aparta tu lugar: ${enlace}`,
          params: [nombre, shop.name, premio, enlace] });
      } else if (r.stamps === shop.stampsRequired - 1) {
        drafts.push({ kind: "STAMP_ALMOST", key: `SA:${r.id}`, customerId: r.customerId, dueAt: new Date(now),
          body: `Hola ${nombre}, ¡te falta un solo sello en ${shop.name} para tu ${premio}! Aparta tu próxima visita: ${enlace}`,
          params: [nombre, shop.name, premio, enlace] });
      }
    }
  }

  let created = 0;
  if (drafts.length) {
    const r = await prisma.outboundMessage.createMany({
      data: drafts.map((d) => ({ shopId: shop.id, customerId: d.customerId, appointmentId: d.appointmentId, kind: d.kind, dedupeKey: d.key, body: d.body, params: d.params, dueAt: d.dueAt })),
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
                AND (a.status IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') OR a."startsAt" < now())))
       -- Avisos de la tarjeta que ya no aplican (canceló la venta, ya usó el premio, cambió el programa)
       OR (m.kind = 'STAMP_ALMOST' AND EXISTS (SELECT 1 FROM customers c WHERE c.id = m."customerId"
             AND (c.stamps <> ${shop.stampsRequired - 1} OR ${shop.loyaltyMode}::text <> 'STAMPS')))
       OR (m.kind = 'STAMP_REWARD' AND EXISTS (SELECT 1 FROM customers c WHERE c.id = m."customerId"
             AND (c."stampRewards" = 0 OR ${shop.loyaltyMode}::text <> 'STAMPS'))))`;
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

// ── Envío automático por la API de WhatsApp de Meta ───────────────────

export const autoSendEnabled = whatsappEnabled;

/** Envía lo que ya tocó. Reintenta errores temporales (hasta 3 veces) y descarta los permanentes. */
export async function deliverPending(shopId: string) {
  let sent = 0, failed = 0;
  for (const m of await pendingMessages(shopId)) {
    const params = Array.isArray(m.params) ? (m.params as string[]) : [];
    // Mensajes preparados antes de conectar WhatsApp no traen variables: se quedan para enviarse a mano
    if (params.length !== TEMPLATES[m.kind].vars.length) continue;
    const r = await sendTemplate(m.customer.phone, m.kind, params);
    if (r.ok) {
      await prisma.$transaction([
        prisma.outboundMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), error: null } }),
        prisma.customerActivity.create({ data: { shopId, customerId: m.customerId, type: "WHATSAPP", body: `Automático: ${m.body}` } }),
      ]);
      sent++;
    } else {
      const attempts = m.attempts + 1;
      await prisma.outboundMessage.update({
        where: { id: m.id },
        data: { attempts, error: r.error.slice(0, 300), ...((r.permanent || attempts >= 3) && { status: "SKIPPED" }) },
      });
      failed++;
    }
  }
  return { sent, failed };
}

/** Para la tarea programada: prepara los mensajes de todas las barberías y, si hay API, los envía. */
export async function runAutomations(base: string) {
  const shops = await prisma.barbershop.findMany();
  let created = 0, sent = 0, failed = 0;
  for (const shop of shops) {
    if (!canUsePanel(accessFor(shop))) continue; // barberías vencidas no envían
    created += await syncOutbox(shop, base);
    if (!autoSendEnabled()) continue;
    const r = await deliverPending(shop.id);
    sent += r.sent; failed += r.failed;
  }
  return { shops: shops.length, created, sent, failed, autoSend: autoSendEnabled() };
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
