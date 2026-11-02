# Publicación en Vercel

- `vercel.json`: Vercel compila con `NITRO_PRESET=vercel bun run build` (servidor en Node 22, salida en `.vercel/output`). Lovable y Cloudflare no leen este archivo: su compilación no cambia.
- Rama de producción en Vercel: `claude/youthful-lamport-niwhex`. `main` queda libre porque el PR #1 (COBRO CLARO) es otra aplicación que ocupa la raíz del repo.
- Funciona sin variables de entorno. Opcionales: `WHATSAPP_API_KEY` y las de Supabase (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) para el webhook de WhatsApp real; sin ellas el panel muestra "Pendiente de configuración".

# Guía de bienvenida en el selector de espacio de trabajo

- `src/components/guia-bienvenida.tsx` (nuevo): debajo de las opciones Vendedor local / Exportador, una guía que se recorre deslizando: qué es AgroGlobal, qué resuelve, cómo funciona (7 pasos + ejemplo de matching), espacios de trabajo, confianza verificable con Stellar, asistente por WhatsApp, video explicativo y cierre con acceso a ambos espacios.
- `src/components/app-shell.tsx`: el selector pasa a tener scroll propio, indicador "Conocé cómo funciona AgroGlobal" y atajo flotante para volver a elegir el espacio. Las opciones del selector no cambian.
- `src/styles.css`: aparición de secciones ligada al scroll (CSS, sin JS) y trazo animado del diagrama; ambos se desactivan con movimiento reducido.
- Video explicativo: `public/agroglobal-guia.mp4` (3:45, 24,7 MiB; el límite de Cloudflare es 25 MiB por archivo) con portada `public/agroglobal-guia-portada.jpg`. No se descarga hasta tocar play (`preload="none"`). Para reemplazarlo, alcanza con cambiar `VIDEO_GUIA` en el componente.
- El video se grabó con el nombre anterior (AgroMatch COMEX) y se usa tal cual: debajo del reproductor, una nota aclara que antes de llamarse AgroGlobal la plataforma se llamaba AgroMatch COMEX. Si se reemplaza por un video con el nombre nuevo, quitar esa nota (está junto a `VIDEO_GUIA`).

# Cambio de nombre: AgroMatch → AgroGlobal

- Marca visible (títulos, metadatos, textos de la app, asistente, documentación) y nombres internos (`agroglobal-*`, `AgroGlobalEscrow`, contrato `blockchain/contracts/agroglobal-escrow`, User-Agent `AgroGlobal-BrandBot`).
- Video de introducción: `public/agroglobal-intro.mp4`; el logotipo final dice AGROGLOBAL (misma tipografía, Open Sans, y misma animación).
- `localStorage`: la clave pasa a `agroglobal-comex-demo-v3`; si un navegador todavía tiene `agromatch-comex-demo-v3`, se lee una vez y se migra (no se pierden los datos demo ni los acuerdos creados desde la app).
- Stellar CLI: las identidades pasan a llamarse `agroglobal-<rol>`. Para seguir usando las cuentas del contrato desplegado, ver la nota en `blockchain/README.md`. El contrato ya desplegado en Testnet no cambia (mismo Contract ID).
- Se conservan con el nombre anterior solo referencias a cosas que existen así: la rama `feature/agromatch-stellar`, el bundle `AgroMatch-backup-2026-10-21.bundle` y el registro histórico de abajo.

# CAMBIOS — Bloque 1: recorrido comercial

> Registro de cambios por bloque. El historial completo esta en los commits
> del repositorio. El respaldo previo a la reorganizacion de la Fase 2 esta
> en el bundle `AgroMatch-backup-2026-10-21.bundle`, fuera del repositorio.

## Archivos creados
- `src/lib/recorrido.ts` — lógica pura: ids correlativos, reparto de 1–2 lotes, cotización con `comex.ts`, operación vinculada, estado del recorrido (7 pasos).
- `src/test/recorrido.test.ts` — tests: solicitud→matching→cotización→aceptar, idempotencia, 2 lotes, reinicio de demo.
- `docs/CAMBIOS.md` — este registro.

## Archivos modificados
- `src/data/demo.ts` — campos opcionales de vínculo (solicitudId, lotes, operacionId / cotizacionId) en Cotizacion y Operacion. Sin datos nuevos.
- `src/lib/store.tsx` — acciones nuevas `updateSolicitud`, `aceptarCotizacion` (idempotente, reserva stock) y `reiniciarDemoComercial`. No se tocó ninguna acción ni estado de Stellar/WhatsApp.
- `src/routes/matching.tsx` — escenario del recorrido (50 tn, ≤5%, 25 kg, CFR), elegir 1–2 lotes y "Generar cotización".
- `src/routes/calculadora.tsx` — la cotización lleva solicitudId; ids por máximo (sin colisiones); precio sin redondear.
- `src/routes/cotizaciones.tsx` — aceptar usa `aceptarCotizacion` (sin operaciones duplicadas); muestra solicitud, lotes y operación con links; el detalle ya no es una copia vieja.
- `src/routes/operaciones.tsx` — `?op=` abre el detalle; muestra solicitud/cotización; links a documentos y conciliación con `op`. (Bloque Stellar sin cambios.)
- `src/routes/documentacion.tsx` — `?op=` carga destino/Incoterm/comprador y filtra el checklist (kosher solo si se pidió; requisitos de ejemplo por país).
- `src/routes/conciliacion.tsx` — filtro `?op=` y ids de solicitud/cotización/operación.
- `src/routes/trazabilidad.tsx` — ids y lotes reales en el expediente; links a operación, documentos y conciliación. (Pestaña blockchain sin cambios.)
- `src/routes/solicitudes.tsx` — columna con cotización y operación vinculadas.
- `src/routes/index.tsx` — tarjeta "Recorrido de demostración" (7 pasos con check derivado del store) y botón "Reiniciar demo".

## Notas
- "Reiniciar demo": el store guarda todo bajo una única clave de localStorage; borrarla borraría también chats de WhatsApp y acuerdos Stellar. Por eso se reinician solo productos, solicitudes, cotizaciones, operaciones y conciliaciones; el resto queda intacto.
- Archivos mixtos (comercial + integración) editados solo fuera de los bloques protegidos: `store.tsx`, `operaciones.tsx`, `trazabilidad.tsx`, `demo.ts`.
- Archivos protegidos sin cambios: `src/lib/stellar/*`, `src/components/stellar/*`, `src/routes/evidencia-stellar.tsx`, `src/routes/api/**`, `blockchain/**`, `src/data/whatsapp-demo.ts`, `src/lib/agent*.ts`, `src/routes/asistente.tsx`, `src/routes/marketplace.tsx`, `src/routes/configuracion.tsx`.

## Checklist manual (7 pasos)
1. Matching → botón "Recorrido · 50 tn…" → Buscar coincidencias (crea SOL-xxx).
2. Elegir LOTE-B (o dos lotes) → ver asignación de toneladas.
3. "Generar cotización" → se abre COT-2026-xxx con lote(s), 50 tn y CFR.
4. "Aceptada" → se crea OP-2026-xxx; el ID de solicitud y de cotización aparecen en la operación.
5. Operaciones → "Avanzar al siguiente hito" y "Ver documentos" (checklist del destino).
6. Avanzar hasta hito 6 → "Ver conciliación" muestra el cobro de esa operación.
7. "Expediente" → trazabilidad con los mismos ids. Dashboard: 7 checks y "Reiniciar demo".

---
# Etapa 2 — P1 y evidencia DvP (solo lectura, cliente)

## Creados
- `src/lib/horizon.ts` — consultas de solo lectura a Horizon testnet: valida hash `/^[0-9a-f]{64}$/` antes de llamar, parsea operaciones sin asumir campos, clasifica ARROZ/USDC de prueba solo si el emisor coincide, errores controlados ("Horizon no disponible"). Datos públicos únicamente.
- `src/components/evidencia-stellar.tsx` — "Liquidaciones DvP verificadas (motor AgroFlow)": selector de 2 liquidaciones, memo, operaciones, saldos de molino y comprador, links a StellarExpert, badge "En vivo · testnet" solo con datos de Horizon, aviso de caída y texto de activos de prueba.
- `src/test/horizon.test.ts` — hash inválido sin fetch, parseo de operaciones, memo, Horizon caído/503, respuesta incompleta.
- `.claude/launch.json` — configuración del servidor de desarrollo para la vista previa (puerto 8080).

## Modificados
- `src/routes/trazabilidad.tsx` — pestaña nueva "Liquidaciones DvP (AgroFlow)" y lista de hashes de acuerdos propios leídos del store (validados, con link a StellarExpert). Pestañas existentes sin cambios.
- `src/routes/operaciones.tsx` — id de operación sin salto de línea (legibilidad a 1440 px).
- `src/components/app-shell.tsx` — "Powered by AgroMatch COMEX · Demo" (marca unificada).

## Verificación
- Recorrido completo probado en el navegador a 1440×900 (solicitud → matching → cotización → aceptar → operación → trazabilidad); la pestaña DvP mostró datos reales de Horizon.
- Archivos protegidos en esta lista: ninguno (`src/lib/stellar/*`, `src/components/stellar/*`, `evidencia-stellar` de rutas, `api/**`, `blockchain/**`, WhatsApp, `asistente.tsx`, `marketplace.tsx`, `configuracion.tsx` sin cambios).
