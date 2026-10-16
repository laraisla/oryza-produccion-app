# Registro de funcionalidades: implementado y pendiente

Fecha de corte: 16/10/2026. Cada “Sí” está respaldado por una prueba automática o una verificación ejecutada (ver la columna Evidencia). Nada se declara implementado sin haberlo probado.

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Crear y consultar productos | Sí | *Mis productos*; `tests/integration/catalog.test.ts` (alta, validaciones, permisos) |
| 2 | Registrar cantidades y lotes | Sí | Lotes con stock, calidad, disponibilidad y movimientos; `catalog.test.ts`, `quantity.test.ts`; trigger de stock en `rls.test.sql` |
| 3 | Crear solicitudes de compradores | Sí | Formulario progresivo; `tests/ui/request-form.test.tsx`, `flow.test.ts` |
| 4 | El matching clasifica correctamente | Sí | `matching.test.ts` (MATCH-01…06), escenarios A y B en `flow.test.ts` |
| 5 | Ingresar costos logísticos y comerciales | Sí | Calculadora/asistente: partidas desde catálogo o manuales con fuente, vigencia y pagador; `costing.test.ts` |
| 6 | Resultados reproducibles | Sí | Funciones puras + versión del motor; E2E: volver a CFR 10 % reproduce el mismo precio |
| 7 | El Incoterm redistribuye costos | Sí | `costing.test.ts` (QUOTE-01 y tabla de asignación), `flow.test.ts` (flete: vendedor en CFR, comprador en FOB), E2E |
| 8 | Generar una cotización | Sí | Versiones con hash y vigencia; `flow.test.ts`, E2E; impresión/PDF del navegador y descarga de términos |
| 9 | Una cotización aceptada genera una operación | Sí | `flow.test.ts`, E2E (OP-2026-0002) |
| 10 | La operación conserva productos, cantidades, precios y documentos | Sí | `seed.test.ts`, `flow.test.ts`; trigger `protect_operation_terms` probado en `rls.test.sql` |
| 11 | Registrar cobros y detectar diferencias | Sí | `reconciliation.test.ts`, escenario F en `seed.test.ts` y `flow.test.ts` |
| 12 | Consultar el historial de una operación | Sí | *Trazabilidad* y pestaña del expediente; `seed.test.ts` (hitos de lote a cobro) |
| 13 | Verificaciones con fuente, fecha y estado | Sí | *Verificación* con historial; `verification.test.ts`, `seed.test.ts` (nada verificado sin respaldo), checks SQL |
| 14 | Sin acceso a datos privados de otras organizaciones | Sí | `access.test.ts`, E2E (el comprador no ve costos), 93 aserciones RLS en `rls.test.sql` |
| 15 | Persistencia tras recargar | Sí | `persistence.test.ts`, E2E (recarga conserva operación y documento) |
| 16 | Compila y las pruebas se ejecutan | Sí | `npm run build`, `npm run typecheck`, `npm test`, `npm run test:contract`, `npm run test:db`, `npm run e2e` |
| 17 | Stellar: contrato desplegado y transacción verificable en **Testnet** | **No** | Contrato y transacciones reales verificados en **red local**; Testnet bloqueado por la red del entorno (ver abajo). No se declara implementado en Testnet. |

## Implementado

**Flujo comercial**
- Dashboard con operaciones en curso (avance documental, logístico y de cobro), alertas (datos vencidos, documentos y diferencias a revisar), demanda y actividad reciente.
- Marketplace de lotes publicados (con stock disponible calculado) y solicitudes visibles.
- Mis productos: productos, presentaciones, plantas, lotes con calidad y certificaciones, stock (físico, reservado, comprometido, disponible) y movimientos.
- Solicitudes de compra: formulario progresivo por secciones, pública o privada con invitaciones, certificaciones y documentos del importador, borradores.
- Matching inteligente explicable por criterio, consolidación sugerida sin reservar stock.
- Calculadora COMEX y asistente de 6 pasos con borradores: producto y cantidad (envases con decisión de redondeo, pallets, bruto, contenedores), comprador/origen/destino, condiciones comerciales (FCA, FOB, CFR, CIF, DAP; lugar convenido y tipo de lugar), logística y costos (catálogo, tramos, días libres, incluidos, condicionales, duplicados, pactos), aduana (NCM, derechos y reintegros como pendientes de verificación, requisitos), financiero (medio de pago, anticipo, financiación con convención, tipo de cambio documentado), resultado con gráfico por etapa, sensibilidad ±10 % y comparación de escenarios.
- Cotizaciones versionadas con hash de términos, envío, aceptación o rechazo del comprador, versiones inmutables, impresión/PDF y descarga de términos.
- Operaciones y embarques: expediente con resumen, documentos, embarque (booking, buque, B/L, permiso, contenedores, VGM), finanzas, trazabilidad y Stellar.
- Documentación: checklist por destino/producto/transporte/pago/comprador, responsables, vencimientos, transiciones con reglas, archivos versionados con SHA-256 (hasta 10 MB), aviso de no equivalencia con autorizaciones oficiales.
- Conciliación financiera: facturas, cobros informativos, imputaciones N:M, diferencias explicadas con evidencia requerida, conciliación por operador.
- Trazabilidad (línea de tiempo por operación o por lote) y auditoría con cambios antes/después.
- Verificación: registros con fuente, evidencia, responsable, vigencia e historial; propagación al dato concreto.
- Configuración: usuarios demo, organización (dirección pública Stellar), tipos de cambio, redondeo, red/contrato Stellar, respaldo y restablecimiento de datos.

**Plataforma**
- Roles productor, exportador/COMEX, comprador y administrador con control por organización (servicios de la app y RLS).
- Modo demo sin credenciales, datos ficticios marcados, persistencia en el navegador con recuperación ante datos corruptos.
- Contrato Soroban con pruebas; cliente, firma con Freighter y scripts de despliegue/registro/verificación probados en red local.
- Esquema PostgreSQL/Supabase con RLS, seed SQL generado y pruebas de base.
- Interfaz responsive (capturas de escritorio y móvil en `docs/screenshots/`), accesible (etiquetas, errores asociados, foco), sin errores de consola en las capturas.

## Pendiente

| Pendiente | Motivo / próximo paso |
|---|---|
| Despliegue y evidencia en **Stellar Testnet** | Bloqueo de red del entorno (403 a `soroban-testnet.stellar.org`, `friendbot.stellar.org`, `horizon-testnet.stellar.org`, `stellar.expert`). Con acceso: `npm run build:contract && npm run stellar:deploy -- --network testnet && npm run stellar:demo -- --network testnet && npm run stellar:verify -- --network testnet`, versionar `deployments/testnet*.json` y reconstruir. |
| Adaptador de datos a Supabase (Auth, consultas, Storage privado) | El esquema y la RLS están probados; falta reemplazar el almacenamiento del navegador por llamadas a Supabase y subir archivos a un bucket privado. |
| Creación de la operación como función de base | Hoy la crea la app al aceptar; en Supabase debe hacerla el vendedor o una función `SECURITY DEFINER` a partir de la versión aceptada. |
| Exportación de cotización a PDF generado (QUOTE-06) | Disponible “Imprimir / PDF” del navegador con estilos de impresión; falta un PDF generado con plantilla. |
| Costos reales post-embarque por operación y rutas con tarifas por tramo | Requiere acuerdos con forwarders; hoy las tarifas son partidas con fuente y vigencia. |
| Panel SECOEXPO, integración con WebCOMEX/ARCA/SENASA e integraciones bancarias | Fuera del alcance sin API o permiso contractual: no se simulan conexiones. |
| Asistente de lectura de RFQ bilingües (P1) | No implementado. |
| Tarifas, tipos de cambio y requisitos reales | Todos los valores son demo o pendientes de verificación: deben cargarse y verificarse con fuentes reales. |

## Pruebas manuales sugeridas

1. Recorrer los escenarios A–G del README con los distintos usuarios demo (selector de la barra superior).
2. En la calculadora, cambiar Incoterm, margen, una tarifa en ARS y el tipo de cambio: verificar que cambien precio, pagadores y gráfico, y que volver a los valores iniciales reproduzca el precio.
3. Como comprador, abrir una cotización: no debe verse el desglose de costos ni el margen.
4. Cargar un archivo en un documento y recargar la página: la versión y su hash deben persistir.
5. En *Verificación*, intentar marcar un dato como verificado sin URL ni documento: debe impedirse.
6. Con una red Stellar disponible y Freighter, registrar y confirmar el acuerdo desde la pestaña *Stellar* con las cuentas de vendedor y comprador.
