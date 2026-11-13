import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, bad, forbidden, notFound } from "@/lib/http";
import { hashPin } from "@/lib/crypto";

type P = { params: Promise<{ id: string }> };
const Schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  role: z.enum(["OWNER", "ADMIN", "RECEPTION", "BARBER"]).optional(),
  barberId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  newPin: z.string().regex(/^\d{4,6}$/, "PIN de 4 a 6 dígitos").optional(),
  unlock: z.boolean().optional(),
});

export const PATCH = handle(async (req: Request, { params }: P) => {
  const c = await requireCtx("team");
  const { id } = await params;
  const d = Schema.parse(await body(req));
  const m = await prisma.member.findFirst({ where: { id, barbershopId: c.shopId } });
  if (!m) throw notFound("Miembro no encontrado");
  if ((m.role === "OWNER" || d.role === "OWNER") && c.role !== "OWNER") throw forbidden("Solo el dueño puede modificar a un dueño");

  const role = d.role ?? m.role;
  const active = d.active ?? m.active;
  if (m.role === "OWNER" && (role !== "OWNER" || !active)) {
    const owners = await prisma.member.count({ where: { barbershopId: c.shopId, role: "OWNER", active: true } });
    if (owners <= 1) throw bad("Debe quedar al menos un dueño activo");
  }
  let barberId = d.barberId === undefined ? m.barberId : d.barberId;
  if (role !== "BARBER") barberId = null;
  if (role === "BARBER") {
    if (!barberId) throw bad("Un barbero debe vincularse a su registro de barbero");
    const b = await prisma.barber.findFirst({ where: { id: barberId, barbershopId: c.shopId }, include: { member: true } });
    if (!b) throw bad("Barbero no encontrado");
    if (b.member && b.member.id !== m.id) throw bad("Ese barbero ya está vinculado a otro miembro");
  }
  await prisma.member.update({
    where: { id: m.id },
    data: {
      name: d.name, email: d.email === undefined ? undefined : d.email || null, role, barberId, active,
      ...(d.newPin ? { pinHash: await hashPin(d.newPin), failedAttempts: 0, lockedUntil: null } : {}),
      ...(d.unlock ? { failedAttempts: 0, lockedUntil: null } : {}),
    },
  });
  if (!active) await prisma.session.deleteMany({ where: { memberId: m.id } });
  return json({ ok: true });
});
