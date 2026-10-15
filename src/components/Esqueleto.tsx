/**
 * Rectángulos grises que "laten" mientras llegan los datos. Le muestran al
 * usuario que la app está cargando y no trabada.
 */
export function Esqueleto({ filas = 3, alto = "h-28" }: { filas?: number; alto?: string }) {
  return (
    <div role="status" aria-label="Cargando" className="space-y-3">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className={`${alto} animate-pulse rounded-2xl bg-stone-200`} />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
