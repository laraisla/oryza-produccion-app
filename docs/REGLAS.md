# Tabla de decisiones de conciliación

Fuente de verdad del motor (`src/domain/reconcile.ts`). Cada fila tiene un
código estable que la interfaz muestra junto a su explicación.

## Definiciones

| Término | Significado |
|---|---|
| Unidades menores | Centavos enteros. `$45.000` = `4.500.000`. Nunca decimales binarios. |
| Movimiento acreditado | Fila importada con `estado = acreditado`. Pendiente o revertido **no cuenta**. |
| Disponible del movimiento | `importe − Σ asignaciones vigentes` (0 si no está acreditado). |
| Asignado al pedido | `Σ asignaciones vigentes cuyo movimiento sigue acreditado`. |
| Saldo por conciliar | `total del pedido − asignado al pedido`. |
| Referencia explícita | La referencia del pedido (p. ej. `PED-101`) aparece como secuencia completa de tokens en `referencia` o `descripcion` del movimiento. `PED-1010` **no** coincide con `PED-101`. Si dos referencias se superponen, gana la más larga. |
| Declaración de pago | Texto del cliente. **Nunca** suma dinero conciliado. |

## A. Movimiento que menciona explícitamente al pedido

Se evalúan en orden de fecha (y luego id). El saldo se descuenta en cascada, de
modo que las propuestas visibles nunca suman más que el saldo.

| # | Condición | Resultado | Código |
|---|---|---|---|
| A1 | Moneda del movimiento ≠ moneda del pedido | Sin propuesta; excepción | `MONEDA_DISTINTA` |
| A2 | Estado `pendiente` | Sin propuesta. "No cuenta como acreditado." Siguiente paso: importar movimientos más recientes | `REF_MOV_PENDIENTE` |
| A3 | Estado `revertido` | Sin propuesta. "Revertido: no cuenta." | `REF_MOV_REVERTIDO` |
| A4 | Ya tiene asignación vigente a este pedido | No se vuelve a proponer (ya cuenta) | — |
| A5 | Menciona también otro pedido | Sin propuesta; revisión manual | `REF_VARIOS_PEDIDOS` |
| A6 | La persona rechazó antes esta propuesta | No se vuelve a proponer; se puede deshacer el rechazo | `PROPUESTA_RECHAZADA` |
| A7 | Disponible = 0 por asignaciones a **otros** pedidos | Advertencia "ya utilizado". No se cuenta nuevamente | `REF_MOV_USADO` |
| A8 | Pedido sin saldo (ya conciliado) y el movimiento tiene disponible | Sin propuesta. Queda para revisión (posible pago repetido). No se sugiere devolución | `REF_PEDIDO_CONCILIADO` |
| A9 | Acreditado, misma moneda, disponible = saldo | **Propuesta completa** | `PROP_COMPLETA` |
| A10 | Acreditado, misma moneda, disponible < saldo | **Propuesta parcial**; muestra saldo restante | `PROP_PARCIAL` |
| A11 | Acreditado, misma moneda, disponible > saldo | **Propuesta por el saldo**; el excedente queda en el movimiento para revisión | `PROP_EXCEDENTE` |

Toda propuesta requiere aprobación humana. Importe propuesto = `min(disponible, saldo)`.

## B. Sin movimiento que mencione al pedido (solo importe)

Regla 3: **no se concilia por monto solamente**.

| # | Condición | Resultado | Código |
|---|---|---|---|
| B1 | Movimiento acreditado sin referencia a pedidos conocidos, disponible = saldo, y ningún otro pedido abierto tiene ese saldo | Candidato a verificar. Sin propuesta. Asignación manual con motivo obligatorio | `CAND_IMPORTE` |
| B2 | Igual que B1 pero 2+ pedidos tienen ese saldo | Revisión necesaria: "no se puede distinguir entre …". Sin asignación automática | `CAND_IMPORTE_AMBIGUO` |
| B3 | Ningún movimiento menciona al pedido | Informativo: "no encontrado en los movimientos importados" + período cubierto | `SIN_MOVIMIENTOS` |

Los movimientos que mencionan **otro** pedido nunca son candidatos por importe.

## C. Declaración de pago del cliente

| # | Condición | Resultado | Código |
|---|---|---|---|
| C1 | Menciona una operación que no figura entre los movimientos importados | "No figura en los movimientos importados (período …)". Siguiente paso: importar más recientes o consultar | `DECL_OP_NO_ENCONTRADA` |
| C2 | Menciona un movimiento asignado (sin disponible) a **otro** pedido | Advertencia "ya utilizado". No se suma. Mensaje neutral: puede ser un error o un comprobante reenviado; no implica fraude | `DECL_MOV_USADO` |
| C3 | Menciona un movimiento que referencia a otro pedido (aún sin asignar) | Revisión: la referencia del movimiento corresponde a otro pedido | `DECL_MOV_REF_OTRO` |
| C4 | Menciona un movimiento pendiente o revertido | No cuenta como acreditado | `DECL_MOV_NO_ACREDITADO` |
| C5 | Menciona un movimiento ya asignado a este pedido | Informativo, coherente | `DECL_MOV_ASIGNADO` |
| C6 | Menciona un movimiento disponible sin referencia a otro pedido | Candidato señalado por la declaración. Asignación manual con motivo | `DECL_MOV_CANDIDATO` |
| C7 | Sin operación; hay movimientos disponibles con el importe declarado | Candidatos por importe (sin propuesta) | `DECL_CANDIDATOS_IMPORTE` |
| C8 | Sin operación; no hay movimiento compatible | **"No encontrado en el archivo importado."** No significa "no pagó" | `DECL_SIN_MOVIMIENTO` |
| C9 | Importe declarado ≠ saldo/total | Informativo | `DECL_IMPORTE_DIFIERE` |

## D. Asignaciones y movimientos

| # | Condición | Resultado | Código |
|---|---|---|---|
| D1 | Asignación vigente cuyo movimiento pasó a pendiente/revertido | Deja de contar; revisión (liberar o esperar) | `ASIG_MOV_NO_ACREDITADO` |
| D2 | Movimiento asignado con importe sobrante | Excedente para revisión; la app no recomienda ni ejecuta devoluciones | `MOV_EXCEDENTE` |
| D3 | Movimiento acreditado con disponible y sin pedido ni candidato | "Movimiento sin pedido asociado" | `MOV_SIN_PEDIDO` |
| D4 | Movimiento menciona una referencia con forma de pedido inexistente | Informativo | `MOV_REF_DESCONOCIDA` |

## E. Importación (misma fuente/cuenta + id externo)

| # | Condición | Resultado |
|---|---|---|
| E1 | Clave nueva | Se agrega |
| E2 | Clave existente, mismos datos materiales (fecha, importe, moneda, referencia, estado) | Sin cambios; no se duplica |
| E3 | Clave existente, solo cambia el estado | Actualización de estado; se registra en historial y se recalculan asignaciones afectadas (D1) |
| E4 | Clave existente, cambia fecha/importe/moneda/referencia | **Conflicto**: no se sobrescribe; queda para revisión con ambas versiones |
| E5 | Clave repetida dentro del mismo archivo, idéntica | Se ignora la repetición |
| E6 | Clave repetida dentro del mismo archivo, distinta | Error de fila |
| E7 | Fila inválida (fecha, importe, moneda ≠ ARS, estado, longitudes) | Error con número de fila y motivo; no se importa |

## F. Confirmación (capa de datos)

- Aprobar recalcula la propuesta dentro de una transacción de escritura. Si cambió
  (importe distinto o ya no existe), se rechaza la operación y se pide revisar.
- Nunca se asigna más que el disponible del movimiento ni más que el saldo del pedido.
- Una única asignación vigente por par pedido–movimiento (índice único `activeKey`).
- Doble clic o dos pestañas: IndexedDB serializa transacciones de escritura; la
  segunda encuentra la asignación y no duplica.
