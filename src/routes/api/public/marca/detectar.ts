// ============================================================
// Detección segura de identidad visual desde el sitio web de
// una empresa. Reglas de seguridad:
//  - Solo HTTPS y dominios públicos (se bloquean IPs privadas,
//    loopback, link-local y hostnames internos).
//  - Máx. 3 redirecciones, revalidando cada destino.
//  - Límite de tiempo (8 s) y de tamaño (400 KB HTML / 200 KB CSS).
//  - Nunca ejecuta JavaScript ni descarga ejecutables: solo lee
//    HTML/CSS como texto y extrae metadatos y colores.
//  - Los SVG no se sanitizan ni incrustan: solo se devuelve la URL
//    del favicon/logo para mostrarlo con <img> (sin scripts).
// ============================================================

import { createFileRoute } from "@tanstack/react-router";

const MAX_HTML = 400_000;
const MAX_CSS = 200_000;
const MAX_REDIRECCIONES = 3;
const TIMEOUT_MS = 8_000;

function esDestinoSeguro(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return false;
  // Bloquear IPs literales privadas / loopback / link-local / metadatos cloud.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254))
      return false;
  }
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("[::1]")) return false;
  return true;
}

async function fetchTextoSeguro(
  urlInicial: string,
  tipoEsperado: RegExp,
  maxBytes: number,
): Promise<{ texto: string; urlFinal: string } | null> {
  let url = urlInicial;
  for (let i = 0; i <= MAX_REDIRECCIONES; i++) {
    const destino = new URL(url);
    if (!esDestinoSeguro(destino)) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "User-Agent": "AgroGlobal-BrandBot/1.0 (demo)", Accept: "text/html,text/css,*/*;q=0.1" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        url = new URL(loc, url).toString();
        continue; // revalida el destino en la próxima iteración
      }
      if (!res.ok) return null;
      const tipo = res.headers.get("content-type") ?? "";
      if (!tipoEsperado.test(tipo)) return null;
      const texto = (await res.text()).slice(0, maxBytes);
      return { texto, urlFinal: url };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function extraerColores(fuente: string): string[] {
  const conteo = new Map<string, number>();
  const regex = /#([0-9a-fA-F]{6})\b/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(fuente)) !== null) {
    const hex = `#${m[1]!.toLowerCase()}`;
    // Descartar casi-grises (poca saturación): no aportan identidad.
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 40) continue;
    conteo.set(hex, (conteo.get(hex) ?? 0) + 1);
  }
  return [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
}

function extraerMeta(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  return re.exec(html)?.[1] ?? re2.exec(html)?.[1];
}

export const Route = createFileRoute("/api/public/marca/detectar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let url: string;
        try {
          const body = (await request.json()) as { url?: string };
          url = (body.url ?? "").trim();
        } catch {
          return Response.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
        }
        if (!url) return Response.json({ ok: false, error: "Ingresá una URL." }, { status: 400 });
        if (!/^https:\/\//i.test(url)) url = `https://${url}`;

        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return Response.json({ ok: false, error: "La URL no es válida." }, { status: 400 });
        }
        if (!esDestinoSeguro(parsed)) {
          return Response.json(
            { ok: false, error: "Solo se permiten sitios HTTPS públicos." },
            { status: 400 },
          );
        }

        const htmlRes = await fetchTextoSeguro(parsed.toString(), /text\/html/i, MAX_HTML);
        if (!htmlRes) {
          return Response.json(
            { ok: false, error: "No se pudo analizar el sitio (inaccesible o no es HTML). Podés cargar la identidad manualmente." },
            { status: 422 },
          );
        }
        const { texto: html, urlFinal } = htmlRes;

        const titulo = /<title[^>]*>([^<]{1,120})<\/title>/i.exec(html)?.[1]?.trim();
        const themeColor = extraerMeta(html, "theme-color");
        const ogImage = extraerMeta(html, "og:image");
        const iconMatch =
          /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i.exec(html) ??
          /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i.exec(html);
        const appleTouch =
          /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i.exec(html) ??
          /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i.exec(html);
        const manifestMatch = /<link[^>]+rel=["']manifest["'][^>]+href=["']([^"']+)["']/i.exec(html);
        // Logo principal de la cabecera: <img> cuyo class/id/alt/src menciona "logo".
        const logoImg =
          /<img[^>]+(?:class|id|alt|src)=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i.exec(html) ??
          /<img[^>]+src=["']([^"']*logo[^"']*)["']/i.exec(html);
        // Tipografía de referencia: primer font-family con comillas o nombre concreto.
        const fontMatch =
          /font-family\s*:\s*["']?([A-Za-z][A-Za-z0-9 -]{1,40}?)["']?\s*[,;}]/i.exec(html);
        const absoluto = (href?: string) => {
          if (!href) return undefined;
          if (href.startsWith("data:")) return undefined; // no devolver data URIs enormes
          try {
            return new URL(href, urlFinal).toString();
          } catch {
            return undefined;
          }
        };

        // Colores: HTML inline + hasta 2 hojas de estilo del mismo origen.
        let fuenteColores = html;
        const cssLinks = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)]
          .map((m) => absoluto(m[1]))
          .filter((u): u is string => !!u)
          .filter((u) => new URL(u).origin === new URL(urlFinal).origin)
          .slice(0, 2);
        for (const cssUrl of cssLinks) {
          const css = await fetchTextoSeguro(cssUrl, /text\/css/i, MAX_CSS);
          if (css) fuenteColores += "\n" + css.texto;
        }

        const colores = extraerColores(fuenteColores);
        if (themeColor && /^#[0-9a-f]{6}$/i.test(themeColor)) {
          const tc = themeColor.toLowerCase();
          if (!colores.includes(tc)) colores.unshift(tc);
        }

        // Manifest del sitio: íconos de marca declarados por la propia web.
        let iconoManifest: string | undefined;
        const manifestUrl = absoluto(manifestMatch?.[1]);
        if (manifestUrl && new URL(manifestUrl).origin === new URL(urlFinal).origin) {
          const man = await fetchTextoSeguro(manifestUrl, /json|manifest|octet-stream/i, 50_000);
          if (man) {
            try {
              const j = JSON.parse(man.texto) as { icons?: { src?: string }[] };
              const src = j.icons?.find((i) => i.src)?.src;
              iconoManifest = src ? new URL(src, manifestUrl).toString() : undefined;
            } catch {
              // manifest inválido: se ignora
            }
          }
        }

        // Prioridad de logo: cabecera del sitio > og:image > íconos.
        // Nunca se inventa un logo: si no se encontró, logoUrl va vacío.
        const logoUrl = absoluto(logoImg?.[1]) ?? absoluto(ogImage) ?? iconoManifest;
        const faviconUrl = absoluto(iconMatch?.[1]) ?? absoluto(appleTouch?.[1]) ?? iconoManifest;

        const faltantes: string[] = [];
        if (!logoUrl) faltantes.push("logotipo");
        if (!faviconUrl) faltantes.push("favicon");
        if (!colores.length) faltantes.push("colores corporativos");
        if (!titulo) faltantes.push("nombre comercial");

        const tipografia = fontMatch?.[1]?.trim();

        return Response.json({
          ok: true,
          nombre: titulo,
          faviconUrl,
          logoUrl,
          colores: colores.slice(0, 6),
          ...(tipografia ? { tipografia } : {}),
          faltantes,
        });
      },
    },
  },
});
