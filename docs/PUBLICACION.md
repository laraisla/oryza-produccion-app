# Publicación segura para el jurado — AgroGlobal COMEX

> **Estado actual (Fase 2, 21/10/2026).** `main` ya fue restaurada en GitHub y
> contiene el código de `presentacion`: `main` = `origin/main` =
> `presentacion` = `origin/presentacion` = `ccac3e3`. Los cambios de la Fase 2
> están preparados **solo** en `chore/saneamiento` (staged), sin commit ni push.
> La rama predeterminada del remoto todavía es `presentacion`.
>
> **Regla vigente:** no hacer force push, rebase ni amend de commits ya
> publicados. Push, PR, merge, publicación en Lovable y migraciones requieren
> autorización explícita. Solo Stellar **Testnet**.

## 1. Histórico — Auditoría de seguridad (16/10/2026)

Build de producción (`bun run build`, preset `cloudflare-module`) ejecutado en el
runtime real de Cloudflare (`wrangler dev`, workerd) en `127.0.0.1:8790`, con
`STELLAR_DEMO_SIGNING=1` cargado a propósito para simular una mala configuración.

| Verificación | Resultado |
|---|---|
| Build | Compila sin errores. Subida medida con `wrangler deploy --dry-run`: 4,7 MB / **934 KiB gzip** (límite gratuito de Workers: 3 MB gzip) |
| Guardia de firma en el build | `entornoLocal()` compilado como `return false` (`import.meta.env.DEV` se fija en build): el código desplegado no puede firmar aunque existan variables o claves |
| `GET ?info=1` (con y sin `Host: localhost`, `X-Forwarded-Host: localhost`) | `firmaHabilitada: false` |
| `POST` create / accept / deposit / release / refund, con `Host` y `X-Forwarded-Host` falsificados | **10/10 → HTTP 503** "Solo lectura" |
| `PUT` / `PATCH` / `DELETE` | Sin manejador: el router devuelve la página HTML (igual que los endpoints existentes de Lovable); no ejecutan código de firma |
| Lectura pública | Acuerdo #0 desde el Worker: `Released`, `verify_terms` = true, 4 eventos, transacciones confirmadas en Horizon (el SDK de Stellar funciona en Workers) |
| Navegador sobre el build | Indicador "Modo público: solo lectura", estados reales de #0 y #1, 4/4 transacciones confirmadas y 8 enlaces al explorador por acuerdo, sin botones de firma, compra deshabilitada, **0 POST** enviados, consola sin errores |
| Validación de entrada | `id` y hashes inválidos → 400 |
| Otros endpoints públicos existentes | Webhook WhatsApp sin configurar → 503; detección de marca rechaza `localhost`/`127.0.0.1` (400) |
| Secretos en lo que descarga el navegador (`.output/public`, 65 archivos, sin source maps) | 0 claves; 0 referencias a `STELLAR_DEMO_*`; el SDK de Stellar no está en el bundle del cliente |
| Secretos en servidor, archivos versionados e historial git completo | 0 claves Stellar (`S…`); las únicas coincidencias de patrones son el texto `'sb_secret_'` en código generado por Lovable (comparación de prefijo, no una clave) |
| `.env` versionado | **Ya no se versiona** (Fase 2, 21/10/2026). La plantilla [`.env.example`](../.env.example) documenta la URL y la clave **publicable** de Supabase (`sb_publishable_…`), pensada para el navegador. Sin `service_role`. Los valores reales quedan en el `.env` local, ignorado por Git |
| Archivos locales sensibles | `.env`, `.env.local`, `.output/`, `.wrangler/`, `.dev.vars` ignorados por git; claves de Stellar CLI en `~/.config/stellar` (fuera del repo) |

Limitación conocida (no bloqueante para el jurado): los endpoints públicos no
tienen límite de pedidos (rate limiting). La lectura solo consulta Testnet.

## 2. Histórico — plan de integración de `feature/agromatch-stellar` (superado)

> **No ejecutar.** Se conserva únicamente como registro. La Fase 1
> (21/10/2026) restauró `main` con un *fast-forward* de `d5a199f` a `ccac3e3`
> (101 commits), que ya incluyen el trabajo de `feature/agromatch-stellar`.
> Por eso ya no corresponde publicar esa rama, abrir un PR desde ella ni
> mergearla: `main` y `presentacion` ya apuntan al mismo commit en GitHub.
> La rama `feature/agromatch-stellar` sigue solo en local (`77c9107`,
> 98 commits) y su publicación no está autorizada.

El plan original proponía subir `feature/agromatch-stellar`, abrir un PR a
`main`, mergearlo y luego actualizar Lovable. Quedó superado por la
restauración de `main`; no lo ejecutes.

## 3. Checklist vigente — Fase 2 (solo cuando autorices)

Punto de partida: los cambios están **staged solo en `chore/saneamiento`**,
sin commit ni push. `main`, `presentacion` y sus remotos apuntan a `ccac3e3`.

- [ ] `git branch --show-current` → `chore/saneamiento`.
- [ ] `git diff --cached --name-only` → solo los archivos de la Fase 2; sin `.env`, `.env.local` ni `package-lock.json`.
- [ ] `git status --short` → sin cambios fuera del índice. `.env` figura como eliminado del índice porque deja de versionarse, pero sigue existiendo en disco e ignorado por Git.
- [ ] `bun install --frozen-lockfile && bun run test && bunx tsc --noEmit && bun run build` sin errores (pendiente: Bun no está instalado en esta máquina).
- [ ] Commit en `chore/saneamiento` (nunca en `main` ni en `presentacion`).
- [ ] Push de `chore/saneamiento` y PR a `main`; revisar el diff: sin secretos, sin `.env.local`, sin `package-lock.json`.
- [ ] Merge del PR con merge commit; nunca force push, rebase ni amend de commits publicados.
- [ ] Lovable: confirmar que `main` se sincronizó, que la vista previa compila y que `/evidencia-stellar` dice **"Modo público: solo lectura"**.
- [ ] Lovable: **Publish → Update**.
- [ ] Verificar el sitio publicado:
  ```sh
  curl -s https://instant-capture-grid.lovable.app/api/public/stellar/acuerdos?info=1
  # {"ok":true,"red":"testnet","firmaHabilitada":false}
  curl -s -X POST -H "content-type: application/json" -d '{"etapa":"accept","id":0}' \
    https://instant-capture-grid.lovable.app/api/public/stellar/acuerdos
  # {"ok":false,...} HTTP 503
  ```
- [ ] Abrir `/evidencia-stellar?acuerdo=0` y `?acuerdo=1` publicados: estados Liberado / Reembolsado y transacciones confirmadas.
- [ ] No aplicar `db/propuesta/` (sin autorización).
- [ ] Pendiente opcional: la rama predeterminada de GitHub sigue siendo `presentacion`; cambiarla a `main` requiere autorización.

Precauciones vigentes:

- No cargar `STELLAR_DEMO_*` como secretos en Lovable (además serían ignorados por el build).
- No pedir a la IA de Lovable que "arregle" `blockchain/`, `src/lib/stellar/` ni `db/propuesta/`.
- `src/routeTree.gen.ts` lo regenera el build; si hay conflicto, aceptar cualquiera y dejar que se regenere.
- `db/propuesta/` está fuera de `drizzle/migrations`: Lovable no la aplica.
- Reversión: `git revert -m 1 <merge-commit>` en `main` (Lovable sincroniza la reversión) o restaurar desde el historial de versiones de Lovable.

## 4. Checklist de presentación

Antes (30 min):

- [ ] Computadora de la demo: `bun run dev`, abrir **`http://localhost:<puerto>`**.
- [ ] `…/api/public/stellar/acuerdos?info=1` → `firmaHabilitada: true` (si no: `.env.local`, ver `docs/DEMO-IDEATHON.md`).
- [ ] Pie de página → **Restablecer datos demo**.
- [ ] Pestañas abiertas: app local, Stellar Expert (contrato), sitio público (`/evidencia-stellar`) como respaldo.
- [ ] Una pasada completa de prueba (≈ 2 min; cada paso 5–10 s).

Durante (5 min), según `docs/DEMO-IDEATHON.md` §2:

- [ ] Decir: "Stellar Testnet — demostración con activos sin valor monetario real".
- [ ] Molino Azul publica un lote → Bordó lo compra como **venta local** (sin Incoterm).
- [ ] Evidencia Stellar: Creado → **Aceptar** → **Depositar** (en custodia) → **Liberar**.
- [ ] Abrir un hash en Stellar Expert.
- [ ] Operaciones: Incoterm "No aplica", acuerdo Liberado, stock descontado.
- [ ] (Opcional) Exportación + reembolso del árbitro; intento de compra propia bloqueado.

Respaldo si falla la red o la firma:

- [ ] Sitio público o local en solo lectura: acuerdos #0 (exportación, liberado) y #1 (local, reembolsado) con sus enlaces al explorador.
