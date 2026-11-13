"use client";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { rateByToken } from "./actions";

const WORDS = ["", "Mala", "Regular", "Bien", "Muy bien", "¡Excelente!"];

export function Rate({ token, barber, googleUrl }: { token: string; barber: string; googleUrl: string | null }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) return <Thanks googleUrl={googleUrl} />;

  const shown = hover || rating;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await rateByToken(token, rating, comment);
          if ("error" in r && r.error) setError(r.error);
          else setDone(true);
        });
      }}
      className="mt-6 rounded-xl bg-hover p-4"
    >
      <p className="font-medium">¿Cómo te atendió {barber}?</p>
      <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Calificación" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} de 5`}
            onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} className="p-1">
            <Star className={`size-9 transition ${n <= shown ? "fill-warning text-warning" : "text-line"}`} />
          </button>
        ))}
        <span className="ml-2 text-sm text-muted">{WORDS[shown]}</span>
      </div>
      {rating > 0 && (
        <>
          <label className="mt-4 block">
            <span className="label">{rating <= 3 ? "¿Qué podemos mejorar?" : "¿Algo que quieras contarnos? (opcional)"}</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} className="field" />
          </label>
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          <button disabled={pending} className="btn-primary mt-3 w-full">{pending ? "Enviando…" : "Enviar calificación"}</button>
        </>
      )}
    </form>
  );
}

export function Thanks({ googleUrl }: { googleUrl: string | null }) {
  return (
    <div role="status" className="mt-6 rounded-xl bg-success/10 p-4 text-sm">
      <p className="font-medium">¡Gracias por tu calificación!</p>
      {googleUrl && (
        <>
          <p className="mt-1 text-muted">Si tienes un minuto, una reseña en Google nos ayuda muchísimo a que más gente nos encuentre.</p>
          <a href={googleUrl} target="_blank" rel="noopener" className="btn-quiet mt-3">Dejar reseña en Google</a>
        </>
      )}
    </div>
  );
}
