import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, MapPin, Phone, Scissors } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { addDays, dateLabel, timeLabel, toLocalDate, today } from "@/lib/time";
import { minutesLabel, money } from "@/lib/format";
import { Dot, STATUS } from "@/components/ui";
import { Manage } from "./manage";
import { Rate, Thanks } from "./rate";
import { StampCard } from "@/components/stamp-card";
import { stampRewardLabel } from "@/lib/loyalty";

export const metadata = { title: "Tu cita", robots: { index: false } };

export default async function ClientAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const a = await prisma.appointment.findUnique({ where: { token }, include: { shop: true, services: true, staff: true, customer: true, review: true } });
  if (!a) notFound();
  const tz = a.shop.timezone, day = toLocalDate(a.startsAt, tz);
  const open = (a.status === "PENDING" || a.status === "CONFIRMED") && a.startsAt.getTime() > Date.now();
  const t = today(tz);
  const days = Array.from({ length: Math.min(a.shop.maxAdvanceDays, 21) + 1 }, (_, i) => addDays(t, i));
  const total = a.services.reduce((s, x) => s + Number(x.price), 0);
  const minutes = a.services.reduce((s, x) => s + x.minutes, 0);

  return (
    <main className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-md">
        <p className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand"><Scissors className="size-4" /></span>
          <span className="font-display text-lg">{a.shop.name}</span>
        </p>
        <div className="card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Hola, {a.customer.name.split(" ")[0]}. Tu cita:</p>
              <h1 className="mt-1 font-display text-2xl">{dateLabel(day)}</h1>
              <p className="font-display text-xl text-brand tnum">{timeLabel(a.startsAt, tz)}</p>
            </div>
            <Dot color={STATUS[a.status].color}>{a.status === "CONFIRMED" ? "Confirmada" : STATUS[a.status].label}</Dot>
          </div>
          <dl className="mt-5 space-y-2 border-t border-line-soft pt-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Servicio</dt><dd className="text-right">{a.services.map((s) => s.name).join(", ")}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Con</dt><dd>{a.staff.name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Duración</dt><dd>{minutesLabel(minutes)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Precio</dt><dd className="tnum">{money(total, true)}</dd></div>
          </dl>

          {open ? (
            <>
              <Manage token={token} tz={tz} days={days} confirmed={a.status === "CONFIRMED"} />
              <a href={`/c/${token}/calendario`} className="btn-ghost mt-3 w-full"><CalendarPlus className="size-4" />Agregar a mi calendario</a>
              <Link href={`/mi/${a.customer.token}`} className="btn-ghost w-full">Ver mi tarjeta y mis visitas</Link>
            </>
          ) : (
            <div className="mt-6 rounded-xl bg-hover p-4 text-sm text-muted">
              {a.status === "CANCELLED" ? "Esta cita está cancelada." : a.status === "COMPLETED" ? "¡Gracias por venir!" : "Esta cita ya pasó."}
              <Link href={`/b/${a.shop.slug}?c=${a.customer.token}`} className="link mt-2 block">Reservar otra cita</Link>
            </div>
          )}
          {a.status === "COMPLETED" && (a.review
            ? <Thanks googleUrl={a.shop.googleReviewUrl} />
            : <Rate token={token} barber={a.staff.name.split(" ")[0]} googleUrl={a.shop.googleReviewUrl} />)}
        </div>
        {a.shop.loyaltyMode === "STAMPS" && (a.customer.stamps > 0 || a.customer.stampRewards > 0) && (
          <div className="mt-4">
            <p className="mb-2 px-1 text-sm font-medium text-muted">Tu tarjeta de {a.shop.name}</p>
            <StampCard stamps={a.customer.stamps} required={a.shop.stampsRequired} rewards={a.customer.stampRewards} rewardLabel={stampRewardLabel(a.shop)} compact />
          </div>
        )}
        {(a.shop.address || a.shop.phone) && (
          <div className="mt-4 space-y-1.5 px-1 text-sm text-muted">
            {a.shop.address && <p className="flex items-center gap-2"><MapPin className="size-4" aria-hidden />{a.shop.address}</p>}
            {a.shop.phone && <a href={`tel:${a.shop.phone}`} className="flex items-center gap-2 tnum hover:text-fg"><Phone className="size-4" aria-hidden />{a.shop.phone}</a>}
          </div>
        )}
      </div>
    </main>
  );
}
