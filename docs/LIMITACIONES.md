# Limitaciones

## Qué está implementado, qué se simula y qué requeriría una integración
| Implementado | Simulado / acotado | Requeriría integración autorizada |
|---|---|---|
| Pedidos (formulario y mensaje → borrador revisado) | Todos los datos de la demo son sintéticos | Obtener movimientos directamente de un banco o billetera |
| Importación de un CSV **propio** con validación, deduplicación y conflictos | «Acreditado» = lo que dice el archivo | Autenticar el origen de un archivo o certificar saldos |
| Propuestas por reglas explícitas y aprobación humana | Un comercio por navegador; sin usuarios ni sincronización | Recibir o enviar mensajes de WhatsApp automáticamente |
| Explicaciones, mensajes sugeridos, historial local | La extracción por reglas entiende formatos simples | Devoluciones, transferencias, facturación, multimoneda (fuera de alcance) |
| Exportar / restaurar JSON validado; borrar datos locales | IA opcional, desactivada por defecto | |

## Datos y almacenamiento
- IndexedDB del navegador: **no** se sincroniza entre dispositivos y puede borrarse al limpiar datos del sitio,
  en modo privado o por falta de espacio. Exportá un respaldo si querés conservarlo.
- No es una arquitectura multiusuario ni está preparada para producción.
- El historial es local y **puede modificarse técnicamente**: no es inmutable ni prueba legal.
- Si el navegador rechaza una escritura (cuota, bloqueo), la app muestra el error y no confirma el guardado.

## Reglas y resultados
- El prototipo concilia los datos suministrados; **no** autentica el origen del archivo ni certifica el saldo bancario.
- «No encontrado en los movimientos importados» no significa «no pagó».
- No detecta fraude. Un movimiento ya utilizado se señala como excepción para revisar, sin acusar.
- Solo ARS; importes positivos (ingresos). Sin conversión de monedas.
- La coincidencia de referencias es por tokens (`PED-101` = `ped 101` = `PED101`; `PED-1010` ≠ `PED-101`).
  Referencias escritas de otras formas no se reconocen.
- Conflictos de importación: se conservan los datos anteriores; el prototipo no permite reemplazarlos.
- Formato CSV propio: no es compatible con los archivos de ningún banco sin conversión previa.

## Extracción asistida e IA
- Por reglas: solo formatos documentados (docs/PRODUCTO.md). No simula comprensión general.
- API (opcional): requiere `AI_EXTRACTION_ENABLED=true`, `ANTHROPIC_API_KEY` y `EXTRACTION_MODEL` en el servidor.
  **No fue probada contra el servicio real** en este entorno (sin credenciales); las pruebas usan el SDK simulado.
- Protecciones del endpoint (mismo origen, encabezado propio, tamaño, frecuencia, cupo diario, tiempo de espera)
  son para una demo local. **Un despliegue público con IA activa requiere autenticación y control de gasto reales.**
- Un JSON válido puede tener errores: por eso cada valor debe aparecer en el mensaje y la persona revisa antes de guardar.

## Seguridad
- No se piden claves bancarias, tokens ni tarjetas. No hay secretos en el repositorio; `.env*` está ignorado salvo `.env.example`.
- La clave de la API (si se usa) vive solo en el servidor; se verificó que no aparece en el bundle del navegador.
- Encabezados: CSP sin orígenes externos (producción), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`.
- `npm audit` informa 5 vulnerabilidades «high» en `braces`, dependencia transitiva de `eslint-config-next`
  (solo herramientas de desarrollo; no llega al bundle). Se dejan documentadas hasta que la cadena upstream se actualice.

## Entorno y herramientas
- npm 10.9 falla al resolver dependencias nuevas de Vitest 4 («Cannot read properties of null (reading 'edgesOut')»).
  `npm ci` con el lockfile funciona; para **agregar** dependencias usar `npx npm@11 install …`.
- Las pruebas de navegador se ejecutaron con Chromium (Playwright 1.56.1). No se probaron Firefox ni Safari.
- La revisión de accesibilidad es automática (axe, WCAG 2.1 A/AA) más navegación con teclado; no reemplaza pruebas con personas.
- Las bases del NEA TECH no se pudieron leer desde el entorno (ver docs/EVENTO.md).
