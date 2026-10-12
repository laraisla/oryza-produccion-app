/**
 * Límite de uso en memoria del proceso. Suficiente para una demo local; no es
 * una protección para un despliegue público (no se comparte entre instancias
 * ni sobrevive a reinicios).
 */
export interface RateLimiter {
  check(key: string, now?: number): { ok: true } | { ok: false; message: string };
}

export function createRateLimiter(perMinute: number, perDay: number): RateLimiter {
  const hits = new Map<string, number[]>();
  let day = { start: 0, count: 0 };
  return {
    check(key, now = Date.now()) {
      if (now - day.start >= 86_400_000) day = { start: now, count: 0 };
      if (day.count >= perDay) return { ok: false, message: "Se alcanzó el límite diario de extracciones con IA de este servidor." };
      const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
      if (recent.length >= perMinute) {
        hits.set(key, recent);
        return { ok: false, message: "Demasiadas extracciones en un minuto. Esperá un momento." };
      }
      recent.push(now);
      hits.set(key, recent);
      day.count++;
      return { ok: true };
    },
  };
}
