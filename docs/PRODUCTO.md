# COBRO CLARO — producto

> **Cada pedido, con su cobro claro.**

Prototipo de entrenamiento. Todos los datos de la demostración son sintéticos.

## Usuario inicial (hipótesis)
Un pequeño comercio que recibe pedidos por mensajes (por ejemplo, WhatsApp) y cobra por transferencia,
y que necesita relacionar cada pedido con los movimientos de su cuenta.

## Problema (hipótesis por validar)
Pedido, declaración de pago del cliente («ya te transferí») y movimiento de la cuenta viven en lugares
distintos. Eso puede dificultar detectar pagos parciales, referencias ambiguas y movimientos que ya se
usaron para otro pedido. **No hay cifras, entrevistas ni pérdidas medidas todavía** (ver docs/VALIDACION.md).

## Recorrido central
```
mensaje → pedido revisado → movimientos importados (CSV) → propuesta → aprobación humana → resultado explicado + siguiente acción
```
El diferencial buscado no es un chatbot ni un tablero: es completar ese recorrido con pocas acciones y
**evidencia visible** («¿Por qué aparece este resultado?»).

## Qué hace hoy
| Capacidad | Cómo |
|---|---|
| A. Crear y revisar pedidos | Formulario, o pegar un mensaje → borrador editable con el texto original al lado. Revisión obligatoria antes de guardar. |
| B. Importar y proponer | CSV propio ([formato](FORMATO_CSV.md)) con vista previa, errores por fila, deduplicación y conflictos. Propuestas con reglas explícitas ([tabla de decisiones](REGLAS.md)). |
| C. Revisar y confirmar | Pedido, movimiento y explicación en la misma pantalla. Aprobar, rechazar, asignar manualmente con motivo, liberar. Historial local. Mensajes de consulta editables (no se envían solos). |
| Datos | Cargar ejemplo, reiniciar (con confirmación), exportar/restaurar JSON validado, eliminar datos locales (solo de esta app). |

## Reglas clave (resumen)
- Dinero en centavos enteros; solo ARS; sin conversión.
- **Nunca por monto solamente**: propuesta = referencia explícita + misma moneda + acreditado.
- Varios movimientos por pedido; nunca más que el disponible del movimiento ni más que el saldo.
- Un movimiento usado no se cuenta otra vez (controlado en la capa de datos, con transacción).
- Pendiente o revertido no cuenta; un cambio de estado saca la asignación del conciliado y la marca para revisión.
- Excedente: queda para revisión; la app no recomienda ni ejecuta devoluciones.
- «No encontrado en los movimientos importados» ≠ «no pagó».

## Arquitectura
| Capa | Ubicación | Notas |
|---|---|---|
| Interfaz | `src/app`, `src/components` | Next.js 16 (App Router), Tailwind 4, íconos locales, fuente Inter empaquetada (sin descargas externas). |
| Reglas de conciliación | `src/domain` | Puras: sin interfaz, sin red, sin IA, sin fecha actual. |
| Importación | `src/importing` | PapaParse + validación por fila + plan de importación. |
| Almacenamiento | `src/storage` | IndexedDB (Dexie). Transacciones atómicas; exportar/restaurar validado. |
| Extracción asistida | `src/extraction` | Interfaz común; reglas (cliente) y API opcional (solo servidor, `src/app/api/extraer`). |
| Datos de demo | `src/demo` | Solo entradas (pedidos, declaraciones, CSV). |

Límites de esta arquitectura: un comercio por navegador, sin sincronización entre dispositivos, el
almacenamiento del navegador puede borrarse, no es multiusuario ni está preparada para producción.

## Modelo de datos
- **Pedido**: id, referencia (única), cliente ficticio, total (centavos), moneda, fecha, detalle, entrega, mensaje original. El **estado** se calcula: sin conciliar / parcial / conciliado con el archivo.
- **Declaración de pago**: pedido, texto recibido, importe declarado, operación mencionada. No suma dinero.
- **Movimiento**: clave `cuenta|id externo`, cuenta, fecha, importe, moneda, estado, referencia, descripción, procedencia (archivo, fila, fecha de importación).
- **Importación**: archivo, fecha, cuentas, período cubierto, contadores.
- **Conflicto**: versión guardada vs. versión nueva; nunca se sobrescribe.
- **Asignación**: movimiento, pedido, importe, tipo (propuesta aprobada / manual con motivo), confirmada por la persona usuaria, vigente/liberada.
- **Rechazo** y **Historial** (acción, fecha, entidades, motivo). El historial es local y modificable técnicamente.

## Extracción asistida (alcance honesto)
- **Asistencia por reglas** (por defecto, sin red) reconoce formatos simples: «Soy/Me llamo X», «total de $45.000»,
  «Referencia PED-101», «3 productos», «Retiro…/Envío…», fechas `DD/MM/AAAA`. Lo que no entiende queda vacío.
- **Asistencia con IA (API)**: opcional, desactivada por defecto, configurable por variables del servidor. Solo copia
  fragmentos literales; el código verifica que cada valor aparezca en el mensaje e interpreta importes y fechas.
- Ambas: fechas relativas («el viernes») piden confirmación; varios importes no se resuelven solos; frases con forma de
  instrucción se señalan y no tienen efecto; no existe ningún campo de «pagado» en el borrador.
- No es un «agente autónomo»: extrae campos y propone borradores.

## Fuera de alcance
WhatsApp real, homebanking, transferencias, devoluciones, créditos, facturación fiscal, inventario, sucursales,
multimoneda, OCR de comprobantes, app nativa, multiagente, blockchain.
