// Mensajería por WhatsApp.
// HOY: envío MANUAL. El sistema arma el texto y un enlace wa.me; la persona lo envía desde el
// WhatsApp de la barbería y luego marca "enviado" (queda en ReminderLog / RecoveryLog).
// NO hay envío automático. Para activarlo después, implementa MessageProvider con
// WhatsApp Business Cloud API o Twilio y cámbialo en getProvider().

import { humanDate } from "../time";

export function waPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `52${d}` : d; // México por defecto
}

export function waLink(phone: string, text: string) {
  return `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;
}

export function reminderText(p: { client: string; service: string; barber: string; date: string; time: string; shop: string; shopPhone: string; when: "TODAY" | "TOMORROW" }) {
  const cuando = p.when === "TODAY" ? "hoy" : "mañana";
  return `Hola ${p.client} 👋, te recordamos tu cita ${cuando} ${humanDate(p.date)} a las ${p.time} en ${p.shop}.\n` +
    `Servicio: ${p.service}\nBarbero: ${p.barber}\n` +
    `Si necesitas cambiarla o cancelarla, avísanos al ${p.shopPhone}. ¡Te esperamos!`;
}

export function recoveryText(p: { client: string; days: number; lastService: string | null; barber: string | null; stamps: number; required: number; rewards: number; shop: string; shopPhone: string }) {
  const lealtad = p.rewards > 0
    ? `¡Tienes ${p.rewards} recompensa${p.rewards > 1 ? "s" : ""} lista${p.rewards > 1 ? "s" : ""} para usar!`
    : `Llevas ${p.stamps} de ${p.required} sellos para tu recompensa.`;
  return `Hola ${p.client}, ¡te extrañamos en ${p.shop}! ✂️\n` +
    `Ya pasaron ${p.days} días desde tu última visita` + (p.lastService ? ` (${p.lastService}${p.barber ? ` con ${p.barber}` : ""})` : "") + `.\n` +
    `${lealtad}\nAgenda tu cita respondiendo este mensaje o al ${p.shopPhone}.`;
}

// ---- Punto de extensión para envío automático (no conectado) ----
export interface MessageProvider {
  readonly automatic: boolean;
  send(to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }>;
}

class ManualProvider implements MessageProvider {
  readonly automatic = false;
  async send() { return { ok: false, error: "Envío manual: abre el enlace de WhatsApp y marca enviado." }; }
}

/*
class TwilioProvider implements MessageProvider {
  readonly automatic = true;
  async send(to: string, text: string) {
    // POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
    // From=whatsapp:{TWILIO_WHATSAPP_FROM} To=whatsapp:+{waPhone(to)} Body=text
    // Requiere plantilla aprobada por Meta para mensajes iniciados por el negocio.
  }
}
*/

export function getProvider(): MessageProvider {
  return new ManualProvider();
}
