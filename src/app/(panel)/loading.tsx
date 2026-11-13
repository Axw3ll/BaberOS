/** Se muestra al instante al cambiar de sección mientras el servidor trae los datos. */
export default function Loading() {
  const bar = "animate-pulse rounded-md bg-ink-2";
  return (
    <div aria-busy="true" aria-label="Cargando">
      <div className="mb-10">
        <div className={`${bar} h-10 w-56`} />
        <div className={`${bar} mt-3 h-4 w-72`} />
      </div>
      <div className="mb-14 flex flex-wrap gap-10">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className={`${bar} h-7 w-20`} />
            <div className={`${bar} mt-2 h-3 w-16`} />
          </div>
        ))}
      </div>
      <div className="divide-y divide-line-soft border-y border-line-soft">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 py-4">
            <div className={`${bar} h-4 w-14`} />
            <div className="flex-1">
              <div className={`${bar} h-4 w-1/3`} />
              <div className={`${bar} mt-2 h-3 w-1/4`} />
            </div>
            <div className={`${bar} h-3 w-20`} />
          </div>
        ))}
      </div>
    </div>
  );
}
