import { redirect } from "next/navigation";
import { CalendarDays, MessageCircle, Scissors, Users } from "lucide-react";
import { devAuth } from "@/lib/auth";

const POINTS = [
  { icon: CalendarDays, text: "Agenda sin choques y reservas en línea" },
  { icon: Users, text: "Ficha de cada cliente, etiquetas y seguimiento" },
  { icon: MessageCircle, text: "Campañas y recordatorios por WhatsApp" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  if (devAuth) redirect("/hoy");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(440px,540px)]">
      <section className="relative hidden overflow-hidden bg-brand text-on-brand lg:block">
        <div className="absolute -top-32 -right-32 size-96 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-white/5" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-14">
          <span className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-white/15"><Scissors className="size-5" /></span>
            <span className="font-display text-xl">BarberOS</span>
          </span>
          <div>
            <p className="max-w-md font-display text-4xl leading-[1.15]">
              La agenda, los clientes y la caja de tu barbería, en un solo lugar.
            </p>
            <ul className="mt-10 space-y-4">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-white/85">
                  <span className="grid size-9 place-items-center rounded-lg bg-white/15"><Icon className="size-[18px]" /></span>{text}
                </li>
              ))}
            </ul>
          </div>
          <span className="text-sm text-white/60">Hecho para barberías de México</span>
        </div>
      </section>
      <section className="flex items-center justify-center bg-surface px-6 py-16">
        <div className="w-full max-w-sm">
          <span className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand"><Scissors className="size-5" /></span>
            <span className="font-display text-xl">BarberOS</span>
          </span>
          {children}
        </div>
      </section>
    </main>
  );
}
