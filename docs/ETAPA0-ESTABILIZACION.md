# AgroGlobal — Etapa 0: cambios y verificación

Fecha de trabajo: 18 de noviembre de 2026 (America/Buenos_Aires).

Repositorio: `laraisla/oryza-produccion-app`.
Base: `cec7738c759df8c88255f15e00a3d2f804eefc02`.
Rama conservada: `claude/youthful-lamport-niwhex`.

Etapa 0 implementada localmente. Etapa Stellar preparada solamente como diseño,
pendiente de aprobación. Sin commits, push, cambios de remotos/ramas, migraciones,
Supabase remoto, Lovable ni transacciones blockchain. No se leyeron ni usaron las
claves privadas heredadas. No se modificaron otros repositorios.

## Archivos de esta entrega

Rutas relativas a la raíz del repositorio:

| Archivo | Cambio |
| --- | --- |
| `src/lib/comex.ts` | Costos por responsable, seis grupos, seguro separado, cantidades iniciales por contenedor corregidas y validación sin precios/conversiones alternativos. |
| `src/lib/recorrido.ts` | Constructor compartido desde simulación; snapshot de costos y contexto comercial; matching sin sustitución de precio; operación conserva contexto. |
| `src/lib/reservas.ts` (nuevo) | Preparación indivisible de todas las reservas locales, con validación de cantidades y lotes repetidos. |
| `src/lib/store.tsx` | Aceptación aplica productos/operación/cotización/solicitud juntos, o devuelve el estado original. Reserva individual rechaza NaN/Infinity. |
| `src/data/demo.ts` | Campos opcionales de contexto/snapshot y precio en moneda de cotización, compatibles con registros locales anteriores. |
| `src/routes/calculadora.tsx` | Conserva elecciones, carga el precio real del lote, informa entradas incompletas, usa constructor compartido y ofrece USD/ARS sin cambiar la base de cálculo USD. |
| `src/routes/cotizaciones.tsx` | Error de aceptación visible; muestra contexto, moneda correcta, costos de origen y pendientes. Recálculo conserva precio en moneda y margen del snapshot. |
| `src/routes/matching.tsx` | Informa errores de generación, en particular lotes sin precio, sin persistir una cotización engañosa. |
| `src/test/comex.test.ts` (nuevo) | 23 regresiones de costo, escenarios, responsables, contenedores, datos inválidos y pendientes. |
| `src/test/reservas.test.ts` (nuevo) | 18 regresiones de stock, rechazo íntegro, idempotencia, cantidades, lotes repetidos y reservas sucesivas. |
| `src/test/cotizacion-contexto.test.ts` (nuevo) | 8 pruebas de contexto, moneda, snapshot y ausencia de sustituciones silenciosas. |
| `src/test/calculadora-ui.test.tsx` (nuevo) | 2 pruebas de controles de pantalla hasta la cotización y rechazo de precio faltante. |
| `src/test/cotizaciones-ui.test.tsx` (nuevo) | 3 pruebas de aceptación desde la UI, errores sin falso éxito y ausencia de asignación. |
| `docs/ETAPA0-ESTABILIZACION.md` (nuevo) | Este registro de cambios, verificaciones y límites. |
| `docs/STELLAR-ANCLAJE-DISENO.md` (nuevo) | Inspección de blockchain existente, servicio propuesto y prueba Testnet pendiente de aprobación. |

Se formatearon únicamente los archivos TypeScript de esta entrega con Prettier,
siguiendo la configuración existente. Parte del diff corresponde a ese formato.
No cambiaron package.json, bun.lock, Vite/Lovable, migraciones, fuentes Stellar,
endpoints existentes ni el contrato Soroban.

## Defectos corregidos

### Los cuatro errores de COMEX

1. El helper de grupos ya respeta los límites solicitados e incluye F en la
   simulación. Los gastos comerciales y financieros participan de los totales.
2. Se calcula quién paga cada concepto. Un grupo puede ser mixto; los costos del
   comprador no se suman al vendedor, aunque compartan grupo.
3. El seguro internacional tiene naturaleza explícita. Bajo asignación según
   Incoterm se incluye en CIF/CIP y no en CFR. FOB/CFR/CIF se calculan por separado,
   sin copiar el precio del escenario seleccionado a otro. Una asignación manual
   expresa del responsable prevalece sobre la regla simplificada.
4. Los conceptos iniciales por contenedor tienen multiplicador 1: el número de
   contenedores procede del parámetro de la operación una sola vez. Un
   multiplicador adicional explícito sigue siendo válido.

Ejemplo numérico independiente, 10 tn y recargo 20%: arroz USD 1.000, logística
200, flete 300, seguro 10 y gastos financieros 50. Los resultados esperados son
FOB USD 150/tn, CFR 186/tn y CIF 187,20/tn. Con tarifa de flete USD 1.450 y dos
contenedores, el costo es USD 2.900, sin la duplicación anterior a USD 5.800.

### Precios y conversiones sin sustituciones silenciosas

- Se elimina la base alternativa de USD 500 por tonelada.
- Matching rechaza lotes inexistentes o sin precio en lugar de usar USD 520.
- La calculadora carga el precio del lote seleccionado; si falta, deja el precio
  en cero como entrada incompleta visible y bloquea la generación. Los gastos de
  procesamiento no sustituyen el precio del arroz.
- No se interpreta un Incoterm desconocido como FOB.
- No se convierten costos ARS a cero por falta de tipo de cambio.
- Cantidades, importes y cálculos no finitos/negativos se rechazan. Se detectan
  desbordamientos numéricos y ausencia de contenedores para tarifas que los usan.
- La UI oculta los resultados incompletos y ofrece corregir entradas o reiniciar
  los ejemplos. El constructor también valida, aunque se lo invoque sin la UI.

Se conservan los costos iniciales de demostración para mantener el prototipo,
pero la cotización los identifica expresamente como ejemplos y guarda su detalle
y pendientes. No son tarifas reales ni validaciones regulatorias. No se agregaron
aranceles o tasas oficiales. Los costos pendientes no desaparecen: se muestran
como tales. Una cotización generada sigue siendo un borrador de simulación.

### Contexto preservado

La cotización conserva país/provincia de origen, país destino, ambos puertos,
fecha de embarque, moneda, tipo de cambio, Incoterm, lugar designado y asignación
de lotes cuando existe. La fecha de emisión permanece separada del embarque.

El lugar designado de FOB usa salida; CFR/CIF usan destino. El precio base USD
se conserva en el campo existente y se agrega precio en moneda de propuesta para
mostrar ARS correctamente, sin etiquetar un valor convertido como USD.

La operación copia esos datos sin usar la fecha fija `2026-12-01`, inferir un
puerto desde el país destino o confundir lugar designado CFR con puerto de salida.
Matching no inventa puertos ni fecha ausentes: quedan a confirmar. Los registros
históricos no se reescriben ni se migran automáticamente.

### Aceptación y reserva local

Antes de aceptar se validan todas las asignaciones: existencia, estado disponible,
stock, cantidad positiva finita con hasta tres decimales y coincidencia con el
total cotizado. Filas repetidas de un lote se suman antes de validar su stock.

Si falla una asignación, no se cambia ningún producto, cotización, solicitud u
operación. Si todas pasan, un único resultado del reducer aplica el conjunto.
Aceptar nuevamente no duplica la operación ni vuelve a descontar. Dos
cotizaciones sucesivas se evalúan contra el saldo actual de ese reducer.

La UI muestra rechazo y no informa éxito cuando falta stock o asignación. Los
borradores antiguos sin lotes requieren generar una cotización con asignación
desde matching o desde la calculadora abierta con un lote; no se inventa un lote
para aceptar automáticamente.

**Esto protege únicamente el estado local del navegador.** No hay bloqueo SQL,
coordinación entre pestañas/dispositivos ni reservas seguras entre múltiples
usuarios. Esas garantías siguen pendientes del backend persistente.

## Pruebas ejecutadas y resultados

Se instaló únicamente lo fijado en el lockfile mediante
`bun install --frozen-lockfile`; package.json y bun.lock permanecen sin cambios.

| Verificación | Resultado |
| --- | --- |
| `bun run test` y ejecución final con reporte JSON | **91/91 pruebas**, 12 archivos, 0 fallos. Incluye las 37 originales y 54 nuevas. |
| `bun x --no-install tsc --noEmit` | **Pasa**, después de corregir un atributo de test no soportado por los tipos de Testing Library. |
| ESLint de los 13 archivos TS/TSX modificados/nuevos | **0 errores**, 5 advertencias preexistentes de Fast Refresh/dependencias del store. Se compararon con HEAD. |
| `bun run lint --format json` global | **No pasa**: 1.083 errores y 18 advertencias en la ejecución final; 1.081 errores de formato y 2 prefer-const en archivos ajenos a esta entrega. |
| `bun run build` | **Pasa**, cliente/SSR y salida Cloudflare/Nitro. No se desplegó. |
| `git diff --check` | **Pasa**. |
| Tests Rust del escrow | No ejecutados: Cargo no disponible. Contrato y tests inspeccionados, sin cambios. |

Antes de formatear los archivos tocados, el lint global registraba 1.534 errores
y 18 advertencias. No se ejecutó un autofix general para evitar cambios ajenos
al alcance. Los dos errores prefer-const restantes están en
`src/integrations/supabase/previewAuthStorage.ts` y `src/lib/agent.ts`, sin cambios.

Avisos no bloqueantes del build: sugerencia de resolución nativa de paths de
Vite, chunks de más de 500 kB y opción inlineDynamicImports ignorada al usar
codeSplitting. No se cambió la configuración para ocultarlos.

Las pruebas de red existentes usan mocks; las pruebas nuevas no consultan ni
escriben en Supabase o Stellar. Pasar estas pruebas no acredita el funcionamiento
actual de un contrato desplegado ni un circuito comercial multiusuario.

## Problemas pendientes

- Persistencia y autorización empresarial, aceptación bilateral versionada y
  reserva atómica en backend.
- Acuerdos y documentos inmutables autorizados antes de producir evidencia
  empresarial; el estado local todavía puede editarse.
- Validación de costos y documentos reales por operación; el cálculo por
  Incoterm conserva reglas simplificadas y el margen existente como recargo.
- Tarifas e impuestos pendientes requieren entrada/verificación explícita.
- Asignación comercial entre múltiples vendedores y validez de cotizaciones,
  fuera de las correcciones de stock de esta etapa.
- Deuda de lint general y avisos de tamaño/configuración del build.
- La compra con garantía heredada y su coordinación con stock no son parte del
  servicio documental nuevo; no se ejecutaron ni modificaron.
- No se verificó el despliegue en navegador/runtime Cloudflare real ni se hizo
  una prueba visual de producción. Sí se probaron los controles relevantes con
  React Testing Library y se compiló el proyecto.

## Preparación Stellar y próximo paso

El diseño completo está en `STELLAR-ANCLAJE-DISENO.md`: servicio independiente del
escrow, cuenta técnica nueva, firma servidor, SHA-256 de contenido versionado,
memo hash + ManageData, verificación de red/emisor/contenido y diario durable de
intentos para idempotencia y recuperación.

Para una primera transacción faltan aprobación, implementación y pruebas sin
red del servicio, cuenta Testnet nueva con secreto solo servidor, saldo técnico
de prueba, contenido ficticio congelado, almacenamiento durable y un runtime
local controlado. La autorización de una prueba real se solicitará sobre una
implementación concreta ya revisable. No se envió ninguna transacción ahora.
