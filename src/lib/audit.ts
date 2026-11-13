import "server-only";
import { prisma } from "./prisma";

/** Acciones que se registran en la bitácora (para filtrar y mostrar con su etiqueta). */
export const AUDIT_ACTIONS = {
  "venta.cobro": "Cobro",
  "venta.descuento": "Descuento",
  "venta.cancelada": "Venta cancelada",
  "cita.cancelada": "Cita cancelada",
  "cita.no_llego": "No llegó",
  "cita.termino_antes": "Terminó antes",
  "cliente.borrado": "Cliente borrado",
  "lealtad.ajuste": "Ajuste de puntos o sellos",
  "precio.cambio": "Cambio de precio",
  "inventario.ajuste": "Ajuste de inventario",
  "comision.pago": "Pago de comisiones",
  "caja.corte": "Corte de caja",
  "gasto.registro": "Gasto",
  "gasto.borrado": "Gasto borrado",
  "equipo.cambio": "Cambio en el equipo",
  "ajustes.cambio": "Cambio en ajustes",
} as const;
export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** "$8000.00" → "$8,000.00" en los textos de la bitácora. */
const withThousands = (s: string) =>
  s.replace(/\$(-?)(\d{4,})(\.\d{2})?/g, (_m, sign: string, int: string, dec?: string) => `$${sign}${Number(int).toLocaleString("en-US")}${dec ?? ""}`);

/**
 * Deja constancia de una acción. Nunca rompe la operación principal: si falla, solo se reporta en el log.
 * `summary` es una frase para leer tal cual ("Cobró la venta #12 por $320 con 10% de descuento").
 */
export async function audit(shopId: string, staffId: string | null, action: AuditAction, summary: string, entity?: { type: string; id: string }) {
  try {
    await prisma.auditLog.create({
      data: { shopId, staffId, action, summary: withThousands(summary).slice(0, 300), entityType: entity?.type, entityId: entity?.id },
    });
  } catch (e) {
    console.error("audit", e);
  }
}
