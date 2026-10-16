# Reglas comerciales y de negocio

Las reglas viven en funciones puras de `src/domain` y en los servicios de `src/data/services` (que agregan control de acceso, auditoría y trazabilidad). Las mismas restricciones críticas se repiten en la base de datos (`supabase/migrations`).

## 1. Estados de verificación de un dato

| Estado | Significado | Requisito |
|---|---|---|
| **Estimado** | Valor de referencia interno o de ejemplo | Fuente indicada |
| **Cotizado** | Presupuesto de un proveedor | Fuente y **fecha de vencimiento** |
| **Verificado** | Confirmado contra una fuente | Fuente, **evidencia** (URL o documento de respaldo) y responsable |
| **Pendiente de verificación** | Requisito o valor no confirmado | Enlace a la fuente oficial cuando existe |
| **Vencido** | Cotizado o verificado con `validUntil` pasado | Se calcula por fecha; no se borra el dato |

- Nunca se pasa a *Verificado* sin evidencia (servicio `changeVerification` y `check` en `verification_records`). Cada cambio guarda historial (de → a, valor, nota, usuario, fecha).
- Editar el importe de un concepto verificado del catálogo sin pasar por *Verificación* lo degrada a *Estimado*.
- Las confirmaciones blockchain no se “verifican” a mano: solo consultando la red.
- Los requisitos documentales oficiales se cargan como *Pendiente de verificación* con el enlace a ARCA/SENASA; la plataforma no afirma que un requisito rija sin evidencia.

## 2. Matching (`domain/matching.ts`)

Cada solicitud se compara contra cada lote **visible y activo** criterio por criterio. Cada criterio informa valor pedido, valor ofrecido, estado y explicación.

| Criterio | Excluyente | Resultado |
|---|---|---|
| Lote activo con stock libre > 0 | Sí | falla si no |
| Categoría de producto | Sí | falla si difiere |
| Tipo comercial (largo fino, jazmín, …) | Sí | **un tipo distinto no es sustituto** (MATCH-01) |
| Variedad | Sí, si el comprador exige variedad exacta | falla si difiere; *faltante* si el lote no la informa |
| Grado de elaboración | Sí | falla si difiere |
| Quebrado, humedad, impurezas máximos | Sí | falla si supera el máximo (MATCH-02); **sin análisis ⇒ faltante ⇒ nunca compatible definitivo** (MATCH-05) |
| Respaldo de calidad | No | *con condiciones* si la calidad es declarada sin verificar o vencida |
| Volumen | Sí | falla si el stock libre no alcanza (MATCH-03) |
| Presentación | Sí | *con condiciones* si el molino declara reenvasado posible o el comprador admite otra presentación; falla si no |
| Disponibilidad en plazo | Sí (si hay plazo) | falla si el lote está disponible después de la fecha pedida |
| Certificaciones exigidas | No | *con condiciones* si no están verificadas o no se informan |

- **Clasificación**: alguna falla excluyente ⇒ *Incompatible*; si no, alguna condición o faltante ⇒ *Compatible con condiciones*; si no ⇒ *Compatible*. Los requisitos excluyentes **nunca se compensan** con un puntaje: el `rank` solo ordena resultados del mismo estado.
- **Consolidación** (si el comprador la admite y ningún lote alcanza solo): se proponen lotes que cumplen todo salvo el volumen, ordenados por menor quebrado, hasta cubrir la cantidad. Es siempre *con condiciones*, avisa si intervienen varios proveedores o si aun así falta volumen y **no reserva stock**.
- Los IDs internos son UUID: dos lotes con el mismo código visible en distintas empresas no comparten stock ni documentos (MATCH-06).
- El resultado guarda la versión del motor; un snapshot puede registrarse con fecha y usuario.

## 3. Cotizaciones

- Una cotización nace de un **escenario de costos** (calculadora o asistente) y se versiona. Cada versión congela escenario, entrada del motor, resultado, términos y `terms_hash`.
- Estados de versión: borrador → enviada → aceptada / rechazada / vencida; una nueva versión **reemplaza** a las anteriores no respondidas.
- **Una versión enviada o aceptada es inmutable** (servicio `addQuotationVersion` y triggers `protect_quotation_version` / `protect_version_costing`). Para cambiar algo se crea otra versión.
- El comprador ve términos, precio, Incoterm, lugar y vigencia; **nunca** costos, márgenes ni el escenario del vendedor (`redactVersion` en la app; tabla privada `quotation_version_costing` en la base).
- Aceptar exige: empresa compradora con rol comprador/administrador, versión enviada, no vencida, cotización sin otra versión aceptada y stock libre suficiente en los lotes. La aceptación crea o actualiza la **operación** con exactamente los términos de esa versión.
- Rechazar exige motivo.

## 4. Operación y embarque

- Estados: en negociación → confirmada → en preparación → embarcada → cobrada → cerrada (o cancelada).
- La operación conserva producto, lotes y cantidades, precio, total, Incoterm, condición de pago y `terms_hash` de la versión aceptada; esos campos **no se editan** después (trigger `protect_operation_terms`).
- Al aceptar se **compromete** el stock de los lotes (convirtiendo la reserva previa). Al registrar el embarque se descuenta el stock físico y el comprometido.
- El embarque registra booking, buque/viaje, B/L, permiso de embarque, contenedores (número, precinto, bruto, VGM), fechas y cantidad embarcada; *Embarcado* exige cantidad y fecha.

## 5. Documentación (`domain/documents.ts`)

- El checklist se arma con reglas por país de destino (o todos), prefijo NCM, grado de elaboración, modo de transporte, medio de pago y exigencias particulares del comprador. Cada documento indica responsable, emisor, fuente de la regla, estado de verificación del requisito y vencimiento relativo al embarque.
- Transiciones: pendiente ↔ en preparación → presentado → verificado / observado; *No aplica* y *Observado* exigen justificación; **presentado o verificado exigen archivo**.
- Cada archivo es una versión nueva con SHA-256, tamaño y tipo (PDF, imágenes, planillas, texto; máximo 10 MB); las versiones no se modifican.
- Los **documentos financieros** (p. ej. comprobante bancario del cobro) nunca se comparten con la contraparte y solo los ven COMEX/administración del dueño.
- Aviso permanente: cargar o marcar documentos no equivale a una autorización oficial ni reemplaza al despachante, SENASA, la Aduana o el banco.

## 6. Cobros y conciliación

- Los cobros son **registros informativos** (`recordKind = 'informational'`): la plataforma no ejecuta ni confirma operaciones bancarias o cambiarias. Estado del informe bancario: informado por el usuario / consultado en fuente / verificado por el banco.
- Un cobro puede imputarse a varias facturas y una factura recibir varios cobros; las imputaciones no superan el bruto del cobro.
- Las diferencias se explican con causa probable y evidencia requerida (ver [cálculos](calculos.md#4-conciliación-financiera-domainreconciliationts)). Una comisión del exterior no implica incumplimiento: se registra la causa y se deriva a banco/COMEX.
- “Conciliado por operador” solo cuando no quedan diferencias abiertas ni saldo, con nota obligatoria; cierra la operación.

## 7. Trazabilidad y auditoría

- Cada acción relevante genera un **evento de trazabilidad** (lote creado, calidad registrada, oferta publicada, solicitud, cotización enviada/aceptada/rechazada, operación, documentos, despacho, embarque, cobro, conciliación, blockchain, movimientos de stock) y una **entrada de auditoría** con cambios antes/después.
- Los eventos *compartidos* los ve la contraparte de la operación; los internos (costos, cobros, conciliación) no.
- Ambos registros son de solo inserción.

## 8. Control de acceso

| Acción | Productor | COMEX | Comprador | Admin |
|---|---|---|---|---|
| Productos, plantas | ✓ | ✓ |  | ✓ |
| Lotes y stock | ✓ |  |  | ✓ |
| Solicitudes de compra |  |  | ✓ | ✓ |
| Escenarios y cotizaciones (ver costos propios) | ✓ | ✓ |  | ✓ |
| Responder cotizaciones |  |  | ✓ | ✓ |
| Gestionar operaciones y embarques |  | ✓ |  | ✓ |
| Ver operaciones en las que participa | ✓ | ✓ | ✓ | ✓ |
| Documentos propios | ✓ | ✓ | ✓ | ✓ |
| Revisar/verificar documentos de la operación |  | ✓ |  | ✓ |
| Finanzas (facturas, cobros, conciliación) |  | ✓ |  | ✓ |
| Verificaciones y catálogo de costos |  | ✓ |  | ✓ |
| Configuración |  |  |  | ✓ |
| Firmar en Stellar (su propia billetera) | ✓ | ✓ | ✓ | ✓ |

Además de la acción, todo recurso se valida contra la **organización** del usuario: nadie accede a costos, márgenes, cobros o documentos financieros de otra empresa. Lotes: visibles para todos solo si están publicados y activos; solicitudes: públicas, o privadas solo para el comprador y las empresas invitadas (nunca borradores).

## 9. Datos demo

Todo dato demo es ficticio y está marcado: empresas `*.example`, tarifas “Valor de ejemplo (demo) — no es una tarifa vigente”, documentos con la leyenda “DOCUMENTO FICTICIO DE DEMOSTRACIÓN”, cobro `MT103-DEMO-0001`. Derechos de exportación y arancel fitosanitario figuran en 0 y *Pendiente de verificación* con enlace a la fuente oficial: no se aplican sin norma, base y posición verificadas.
