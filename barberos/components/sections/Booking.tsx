"use client";
import type { Me } from "../Panel";
import BookingFlow from "../BookingFlow";
import { useToast } from "../ui";

export default function Booking({ me }: { me: Me }) {
  const toast = useToast();
  const url = typeof window !== "undefined" ? `${window.location.origin}/${me.shop.slug}/reservar` : `/${me.shop.slug}/reservar`;
  return (
    <section className="panel stack">
      <h1 style={{ fontSize: 30 }}>Tus clientes reservan solos, desde su celular</h1>
      <p className="muted" style={{ fontSize: 17 }}>Esta es la página de reserva de {me.shop.name}: el cliente elige servicio, barbero y un horario libre (los horarios ocupados ni siquiera aparecen) y la reserva entra directo a la agenda.</p>
      <div className="card inset stack-s">
        <b className="url">{url}</b>
        <div className="grid2">
          <button className="btn" onClick={() => navigator.clipboard?.writeText(url).then(() => toast("Enlace copiado"), () => toast("No se pudo copiar", "err"))}>Copiar enlace</button>
          <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(`Reserva tu cita en ${me.shop.name}: ${url}`)}`} target="_blank" rel="noreferrer">Compartir</a>
        </div>
      </div>
      <div className="phone mt"><BookingFlow slug={me.shop.slug} embedded /></div>
    </section>
  );
}
