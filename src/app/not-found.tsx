import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-32">
      <p className="font-display text-4xl">No encontramos esta página</p>
      <p className="mt-3 text-muted">Puede que se haya borrado o que el enlace esté mal escrito.</p>
      <Link href="/hoy" className="btn-quiet mt-8">Ir a Hoy</Link>
    </main>
  );
}
