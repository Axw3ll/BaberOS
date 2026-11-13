import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3, BellRing, CalendarDays, Check, ListOrdered, MessageCircle, Scissors, Smartphone, Stamp, Star, Ticket, Users, Wallet,
} from "lucide-react";
import { currentUser } from "@/lib/auth";
import { PLANS } from "@/lib/billing";

export const metadata = {
  title: "BarberOS: agenda, clientes y caja para tu barbería",
  description: "Reservas en línea, recordatorios por WhatsApp, tarjeta de sellos, caja y comisiones. Prueba 14 días gratis.",
};

const PAINS = [
  { before: "Clientes que apartan y no llegan", after: "Recordatorio por WhatsApp un día antes y dos horas antes. Confirman con un toque. Y si alguien falta seguido, lo sabes." },
  { before: "La agenda en una libreta o en el chat", after: "Tus clientes reservan solos las 24 horas desde tu enlace. Sin choques de horario, aunque tengas varios barberos." },
  { before: "No sabes cuánto ganaste ni cuánto pagar", after: "Corte de caja, gastos y utilidad del mes. Las comisiones de cada barbero se calculan solas, con su día de pago." },
];

const FEATURES = [
  { icon: CalendarDays, title: "Agenda y reservas en línea", text: "Cada barbero con su horario. Tu enlace para Instagram y Google." },
  { icon: ListOrdered, title: "Fila virtual", text: "Para los que llegan sin cita: se forman desde su celular y ven cuánto falta." },
  { icon: Users, title: "Ficha de cada cliente", text: "Qué se hace, con quién, cada cuándo viene y quién está por perderse." },
  { icon: Stamp, title: "Tarjeta de sellos o puntos", text: "Tú eliges. El cliente la ve en su celular, sin descargar nada." },
  { icon: Ticket, title: "Paquetes y membresías", text: "“5 cortes por $800” o “ilimitado al mes”. Dinero por adelantado." },
  { icon: Wallet, title: "Caja, inventario y comisiones", text: "Cobra en segundos, con efectivo, tarjeta o transferencia." },
  { icon: BellRing, title: "Lista de espera", text: "Si alguien cancela, al siguiente le llega el aviso para apartar." },
  { icon: Star, title: "Calificaciones", text: "Después de cada visita. Las bajas te llegan como tarea para llamar." },
  { icon: BarChart3, title: "Reportes y metas", text: "Ventas, clientes que regresan y la meta de cada barbero." },
];

const FAQ = [
  { q: "¿Mis clientes tienen que crear una cuenta?", a: "No. Reservan con su nombre y teléfono, y reciben un enlace personal para ver su cita, su tarjeta y sus visitas. Sin contraseñas ni apps." },
  { q: "¿Funciona en el celular?", a: "Sí. Se usa desde el navegador en celular, tableta o computadora, y se puede instalar como app en la pantalla de inicio." },
  { q: "¿Necesito algo especial para los mensajes de WhatsApp?", a: "No. Los mensajes quedan listos y se envían con un toque desde tu WhatsApp. Si quieres que salgan solos, se conecta la API oficial de WhatsApp." },
  { q: "¿Qué pasa al terminar la prueba?", a: "Eliges un plan y sigues donde te quedaste. Si no, tus datos se guardan y puedes volver cuando quieras. No pedimos tarjeta para probar." },
  { q: "¿Puedo traer mis clientes de otro sistema?", a: "Sí. Importas tu lista desde Excel o CSV en un par de minutos." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  // Con sesión, directo al panel (con ?ver=1 se puede ver esta página igual)
  const { ver } = await searchParams;
  if (!ver && (await currentUser())) redirect("/hoy");

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="sticky top-0 z-20 border-b border-line-soft bg-canvas/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand"><Scissors className="size-5" aria-hidden /></span>
            <span className="font-display text-xl">BarberOS</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#precios" className="btn-ghost hidden sm:inline-flex">Precios</a>
            <Link href="/login" className="btn-ghost">Entrar</Link>
            <Link href="/registro" className="btn-primary">Prueba gratis</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute -top-40 right-[-10rem] size-[34rem] rounded-full bg-brand/10 blur-3xl" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">Hecho para barberías en México</p>
              <h1 className="font-display text-4xl leading-[1.1] sm:text-5xl">Tu barbería llena, sin perseguir a nadie.</h1>
              <p className="mt-5 max-w-xl text-lg text-muted">
                Reservas en línea, recordatorios por WhatsApp, tarjeta de sellos, caja y comisiones. Todo en un solo lugar, desde tu celular.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/registro" className="btn-primary px-6 py-3 text-base">Empieza gratis 14 días</Link>
                <a href="#funciones" className="btn-quiet px-6 py-3 text-base">Ver qué incluye</a>
              </div>
              <p className="mt-4 text-sm text-faint">Sin tarjeta. Listo en 5 minutos.</p>
            </div>

            {/* Vista de ejemplo del día */}
            <div className="card mx-auto w-full max-w-md p-5 shadow-xl" aria-hidden>
              <div className="mb-4 flex items-baseline justify-between">
                <span className="font-display text-lg">Hoy</span>
                <span className="text-sm text-muted">8 citas · $4,350</span>
              </div>
              <ul className="space-y-2.5 text-sm">
                {[
                  ["10:00", "Jorge V.", "Corte y barba", "Confirmada", "text-success"],
                  ["10:45", "Ana R.", "Corte clásico", "Por confirmar", "text-warning"],
                  ["11:30", "Luis M.", "Degradado", "Confirmada", "text-success"],
                  ["12:15", "Pablo S.", "🎟 Paquete 3 de 5", "Confirmada", "text-success"],
                ].map(([t, n, s, st, c]) => (
                  <li key={t} className="flex items-center gap-3 rounded-xl bg-hover px-3 py-2.5">
                    <span className="w-12 font-display tnum">{t}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{n}</span><span className="block truncate text-muted">{s}</span></span>
                    <span className={`text-xs font-medium ${c}`}>{st}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-sm">
                <MessageCircle className="size-4 shrink-0 text-success" />
                <span>3 recordatorios listos para enviar</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-line-soft bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="max-w-2xl font-display text-3xl">Lo que más quita tiempo (y dinero), resuelto</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {PAINS.map((p) => (
                <div key={p.before}>
                  <p className="text-sm font-medium text-danger line-through decoration-danger/40">{p.before}</p>
                  <p className="mt-2">{p.after}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="funciones" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl">Todo lo que tu barbería necesita</h2>
          <p className="mt-2 max-w-2xl text-muted">Sin pagar por separado la agenda, el programa de lealtad y el punto de venta.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card p-5">
                <span className="mb-3 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" aria-hidden /></span>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-brand text-on-brand">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
            <div>
              <Smartphone className="mb-4 size-8" aria-hidden />
              <h2 className="font-display text-3xl">Tu cliente no descarga nada</h2>
              <p className="mt-3 text-white/85">
                Reserva desde tu enlace con su nombre y teléfono. Recibe por WhatsApp su enlace personal: ahí confirma o cambia su cita,
                ve su tarjeta de sellos, sus paquetes y califica su visita.
              </p>
            </div>
            <ul className="space-y-3">
              {["Reserva en 3 toques, a cualquier hora", "Confirma, cambia o cancela sin llamar", "Ve cuántos sellos lleva y su premio", "Se forma en la fila desde la calle"].map((t) => (
                <li key={t} className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3"><Check className="size-5 shrink-0" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="precios" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <h2 className="text-center font-display text-3xl">Precios claros, en pesos</h2>
          <p className="mt-2 text-center text-muted">14 días gratis con todo incluido. Después eliges. Cancela cuando quieras.</p>
          <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
            {(["BASIC", "PRO"] as const).map((k) => {
              const p = PLANS[k];
              const pro = k === "PRO";
              return (
                <div key={k} className={`card relative flex flex-col p-6 ${pro ? "border-brand ring-1 ring-brand" : ""}`}>
                  {pro && <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-on-brand">El más elegido</span>}
                  <h3 className="font-display text-xl">{p.name}</h3>
                  <p className="mt-2"><span className="font-display text-4xl tnum">${p.price}</span> <span className="text-muted">MXN al mes</span></p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{f}</li>)}
                  </ul>
                  <Link href="/registro" className={`${pro ? "btn-primary" : "btn-quiet"} mt-6 w-full py-2.5`}>Probar gratis</Link>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-t border-line-soft bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl">Preguntas frecuentes</h2>
            <div className="mt-8 divide-y divide-line-soft">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}<span className="text-xl text-muted transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="font-display text-3xl">Empieza hoy, en 5 minutos</h2>
          <p className="mt-2 text-muted">Da de alta tus servicios y tu equipo, y comparte tu enlace.</p>
          <Link href="/registro" className="btn-primary mt-6 px-6 py-3 text-base">Crear mi barbería gratis</Link>
        </section>
      </main>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted sm:px-6">
          <span>© {new Date().getFullYear()} BarberOS</span>
          <span className="flex gap-5">
            <Link href="/privacidad" className="hover:text-fg">Privacidad</Link>
            <Link href="/terminos" className="hover:text-fg">Términos</Link>
            <Link href="/login" className="hover:text-fg">Entrar</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
