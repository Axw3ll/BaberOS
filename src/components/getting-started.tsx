import Link from "next/link";
import { cookies } from "next/headers";
import { Check, ChevronRight, Rocket } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/messages";
import { CopyButton } from "./copy-button";
import { hideGettingStarted } from "@/app/(panel)/actions";

export const GETTING_STARTED_COOKIE = "barberos_primeros_pasos";

/** Lista de primeros pasos para el dueño. Cada paso se marca solo cuando se cumple. */
export async function GettingStarted({ shop }: { shop: { id: string; slug: string; googleReviewUrl: string | null } }) {
  if ((await cookies()).get(GETTING_STARTED_COOKIE)?.value === shop.id) return null;
  const [services, staff, customers, online, sales] = await Promise.all([
    prisma.service.count({ where: { shopId: shop.id, active: true } }),
    prisma.staff.count({ where: { shopId: shop.id, active: true } }),
    prisma.customer.count({ where: { shopId: shop.id } }),
    prisma.appointment.count({ where: { shopId: shop.id, source: "ONLINE" } }),
    prisma.sale.count({ where: { shopId: shop.id } }),
  ]);
  const steps = [
    { done: services > 0, title: "Revisa tus servicios y precios", href: "/servicios" },
    { done: staff > 1, title: "Agrega a tu equipo", href: "/equipo?nuevo=1" },
    { done: customers >= 5, title: "Importa tus clientes desde Excel", href: "/clientes/importar" },
    { done: online > 0, title: "Comparte tu enlace de reservas en Instagram y WhatsApp", href: `/b/${shop.slug}`, copy: true },
    { done: Boolean(shop.googleReviewUrl), title: "Activa los mensajes automáticos y tu enlace de reseñas", href: "/ajustes#mensajes" },
    { done: sales > 0, title: "Registra tu primera venta", href: "/ventas/nueva" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const link = `${await baseUrl()}/b/${shop.slug}`;

  return (
    <section className="card mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Rocket className="size-5" /></span>
          <div>
            <h2 className="font-display text-lg">Primeros pasos</h2>
            <p className="text-sm text-muted">{doneCount} de {steps.length} listos</p>
          </div>
        </div>
        <form action={hideGettingStarted}><button className="btn-ghost text-sm">Ocultar</button></form>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-hover"><div className="h-full rounded-full bg-brand" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.title} className="flex items-center gap-2">
            <Link href={s.href} target={s.copy ? "_blank" : undefined}
              className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-hover ${s.done ? "text-muted line-through" : "font-medium"}`}>
              <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${s.done ? "border-success bg-success text-white" : "border-faint"}`}>
                {s.done && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1">{s.title}</span>
              {!s.done && <ChevronRight className="size-4 shrink-0 text-faint" />}
            </Link>
            {s.copy && !s.done && <CopyButton text={link} label="Copiar" />}
          </li>
        ))}
      </ul>
    </section>
  );
}
