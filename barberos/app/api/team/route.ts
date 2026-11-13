import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { body, handle, json, bad, forbidden } from "@/lib/http";
import { hashPin } from "@/lib/crypto";

export const GET = handle(async () => {
  const c = await requireCtx("team");
  const members = await prisma.member.findMany({
    where: { barbershopId: c.shopId }, orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true, barberId: true, lockedUntil: true, barber: { select: { name: true } } },
  });
  return json({ members, me: c.memberId });
});

const Schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().optional().or(z.literal("")),
  role: z.enum(["OWNER", "ADMIN", "RECEPTION", "BARBER"]),
  barberId: z.string().optional().nullable(),
  pin: z.string().regex(/^\d{4,6}$/, "PIN de 4 a 6 dígitos"),
});

export const POST = handle(async (req: Request) => {
  const c = await requireCtx("team");
  const d = Schema.parse(await body(req));
  if (d.role === "OWNER" && c.role !== "OWNER") throw forbidden("Solo el dueño puede crear otro dueño");
  let barberId: string | null = null;
  if (d.role === "BARBER") {
    if (!d.barberId) throw bad("Un miembro con rol Barbero debe vincularse a su registro de barbero");
    const b = await prisma.barber.findFirst({ where: { id: d.barberId, barbershopId: c.shopId }, include: { member: true } });
    if (!b) throw bad("Barbero no encontrado");
    if (b.member) throw bad("Ese barbero ya está vinculado a otro miembro");
    barberId = b.id;
  }
  const m = await prisma.member.create({
    data: { barbershopId: c.shopId, name: d.name, email: d.email || null, role: d.role, barberId, pinHash: await hashPin(d.pin) },
    select: { id: true, name: true, role: true },
  });
  return json({ member: m }, 201);
});
