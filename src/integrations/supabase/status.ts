/** Estado de configuración de Supabase (solo variables públicas; nunca claves de servicio). */
export function supabaseStatus(): { configured: boolean; url: string | null } {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return { configured: Boolean(url && key), url: url ?? null };
}
