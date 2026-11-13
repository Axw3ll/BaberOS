import { redirect } from "next/navigation";
import { devAuth } from "@/lib/auth";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  if (devAuth) redirect("/hoy");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="relative hidden overflow-hidden border-r border-line-soft lg:block">
        <div className="absolute inset-y-0 right-0 w-16 comb" style={{ "--hour": "96px" } as React.CSSProperties} aria-hidden />
        <div className="flex h-full flex-col justify-between p-14">
          <span className="font-display text-xl">BarberOS</span>
          <p className="max-w-md font-display text-4xl leading-[1.15] text-foam">
            La agenda, el equipo y la caja de tu barbería, en un solo lugar.
          </p>
          <span className="text-sm text-ash-2">Hecho para barberías de México</span>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
