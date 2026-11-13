import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Clock, Scissors, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { activeQueue, withEstimates } from "@/lib/queue";
import { accessFor, canUsePanel } from "@/lib/billing";
import { JoinForm } from "./join-form";

export const metadata = { title: "Fila" };
export const dynamic = "force-dynamic";

/** Página pública para formarse sin cita (el QR de la puerta apunta aquí). */
export default async function QueuePublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await prisma.barbershop.findUnique({ where: { slug } });
  if (!shop) notFound();
  const open = shop.queueEnabled && canUsePanel(accessFor(shop));
  const [queue, services, staff] = await Promise.all([
    activeQueue(shop.id).then((q) => withEstimates(shop, q)),
    prisma.service.findMany({ where: { shopId: shop.id, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.staff.findMany({ where: { shopId: shop.id, active: true, takesAppointments: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const waiting = queue.filter((e) => e.status === "WAITING");
  const wait = waiting.length ? waiting[waiting.length - 1].waitMinutes + 15 : 0;

  return (
    <main className="min-h-dvh bg-canvas">
      <div className="bg-brand px-5 pt-10 pb-20 text-on-brand">
        <div className="mx-auto max-w-md">
          <span className="mb-5 flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15"><Scissors className="size-5" /></span>
            <span className="font-display text-lg">{shop.name}</span>
          </span>
          <h1 className="font-display text-3xl">Fórmate sin cita</h1>
          <p className="mt-1 text-white/80">Espera donde quieras: te avisamos cuando ya casi te toque.</p>
        </div>
      </div>
      <div className="mx-auto -mt-12 max-w-md space-y-4 px-4 pb-12">
        <section className="card grid grid-cols-2 divide-x divide-line-soft p-0">
          <div className="flex items-center gap-3 p-4"><Users className="size-5 text-brand" /><span><span className="block font-display text-2xl tnum">{waiting.length}</span><span className="text-sm text-muted">en la fila</span></span></div>
          <div className="flex items-center gap-3 p-4"><Clock className="size-5 text-brand" /><span><span className="block font-display text-2xl tnum">{waiting.length ? `~${wait} min` : "Ya"}</span><span className="text-sm text-muted">de espera</span></span></div>
        </section>
        <section className="card p-5">
          {open ? <JoinForm slug={slug} services={services} staff={staff} /> : (
            <p className="text-muted">La fila en línea no está disponible ahora. Puedes agendar una cita.</p>
          )}
        </section>
        <Link href={`/b/${slug}`} className="btn-quiet w-full"><CalendarPlus className="size-4" />Prefiero agendar una cita</Link>
      </div>
    </main>
  );
}
