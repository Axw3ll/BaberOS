import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Scissors } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { activeQueue, withEstimates } from "@/lib/queue";
import { AutoRefresh } from "@/components/auto-refresh";
import { leaveQueue } from "../actions";

export const metadata = { title: "Tu lugar en la fila", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyTurnPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const e = await prisma.queueEntry.findUnique({ where: { token }, include: { shop: true, staff: true } });
  if (!e || e.shop.slug !== slug) notFound();
  const list = await withEstimates(e.shop, await activeQueue(e.shopId));
  const me = list.find((x) => x.id === e.id);
  const first = e.name.split(/\s+/)[0];

  let big: React.ReactNode, sub: string;
  if (e.status === "CALLED") { big = "¡Te toca!"; sub = `Pasa con ${e.staff?.name ?? "tu barbero"}.`; }
  else if (me) { big = me.position === 1 ? "Eres el siguiente" : `Vas en el lugar ${me.position}`; sub = me.waitMinutes ? `Espera aproximada: ${me.waitMinutes} min.` : "Ya casi."; }
  else if (e.status === "DONE") { big = "¡Gracias!"; sub = "Ya estás con tu barbero."; }
  else { big = "Saliste de la fila"; sub = "Si cambias de opinión, puedes volver a formarte."; }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      {(me || e.status === "CALLED") && <AutoRefresh seconds={20} />}
      <div className="card w-full max-w-sm p-7 text-center">
        <span className="mx-auto mb-4 flex w-fit items-center gap-2 text-sm text-muted"><Scissors className="size-4" />{e.shop.name}</span>
        <p className="text-muted">Hola, {first}</p>
        <p className={`mt-2 font-display text-3xl ${e.status === "CALLED" ? "text-success" : ""}`}>{big}</p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-muted">{me ? <Clock className="size-4" /> : <CheckCircle2 className="size-4" />}{sub}</p>
        {me && (
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-hover">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(8, 100 - (me.position - 1) * 15)}%` }} />
          </div>
        )}
        {(e.status === "WAITING" || e.status === "CALLED") && (
          <form action={leaveQueue} className="mt-8">
            <input type="hidden" name="token" value={token} />
            <button className="btn-ghost text-sm text-danger">Ya no voy, salir de la fila</button>
          </form>
        )}
        <p className="mt-6 text-xs text-faint">Esta página se actualiza sola. Te avisamos por WhatsApp cuando ya casi te toque.</p>
      </div>
    </main>
  );
}
