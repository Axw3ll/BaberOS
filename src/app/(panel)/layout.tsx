import { currentContext, devAuth, ROLE_LABEL, sectionsFor } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { signOut } from "../(auth)/actions";
import { switchShop } from "./actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { me, shop, shops } = await currentContext();

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[232px_1fr]">
      <aside className="border-b border-line-soft px-4 pt-5 pb-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0 lg:px-5 lg:py-8">
        <div className="mb-4 flex items-baseline justify-between lg:mb-10 lg:block">
          <span className="font-display text-xl tracking-wide">BarberOS</span>
          {shops.length > 1 ? (
            <form action={switchShop} className="lg:mt-5">
              <select name="shopId" defaultValue={shop.id} aria-label="Barbería"
                className="field max-w-48 py-1.5 text-sm" >
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn-ghost text-xs">Cambiar</button>
            </form>
          ) : (
            <p className="truncate text-sm text-ash lg:mt-2">{shop.name}</p>
          )}
        </div>

        <Nav sections={sectionsFor(me.role)} />

        <div className="mt-auto hidden border-t border-line-soft pt-5 lg:block">
          <p className="truncate text-sm text-foam">{me.name}</p>
          <p className="text-sm text-ash-2">{ROLE_LABEL[me.role]}</p>
          {!devAuth && (
            <form action={signOut}>
              <button className="mt-3 text-sm text-ash transition-colors hover:text-foam">Cerrar sesión</button>
            </form>
          )}
        </div>
      </aside>
      <main className="min-w-0 px-5 py-10 sm:px-8 lg:px-14 lg:py-14">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
