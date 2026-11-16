import "server-only";
import { prisma } from "./prisma";
import { toLocalDate } from "./time";
import type { ActivityType, CustomerOrigin } from "@/generated/prisma/enums";

// ── Etapas del cliente ───────────────────────────────────────────────
// Una "visita" es una cita terminada o una venta pagada sin cita (cliente sin cita).

export type Stage = "sin_visitas" | "nuevo" | "activo" | "en_riesgo" | "perdido";

export const STAGE: Record<Stage, { label: string; color: string; hint: string }> = {
  sin_visitas: { label: "Sin visitas", color: "var(--color-faint)", hint: "Registrados que aún no vienen" },
  nuevo: { label: "Nuevo", color: "var(--color-brand)", hint: "Primera visita en los últimos 30 días" },
  activo: { label: "Activo", color: "var(--color-success)", hint: "Vienen con su frecuencia habitual" },
  en_riesgo: { label: "En riesgo", color: "var(--color-warning)", hint: "Ya se tardaron más de lo normal" },
  perdido: { label: "Perdido", color: "var(--color-danger)", hint: "No vienen desde hace mucho" },
};

export const ORIGIN: Record<CustomerOrigin, string> = {
  WALK_BY: "Pasó por la calle",
  REFERRAL: "Recomendación",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  GOOGLE: "Google / Maps",
  ONLINE_BOOKING: "Reserva en línea",
  OTHER: "Otro",
};

export const ACTIVITY: Record<ActivityType, string> = {
  NOTE: "Nota",
  CALL: "Llamada",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "Email",
  COMPLAINT: "Queja",
};

export const TAG_COLORS = ["nickel", "sage", "rose", "sand", "ash"] as const;
/** Los valores guardados en la base conservan sus nombres originales; aquí se traducen al tema. */
const TAG_TOKEN: Record<string, string> = { nickel: "brand", sage: "success", rose: "danger", sand: "warning", ash: "faint" };
export const TAG_LABEL: Record<(typeof TAG_COLORS)[number], string> = { nickel: "Índigo", sage: "Verde", rose: "Rojo", sand: "Ámbar", ash: "Gris" };
export const tagColor = (c: string) => `var(--color-${TAG_TOKEN[c] ?? "brand"})`;

const DAY = 86_400_000;

export type CustomerStats = {
  id: string; name: string; phone: string; email: string | null; token: string;
  birthday: Date | null; acceptsMarketing: boolean; points: number; createdAt: Date;
  visits: number; firstVisit: Date | null; lastVisit: Date | null; spent: number; noShows: number;
  /** Días promedio entre visitas (null con menos de 2) */
  cadence: number | null;
  daysSince: number | null;
  /** Cuándo debería volver según su frecuencia */
  expectedBack: Date | null;
  stage: Stage;
  vip: boolean;
  tagIds: string[];
};

type Row = {
  id: string; name: string; phone: string; email: string | null; token: string; birthday: Date | null;
  acceptsMarketing: boolean; points: number; createdAt: Date;
  visits: number; first: Date | null; last: Date | null; spent: string | null; no_shows: number; tag_ids: string[] | null;
};

export function classify(r: { visits: number; first: Date | null; last: Date | null }, lostAfterDays: number, now = Date.now()) {
  const cadence = r.visits >= 2 && r.first && r.last
    ? Math.max(7, Math.round((r.last.getTime() - r.first.getTime()) / DAY / (r.visits - 1)))
    : null;
  const daysSince = r.last ? Math.floor((now - r.last.getTime()) / DAY) : null;
  const expected = cadence ?? 30;
  const expectedBack = r.last ? new Date(r.last.getTime() + expected * DAY) : null;

  let stage: Stage;
  if (!r.visits || daysSince === null) stage = "sin_visitas";
  else if (daysSince > lostAfterDays) stage = "perdido";
  else if (daysSince > Math.max(expected * 1.5, expected + 14)) stage = "en_riesgo";
  else if (r.first && now - r.first.getTime() <= 30 * DAY && r.visits <= 2) stage = "nuevo";
  else stage = "activo";
  return { cadence, daysSince, expectedBack, stage };
}

/** Estadísticas de todos los clientes de la barbería (o de uno). */
export async function customerStats(shopId: string, opts: { customerId?: string; lostAfterDays: number }): Promise<CustomerStats[]> {
  const one = opts.customerId ?? null;
  // Para un solo cliente, el umbral VIP (que mira a toda la barbería) se pide al mismo tiempo
  const thresholdForOne = one ? vipThreshold(shopId, null) : null;
  const rows = await prisma.$queryRaw<Row[]>`
    WITH visits AS (
      SELECT "customerId" AS cid, "startsAt" AS at FROM appointments
       WHERE "shopId" = ${shopId}::uuid AND status = 'COMPLETED'
      UNION ALL
      SELECT "customerId", "createdAt" FROM sales
       WHERE "shopId" = ${shopId}::uuid AND status = 'PAID' AND "appointmentId" IS NULL AND "customerId" IS NOT NULL
    )
    SELECT c.id, c.name, c.phone, c.email, c.token, c.birthday, c."acceptsMarketing", c.points, c."createdAt",
           COALESCE(v.visits, 0)::int AS visits, v.first, v.last,
           s.spent::text AS spent, COALESCE(n.no_shows, 0)::int AS no_shows, t.tag_ids
      FROM customers c
      LEFT JOIN (SELECT cid, count(*) AS visits, min(at) AS first, max(at) AS last FROM visits GROUP BY cid) v ON v.cid = c.id
      LEFT JOIN (SELECT "customerId", sum(total) AS spent FROM sales
                  WHERE "shopId" = ${shopId}::uuid AND status = 'PAID' GROUP BY 1) s ON s."customerId" = c.id
      LEFT JOIN (SELECT "customerId", count(*) AS no_shows FROM appointments
                  WHERE "shopId" = ${shopId}::uuid AND status = 'NO_SHOW' GROUP BY 1) n ON n."customerId" = c.id
      LEFT JOIN (SELECT "customerId", array_agg("tagId"::text) AS tag_ids FROM customer_tags GROUP BY 1) t ON t."customerId" = c.id
     WHERE c."shopId" = ${shopId}::uuid AND (${one}::uuid IS NULL OR c.id = ${one}::uuid)`;

  const now = Date.now();
  const stats = rows.map((r): CustomerStats => {
    const k = classify(r, opts.lostAfterDays, now);
    return {
      id: r.id, name: r.name, phone: r.phone, email: r.email, token: r.token, birthday: r.birthday,
      acceptsMarketing: r.acceptsMarketing, points: r.points, createdAt: r.createdAt,
      visits: r.visits, firstVisit: r.first, lastVisit: r.last, spent: Number(r.spent ?? 0), noShows: r.no_shows,
      ...k, vip: false, tagIds: r.tag_ids ?? [],
    };
  });

  // VIP: el 10% que más gasta, con al menos 3 visitas. Con un solo cliente se compara contra toda la barbería.
  const threshold = await (thresholdForOne ?? vipThreshold(shopId, stats));
  for (const s of stats) s.vip = s.visits >= 3 && threshold > 0 && s.spent >= threshold;
  return stats;
}

async function vipThreshold(shopId: string, stats: CustomerStats[] | null) {
  if (stats) {
    const spent = stats.filter((s) => s.spent > 0).map((s) => s.spent).sort((a, b) => b - a);
    if (spent.length < 5) return 0;
    return spent[Math.max(0, Math.ceil(spent.length * 0.1) - 1)];
  }
  const [r] = await prisma.$queryRaw<{ p: string | null; n: number }[]>`
    SELECT percentile_disc(0.9) WITHIN GROUP (ORDER BY spent)::text AS p, count(*)::int AS n FROM (
      SELECT sum(total) AS spent FROM sales WHERE "shopId" = ${shopId}::uuid AND status = 'PAID' AND "customerId" IS NOT NULL
      GROUP BY "customerId") x`;
  return r && r.n >= 5 ? Number(r.p) : 0;
}

// ── Segmentos (para filtros y campañas) ──────────────────────────────

export type Segment = Stage | "todos" | "vip" | "cumple_mes" | `tag:${string}`;

export const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "activo", label: STAGE.activo.label },
  { id: "nuevo", label: STAGE.nuevo.label },
  { id: "vip", label: "VIP" },
  { id: "en_riesgo", label: STAGE.en_riesgo.label },
  { id: "perdido", label: STAGE.perdido.label },
  { id: "sin_visitas", label: STAGE.sin_visitas.label },
  { id: "cumple_mes", label: "Cumplen este mes" },
];

export function inSegment(s: CustomerStats, seg: string, tz: string) {
  if (seg === "todos" || !seg) return true;
  if (seg === "vip") return s.vip;
  if (seg === "cumple_mes") return !!s.birthday && birthdayMonth(s.birthday) === Number(toLocalDate(new Date(), tz).slice(5, 7));
  if (seg.startsWith("tag:")) return s.tagIds.includes(seg.slice(4));
  return s.stage === seg;
}

export function segmentLabel(seg: string, tags: { id: string; name: string }[]) {
  if (seg.startsWith("tag:")) return `Etiqueta: ${tags.find((t) => t.id === seg.slice(4))?.name ?? "borrada"}`;
  return SEGMENTS.find((s) => s.id === seg)?.label ?? seg;
}

// ── Cumpleaños ───────────────────────────────────────────────────────
// `birthday` es @db.Date: llega como medianoche UTC, así que se leen los campos UTC.

export const birthdayMonth = (b: Date) => b.getUTCMonth() + 1;
export const birthdayLabel = (b: Date) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" }).format(b);

/** Días que faltan para su próximo cumpleaños (0 = hoy), según la fecha local de la barbería. */
export function daysToBirthday(b: Date, todayLocal: string) {
  const [y, m, d] = todayLocal.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  let next = Date.UTC(y, b.getUTCMonth(), b.getUTCDate());
  if (next < t) next = Date.UTC(y + 1, b.getUTCMonth(), b.getUTCDate());
  return Math.round((next - t) / DAY);
}

/** "YYYY-MM-DD" o "MM-DD" → Date (año 1900 si no hay año). */
export function parseBirthday(v: FormDataEntryValue | null): Date | null | "invalid" {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/);
  if (!m) return "invalid";
  const d = new Date(Date.UTC(m[1] ? Number(m[1]) : 1900, Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getTime() > Date.now()) return "invalid";
  return d;
}

// ── Mensajes ─────────────────────────────────────────────────────────

export const TEMPLATE_VARS = ["{nombre}", "{barberia}", "{enlace}", "{puntos}"];

export const QUICK_MESSAGES: { id: string; label: string; text: string }[] = [
  { id: "extrañamos", label: "Te extrañamos", text: "¡Hola {nombre}! Hace rato que no te vemos en {barberia}. ¿Te apartamos un lugar esta semana? Reserva aquí: {enlace}" },
  { id: "cumple", label: "Cumpleaños", text: "¡Feliz cumpleaños, {nombre}! De parte de todo {barberia}. Ven esta semana y te consentimos. {enlace}" },
  { id: "gracias", label: "Gracias por venir", text: "Gracias por visitarnos, {nombre}. ¿Cómo te quedó el corte? Nos ayuda mucho tu opinión. Te esperamos en {barberia}." },
  { id: "volver", label: "Ya toca corte", text: "Hola {nombre}, ya toca tu corte. Aparta tu horario en {barberia}: {enlace}" },
  { id: "noshow", label: "No llegó", text: "Hola {nombre}, te esperábamos hoy en {barberia}. ¿Todo bien? Si quieres reagendar, aquí tienes los horarios: {enlace}" },
];

export function fillTemplate(text: string, v: { nombre: string; barberia: string; enlace: string; puntos?: number }) {
  return text
    .replaceAll("{nombre}", v.nombre.split(/\s+/)[0] ?? v.nombre)
    .replaceAll("{barberia}", v.barberia)
    .replaceAll("{enlace}", v.enlace)
    .replaceAll("{puntos}", String(v.puntos ?? 0));
}

/** Enlace wa.me. Números de 10 dígitos se toman como México (+52). */
export function whatsappUrl(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function bookingUrl(slug: string) {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/b/${slug}`;
}

// ── Lealtad ──────────────────────────────────────────────────────────

export const loyaltyOn = (shop: { loyaltyMode: string; loyaltyPointsPerPeso: { toString(): string } }) =>
  shop.loyaltyMode === "POINTS" && Number(shop.loyaltyPointsPerPeso.toString()) > 0;
export const stampsOn = (shop: { loyaltyMode: string }) => shop.loyaltyMode === "STAMPS";
