import { prisma } from "@/lib/prisma";

/** Archivo .ics para agregar la cita al calendario del teléfono. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("No encontrada", { status: 404 });
  const a = await prisma.appointment.findUnique({ where: { token }, include: { shop: true, services: true, staff: true } });
  if (!a) return new Response("No encontrada", { status: 404 });
  const ts = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BarberOS//ES", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${a.id}@barberos`, `DTSTAMP:${ts(new Date())}`, `DTSTART:${ts(a.startsAt)}`, `DTEND:${ts(a.endsAt)}`,
    `SUMMARY:${esc(`${a.services.map((s) => s.name).join(", ")} en ${a.shop.name}`)}`,
    `DESCRIPTION:${esc(`Con ${a.staff.name}`)}`,
    ...(a.shop.address ? [`LOCATION:${esc(a.shop.address)}`] : []),
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Tu cita", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="cita.ics"' } });
}
