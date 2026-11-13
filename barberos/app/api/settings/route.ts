import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, bad } from "@/lib/http";
import { encrypt } from "@/lib/crypto";

export const GET = handle(async () => {
  const c = await requireCtx("settings");
  const s = c.shop;
  return json({
    settings: {
      name: s.name, city: s.city, address: s.address, phone: s.phone, timezone: s.timezone, ownerName: s.ownerName, ownerEmail: s.ownerEmail, ownerPhone: s.ownerPhone,
      openTime: s.openTime, closeTime: s.closeTime, workDays: s.workDays.split(",").map(Number), slotMinutes: s.slotMinutes,
      depositEnabled: s.depositEnabled, depositMode: s.depositMode, depositValue: s.depositValue,
      loyaltyStampsRequired: s.loyaltyStampsRequired, loyaltyDiscountPercent: s.loyaltyDiscountPercent,
      stripeConnected: !!s.stripeSecretKeyEnc, stripeWebhookConfigured: !!s.stripeWebhookSecretEnc,
      webhookPath: `/api/stripe/webhook/${s.id}`, slug: s.slug,
    },
  });
});

const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Schema = z.object({
  name: z.string().trim().min(2).max(80), city: z.string().trim().min(2).max(80), address: z.string().trim().max(160).nullable(), phone: z.string().trim().min(10).max(20),
  timezone: z.string(), ownerName: z.string().trim().min(2), ownerEmail: z.string().email().nullable().or(z.literal("")), ownerPhone: z.string().nullable(),
  openTime: Hhmm, closeTime: Hhmm, workDays: z.array(z.number().int().min(0).max(6)).min(1), slotMinutes: z.number().int().min(5).max(120),
  depositEnabled: z.boolean(), depositMode: z.enum(["FIXED", "PERCENT"]), depositValue: z.number().int().min(0),
  loyaltyStampsRequired: z.number().int().min(1).max(50), loyaltyDiscountPercent: z.number().int().min(1).max(100),
  stripeSecretKey: z.string().optional(), stripeWebhookSecret: z.string().optional(), disconnectStripe: z.boolean().optional(),
}).partial();

export const PATCH = handle(async (req: Request) => {
  const c = await requireCtx("settings");
  const d = Schema.parse(await body(req));
  if (d.timezone) { try { new Intl.DateTimeFormat("es", { timeZone: d.timezone }); } catch { throw bad("Zona horaria inválida"); } }
  const open = d.openTime ?? c.shop.openTime, close = d.closeTime ?? c.shop.closeTime;
  if (open >= close) throw bad("La hora de cierre debe ser después de la apertura");
  if ((d.depositMode ?? c.shop.depositMode) === "PERCENT" && (d.depositValue ?? c.shop.depositValue) > 100) throw bad("El porcentaje de anticipo no puede pasar de 100");
  if (d.stripeSecretKey && !/^sk_(test|live)_/.test(d.stripeSecretKey)) throw bad("La llave secreta de Stripe debe empezar con sk_test_ o sk_live_");
  if (d.stripeWebhookSecret && !d.stripeWebhookSecret.startsWith("whsec_")) throw bad("El secreto del webhook debe empezar con whsec_");
  const { stripeSecretKey, stripeWebhookSecret, disconnectStripe, workDays, ...rest } = d;
  await prisma.barbershop.update({
    where: { id: c.shopId },
    data: {
      ...rest,
      ...(rest.address !== undefined ? { address: rest.address || null } : {}),
      ...(rest.phone ? { phone: rest.phone.replace(/\D/g, "") } : {}),
      ...(rest.ownerEmail !== undefined ? { ownerEmail: rest.ownerEmail || null } : {}),
      ...(workDays ? { workDays: [...new Set(workDays)].sort().join(",") } : {}),
      ...(stripeSecretKey ? { stripeSecretKeyEnc: encrypt(stripeSecretKey) } : {}),
      ...(stripeWebhookSecret ? { stripeWebhookSecretEnc: encrypt(stripeWebhookSecret) } : {}),
      ...(disconnectStripe ? { stripeSecretKeyEnc: null, stripeWebhookSecretEnc: null } : {}),
    },
  });
  return json({ ok: true });
});
