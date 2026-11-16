import "server-only";
import type { MessageKind } from "@/generated/prisma/enums";

// ─────────────────────────────────────────────────────────────────────
// WhatsApp Cloud API (Meta)
//
// Meta solo deja que un negocio inicie la conversación con PLANTILLAS APROBADAS.
// Cada tipo de mensaje usa una plantilla con variables {{1}}, {{2}}, … en este orden.
// Créalas en Meta Business → WhatsApp Manager → Plantillas, en español (México), con estos nombres
// (o cambia los nombres con las variables WHATSAPP_TPL_*). El texto de cada una está en el README.
//
// Variables de entorno: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID y, opcional, WHATSAPP_API_VERSION.
// ─────────────────────────────────────────────────────────────────────

export const TEMPLATES: Record<MessageKind, { name: string; vars: string[] }> = {
  CONFIRMATION: { name: process.env.WHATSAPP_TPL_CONFIRMATION || "barberos_confirmacion", vars: ["nombre", "barbería", "servicio", "fecha y hora", "barbero", "enlace de la cita"] },
  REMINDER_24H: { name: process.env.WHATSAPP_TPL_REMINDER_24H || "barberos_recordatorio", vars: ["nombre", "barbería", "fecha y hora", "barbero", "enlace de la cita"] },
  REMINDER_2H: { name: process.env.WHATSAPP_TPL_REMINDER_2H || "barberos_recordatorio_hoy", vars: ["nombre", "barbería", "hora"] },
  NO_SHOW: { name: process.env.WHATSAPP_TPL_NO_SHOW || "barberos_no_llego", vars: ["nombre", "barbería", "enlace para reservar"] },
  REVIEW: { name: process.env.WHATSAPP_TPL_REVIEW || "barberos_resena", vars: ["nombre", "barbería", "enlace de reseña"] },
  REBOOK: { name: process.env.WHATSAPP_TPL_REBOOK || "barberos_ya_toca", vars: ["nombre", "barbería", "enlace para reservar"] },
  BIRTHDAY: { name: process.env.WHATSAPP_TPL_BIRTHDAY || "barberos_cumpleanos", vars: ["nombre", "barbería", "enlace para reservar"] },
  STAMP_ALMOST: { name: process.env.WHATSAPP_TPL_STAMP_ALMOST || "barberos_falta_sello", vars: ["nombre", "barbería", "premio", "enlace para reservar"] },
  STAMP_REWARD: { name: process.env.WHATSAPP_TPL_STAMP_REWARD || "barberos_premio", vars: ["nombre", "barbería", "premio", "enlace para reservar"] },
  QUEUE_NEXT: { name: process.env.WHATSAPP_TPL_QUEUE_NEXT || "barberos_fila_turno", vars: ["nombre", "barbería", "lugar en la fila", "enlace de la fila"] },
  WAITLIST_OPEN: { name: process.env.WHATSAPP_TPL_WAITLIST || "barberos_lugar_libre", vars: ["nombre", "barbería", "día y hora", "enlace para reservar"] },
  STAMP_WELCOME: { name: process.env.WHATSAPP_TPL_STAMP_WELCOME || "barberos_bienvenida_tarjeta", vars: ["nombre", "barbería", "avance", "premio", "enlace de la tarjeta"] },
};

export const whatsappEnabled = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** 10 dígitos de México → formato internacional que pide WhatsApp. */
export function toWhatsAppNumber(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `52${d}` : d;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string; permanent: boolean };

export async function sendTemplate(phone: string, kind: MessageKind, params: string[]): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: "WhatsApp no configurado", permanent: false };
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const tpl = TEMPLATES[kind];
  try {
    const host = process.env.WHATSAPP_API_BASE || "https://graph.facebook.com"; // se puede cambiar para pruebas
    const r = await fetch(`${host}/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toWhatsAppNumber(phone),
        type: "template",
        template: {
          name: tpl.name,
          language: { code: process.env.WHATSAPP_TPL_LANGUAGE || "es_MX" },
          components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text.slice(0, 1000) || "-" })) }],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (r.ok && json.messages?.[0]?.id) return { ok: true, id: json.messages[0].id };
    // 4xx (número no válido, plantilla inexistente…) no se arregla reintentando; 429/5xx sí
    const permanent = r.status >= 400 && r.status < 500 && r.status !== 429;
    return { ok: false, error: json.error?.message ?? `HTTP ${r.status}`, permanent };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red", permanent: false };
  }
}
