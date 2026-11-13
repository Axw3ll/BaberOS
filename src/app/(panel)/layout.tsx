import { after } from "next/server";
import { LogOut, Scissors } from "lucide-react";
import { baseUrl, syncSoon } from "@/lib/messages";
import { currentContext, devAuth, ROLE_LABEL, sectionsFor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/time";
import { initials } from "@/lib/format";
import { MobileNav, Nav } from "@/components/nav";
import { signOut } from "../(auth)/actions";
import { switchShop } from "./actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { me, shop, shops } = await currentContext();
  const sections = sectionsFor(me.role);
  // Prepara recordatorios y avisos después de responder, sin hacer esperar a la página
  const base = await baseUrl();
  after(() => syncSoon(shop, base));

  // Pendientes de hoy o atrasados y mensajes por enviar: se ven como número junto a "Seguimiento"
  const [due, messages] = await Promise.all([
    prisma.task.count({
      where: { shopId: shop.id, doneAt: null, dueOn: { lte: new Date(`${today(shop.timezone)}T00:00:00Z`) },
        OR: [{ assignedToId: me.id }, { assignedToId: null }] },
    }),
    prisma.outboundMessage.count({
      where: { shopId: shop.id, status: "PENDING", dueAt: { lte: new Date() }, ...(me.role === "BARBER" && { appointment: { staffId: me.id } }) },
    }),
  ]);
  const badges = { seguimiento: due + messages };

  const logo = (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-brand text-on-brand"><Scissors className="size-4" /></span>
      <span className="font-display text-lg">BarberOS</span>
    </span>
  );
  const shopSwitch = shops.length > 1 ? (
    <form action={switchShop} className="flex gap-1.5">
      <select name="shopId" defaultValue={shop.id} aria-label="Barbería" className="field py-1.5 text-sm">
        {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button className="btn-quiet px-2.5 py-1.5 text-xs">Cambiar</button>
    </form>
  ) : null;
  const user = (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{initials(me.name)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{me.name}</span>
        <span className="block text-xs text-muted">{ROLE_LABEL[me.role]}</span>
      </span>
      {!devAuth && (
        <form action={signOut}>
          <button className="btn-ghost p-2" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut className="size-4" /></button>
        </form>
      )}
    </div>
  );

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[256px_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:px-4 lg:py-6">
        <div className="mb-6 px-2">
          {logo}
          <div className="mt-4">{shopSwitch ?? <p className="truncate rounded-lg bg-hover px-3 py-2 text-sm text-muted">{shop.name}</p>}</div>
        </div>
        <div className="-mx-1 flex-1 overflow-y-auto px-1"><Nav sections={sections} badges={badges} /></div>
        <div className="mt-4 border-t border-line-soft px-2 pt-4">{user}</div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        {logo}
        <span className="min-w-0 truncate text-sm text-muted">{shop.name}</span>
      </header>

      <main className="panel min-w-0 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>

      <MobileNav sections={sections} badges={badges} footer={<div className="space-y-3">{shopSwitch}{user}</div>} />
    </div>
  );
}
