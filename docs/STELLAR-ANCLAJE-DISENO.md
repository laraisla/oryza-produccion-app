# AgroGlobal — Diseño de anclaje documental en Stellar Testnet

Estado: diseño aprobado por el usuario e implementado como servicio de demo local
en la Etapa 1. Esta descripción conserva el diseño original; los componentes,
controles efectivamente implementados, límites y comandos vigentes están en
`STELLAR-ANCLAJE-OPERACION.md`. La prueba real de Testnet sigue pendiente de
autorización: no se crearon cuentas, usaron claves heredadas ni enviaron transacciones.

## 1. Decisión propuesta

Crear un servicio de evidencia independiente del contrato Soroban de garantía.
Usar el SDK Stellar ya instalado, una cuenta técnica nueva exclusivamente de
Testnet y transacciones clásicas. No hacen falta activos, trustlines, depósitos,
escrow ni un nuevo smart contract para registrar un digest.

La transacción contendría un `MEMO_HASH` con el SHA-256 de 32 bytes y una operación
`ManageData` con nombre técnico fijo `agroglobal:anchor:v1` y el mismo digest como
valor binario. No incluir nombres de empresas, precios, documentos, referencias
comerciales ni URLs privadas. Los vínculos entre digest y entidad quedan fuera de
la cadena, bajo autorización del servidor.

Una clave fija evita aumentar entradas de cuenta por cada documento. Su valor
actual cambia con cada anclaje: la prueba histórica se obtiene de la transacción
confirmada, no del valor actual de la cuenta. El primer registro requiere saldo
de prueba suficiente para la reserva adicional de la entrada; todos requieren
comisión técnica en XLM de Testnet. No son pagos comerciales.

Fuentes oficiales consultadas:

- [Transacciones, memos y secuencias](https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions).
- [ManageData y límites de nombre/valor](https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/operations/object/manage-data).

## 2. Inspección de la implementación existente

| Fuente actual | Qué contiene | Reutilización y estado real |
| --- | --- | --- |
| `src/lib/stellar/terms.ts` | Canonicalización recursiva y SHA-256 con Web Crypto; reglas locales/exportación | Reutilizar la primitiva y conservar el algoritmo histórico. Sus 7 pruebas pasan localmente; no prueban un registro actual en la red. |
| `src/lib/stellar/config.ts` | Configuración tomada del despliegue, cuentas y acuerdos demo; conversión AGROUSD | Reutilizar formatos de enlaces/aviso; no importar cuentas, activo, contrato o modelo de acuerdo en el nuevo servicio. |
| `src/lib/stellar/stellar.server.ts` | Consultas Soroban, eventos, saldo de custodia, firma local con buyer/seller/arbiter | Patrón de aislamiento servidor aprovechable; envío y lectura comercial acoplados al contrato. No reutilizar el firmante ni sus secretos. |
| `src/routes/api/public/stellar/acuerdos.ts` | GET público del contrato y POST de etapas de garantía | Mantenerlo separado. No convertirlo en un endpoint público de firma documental. |
| `src/lib/horizon.ts` | Lectura de transacciones/operaciones, errores y timeout | Reutilizar ideas de validación y errores. El parser actual de operaciones no interpreta el valor de ManageData ni el sobre XDR: debe ampliarse en un adaptador independiente cuando se apruebe. Sus 5 pruebas usan respuestas simuladas. |
| `src/components/stellar/evidencia.tsx` | Diferencia registro local/red, consulta y controles del escrow | Reutilizar patrones de presentación; el componente depende de estados y montos del escrow. |
| `src/components/stellar/compra-garantia.tsx` | Compra, transacción de garantía y posterior registro local | No usar para anclaje documental. Su secuencia cadena → reserva local no es una transacción distribuida. No se modificó ni ejecutó ese circuito. |
| `src/routes/evidencia-stellar.tsx` | Navegación de acuerdos demo y evidencia de garantía | La futura vista documental será independiente y distinguirá el tipo de evidencia. |
| `src/components/evidencia-stellar.tsx` | Evidencias DvP históricas desde Horizon | Es consulta de experimentos previos, no parte del flujo documental nuevo. |
| `blockchain/contracts/agroglobal-escrow/src/lib.rs` | create, accept, deposit, release, refund, cancel, get, verify_terms; token y montos obligatorios | Inspeccionado; no necesario para el anclaje. Tiene 14 tests Rust, no ejecutados: Cargo no está disponible en este entorno. |
| `blockchain/scripts/*` y `blockchain/deployments/testnet.json` | Despliegue, activos y acuerdos históricos | Inspeccionados; no ejecutar ni reutilizar identidades. El manifiesto histórico no demuestra disponibilidad actual de Testnet. |
| `src/test/stellar-firma*.test.ts` | Restricciones de firma local y endpoint | 12 pruebas locales pasan con claves efímeras de test y funciones de envío simuladas. No usan los secretos heredados ni mandan transacciones. |

No se verificó el contrato desplegado en red en esta etapa. No se debe anunciar
una integración nueva como funcional por tener hashes históricos en el repo.

Limitaciones que el nuevo servicio debe resolver: `verificarTransacciones()`
actual comprueba existencia/éxito, no que cada hash aportado pertenezca al
acuerdo esperado; `GET` depende además de estado, eventos y saldo Soroban; no hay
idempotencia durable de envíos documentales. Los controles de producción del
escrow seguirán intactos.

## 3. Componentes propuestos, sin implementación

Separar responsabilidades en un espacio `src/lib/stellar/anchor/`:

| Componente previsto | Responsabilidad |
| --- | --- |
| `types.ts` | Versiones de contenido, evidencias, estados y errores; sin secretos. |
| `digest.ts` | Hash de bytes y manifestaciones normalizadas; sin acceso a red. |
| `service.server.ts` | Autorizar, congelar contenido, preparar solicitud y coordinar almacenamiento/envío. |
| `repository.server.ts` | Interfaz de persistencia de snapshots, claves idempotentes, intentos y confirmaciones. |
| `signer.server.ts` | Único acceso al secreto de la cuenta nueva; firma solo transacciones validadas de anclaje. |
| `transport.server.ts` | Construcción, envío, consulta y reconciliación en Testnet. |
| `verify.server.ts` | Verificación independiente de red, emisor, operación, memo y contenido. |

No importar el objeto `STELLAR` del escrow, sus tipos `AcuerdoStellar` ni su
`montoAUnidades()` desde este servicio. No introducir un nuevo framework, SDK o
contrato. La futura ruta privada se decidirá con el circuito de autenticación;
el endpoint público de garantía no se reutilizará para enviar documentos.

Interfaces conceptuales:

- Solicitar anclaje: entidad + versión + actor + clave de idempotencia. En una
  aplicación empresarial el servidor carga el contenido autorizado; no acepta un
  hash arbitrario del cliente como prueba de un acuerdo aceptado.
- Consultar: identificador de evidencia; devuelve estado y referencias públicas,
  nunca contenido privado ni secretos.
- Verificar: evidencia + versión o archivo autorizado; devuelve comprobaciones
  individuales y resultado `coincide`, `no_coincide` o `no_verificable`.

## 4. Contenido y hashing

Documentos: SHA-256 sobre sus bytes exactos. Conservar una versión inmutable;
reemplazar el archivo crea otra versión. No convertir un PDF a texto ni cambiar
sus metadatos antes de comparar.

Acuerdos: congelar un snapshot con identificador y versión, partes autorizadas,
productos/lotes, cantidades/unidades, moneda y precios, origen/destino, puertos,
fecha e Incoterm/lugar designado, condiciones de pago y aceptaciones si existen.
Excluir estado de UI, preferencias y otros campos mutables. Una cotización demo
no es por sí misma un acuerdo bilateral real.

Definir una versión nueva de serialización estricta: JSON de claves ordenadas,
UTF-8, fechas normalizadas, decimales comerciales como cadenas y rechazo de
NaN, Infinity, valores no JSON y campos obligatorios ausentes. Probar vectores
compartidos en navegador/servidor. No cambiar retroactivamente hashes históricos.

Guardar algoritmo, serialización, digest, entidad/versionado, snapshot o ruta
privada, tamaño y actor. Un archivo o versión diferente nunca reutiliza una
aceptación o evidencia anterior. Para contenido predecible y confidencial,
evaluar un compromiso con nonce en un manifiesto privado; no incorporarlo
silenciosamente al algoritmo de hash de archivos.

## 5. Cuenta técnica y límites de seguridad

- Cuenta nueva, exclusivamente Testnet; no buyer/seller/arbiter/admin anteriores.
- Guardar solo su dirección pública en la configuración pública si es necesario.
- Secreto provisto en runtime únicamente al servidor, desde almacén seguro o
  entorno de proceso local; nunca en Git, frontend, logs, chat o variables VITE.
- Nombres propuestos de configuración, todavía no creados: `STELLAR_ANCHOR_ENABLED`,
  `STELLAR_ANCHOR_PUBLIC_KEY`, `STELLAR_ANCHOR_SECRET`. La red es una constante
  Testnet, no una URL elegible por el cliente.
- Verificar que el secreto corresponde a la cuenta pública permitida y que esta
  es distinta de las cuentas heredadas. Fallar cerrado si falta configuración.
- Comprobar la passphrase `Test SDF Network ; September 2015`, endpoints HTTPS
  permitidos y la red declarada por el proveedor antes de firmar.
- Aceptar únicamente el memo y ManageData previstos; prohibir operaciones de
  pago, exchange, setOptions, trustline o invocación de contrato en el firmante.
- Limitar tamaño de contenido, solicitudes, comisiones e intentos.

El clon actual no tiene autenticación comercial efectiva ni documentos
persistentes. Por ello la primera prueba aprobada debe ser local, con operador
único y material ficticio. Si se incorpora un endpoint de demostración, exigir
desarrollo + habilitación explícita + loopback desde socket, nunca Host/XFF.
No habilitar firma documental en un despliegue público hasta tener autenticación,
autorización y almacenamiento adecuados. No debilitar las guardias del escrow.

## 6. Persistencia, idempotencia y recuperación

Antes de enviar debe existir almacenamiento durable; localStorage y un Map en
memoria no cumplen este requisito. Definir `AnchorRepository` con un adaptador
de prueba en memoria y, para una primera demostración local, un diario durable
de snapshots e intentos fuera de archivos versionados, con escritura atómica,
bloqueo exclusivo y un solo proceso. Ese adaptador no se despliega en Cloudflare
o runtimes efímeros. Para operación empresarial se requiere un adaptador
persistente con unicidad y coordinación entre procesos; PostgreSQL es la opción
natural, pero no se generan ni aplican migraciones en esta etapa.

Unicidad conceptual: red/identidad de red + cuenta técnica + entidad + versión.
La misma clave y mismo contenido devuelve la evidencia existente. La misma
clave con digest o metadatos incompatibles responde conflicto. La verificación
es repetible y no crea otra transacción. Tras un reinicio de Testnet no sobrescribir
evidencias viejas: identificar una nueva época de red y registrar su estado.

Estados propuestos:

`pendiente → preparada → enviada → confirmada`

Ramas adicionales: `resultado_desconocido`, `rechazada`, `expirada`,
`no_verificable`. Un timeout no equivale a rechazo.

Procedimiento:

1. Reservar idempotencia y congelar contenido.
2. Serializar envíos de la cuenta, cargar secuencia y construir transacción con
   vencimiento y comisión acotados.
3. Persistir sobre firmado/identificador esperado, secuencia, límites de tiempo y
   estado `preparada` ANTES de transmitir. El sobre no contiene la clave privada.
4. Enviar y consultar confirmación. Si se corta la respuesta, consultar por el
   hash ya conocido; reenviar el mismo sobre cuando corresponda.
5. Guardar resultado, ledger, fecha y evidencia pública; separar esto de las
   condiciones comerciales, que siguen siendo inmutables.
6. Antes de crear una transacción sustituta, reconciliar el intento anterior y
   demostrar que ya no puede ser incluido. Guardar ambos intentos, nunca borrarlos.

| Error | Tratamiento previsto |
| --- | --- |
| Digest/contenido inválido o acceso denegado | Rechazo sin firma y sin red. |
| Clave idempotente en conflicto | Conflicto, sin nueva transacción. |
| Red equivocada o cuenta inesperada | Fallar cerrado. |
| 429, 5xx, timeout | Reintento acotado con espera creciente/jitter; reconciliar primero. |
| Transacción no encontrada inmediatamente | Pendiente de indexación; no declarar éxito ni fracaso definitivo. |
| Secuencia incorrecta | Revisar intento previo y estado de cuenta antes de reconstruir. |
| Saldo/reserva/comisión insuficiente | Informar error operativo; no fondear automáticamente. |
| Fallo definitivo de transacción | Guardar rechazo y causa; no marcar evidencia confirmada. |
| Caída de red al verificar | `no_verificable` temporal, distinto de contenido alterado. |
| Reinicio/retención de Testnet | Evidencia histórica no consultable; no inventar confirmación. |

## 7. Verificación independiente

Para declarar evidencia válida deben cumplirse todas estas comprobaciones:

1. Proveedor permitido y red/passphrase esperadas.
2. Sobre XDR decodificado; recalcular su hash con la passphrase Testnet y comparar
   con el identificador de transacción consultado.
3. Resultado exitoso y ledger/fecha confirmados por la red.
4. Cuenta fuente, fuente de operación y firma de la cuenta técnica esperadas.
5. Tipo de memo hash y digest de 32 bytes idénticos al esperado.
6. Exactamente la operación ManageData permitida, clave técnica y valor correctos;
   no usar un parser que solamente indique `type: manage_data`.
7. Recalcular SHA-256 sobre el contenido original autorizado, o el snapshot con
   su serialización registrada, y comparar con el digest de esa transacción.

Un enlace al explorador, un JSON local o el éxito de cualquier transacción no
bastan. La UI mostrará cada comprobación y el aviso Testnet. El anclaje acredita
integridad y registro por la cuenta técnica; no certifica calidad del arroz,
autoría empresarial ni validez legal de una aceptación.

## 8. Requisitos para la primera transacción real

- Aprobación explícita de implementar el servicio y, separadamente, de ejecutar
  la prueba de red cuando la implementación esté validada y sea revisable.
- Cuenta Testnet nueva y secreto entregado directamente al runtime servidor.
- Saldo de prueba para comisión y reserva de ManageData; fondeo inicial separado
  y autorizado, sin ejecutar scripts del escrow.
- Red y proveedor verificados; acceso de red disponible.
- Material ficticio, versión congelada y digest reproducido con herramienta
  independiente; sin documentación empresarial confidencial.
- Diario durable y política de un solo proceso para la demostración local.
- Envío deshabilitado por defecto y prueba local autenticada por operador.
- Pruebas sin red de firma aislada, verificación, errores y recuperación aprobadas.
- Elegir el runtime local/servidor; no suponer que el filesystem local sirve en
  el build Cloudflare que genera este repositorio.

## 9. Criterios de aceptación y siguiente implementación

La próxima etapa propuesta, pendiente de aprobación:

1. Implementar digest/versionado, interfaces de repositorio y máquina de estados.
2. Implementar constructor/verificador de transacciones sin red, con vectores
   conocidos, rechazo de Mainnet y de operaciones adicionales.
3. Agregar firmante servidor y adaptador de transporte simulado; probar secreto
   ausente/incorrecto, duplicados, conflictos, reinicio de proceso y timeout tras envío.
4. Incorporar diario local durable y entrada local controlada para seleccionar
   una versión de acuerdo o archivo ficticio; firmar/enviar sigue deshabilitado.
5. Revisar implementación y solicitar autorización concreta para la prueba real.
6. Ejecutar una transacción por evidencia de prueba, registrar hash/ledger/cuenta,
   consultar desde la app y verificar también en explorador/herramienta independiente.

Aceptación de la prueba real: documento y acuerdo reproducen su digest; ambos
pueden verificarse según el punto 7; alterar un byte o una condición produce
`no_coincide`; reintentar la misma solicitud no crea otra evidencia/transacción;
una transacción exitosa ajena se rechaza; una caída no aparenta éxito; no aparecen
secretos en el cliente ni logs; no hay pagos, activos ni llamadas al escrow.

Fuera de esta entrega: implementación de esos componentes, creación/fondeo de
cuenta, envío de transacciones y cambios de backend remoto.
