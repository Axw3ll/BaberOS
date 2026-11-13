"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Vuelve a pedir los datos de la página cada N segundos (solo si la pestaña está visible). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
