# Guía de demo — AgroGlobal COMEX × Stellar (Ideathon NEA TECH)

**Mensaje central:** AgroGlobal conecta productores y compradores de arroz; el
acuerdo comercial se ancla en un contrato inteligente Soroban con depósito en
garantía, y cualquiera puede verificarlo en el explorador de Stellar.

> Decirlo siempre: **Stellar Testnet — demostración con activos sin valor
> monetario real.** No son pagos bancarios ni contratos comerciales reales.
> Empresas y datos comerciales son ficticios.

## 1. Comandos para iniciar (PowerShell, Windows)

```powershell
cd "C:\Users\laray\OneDrive\Escritorio\FACU\CURSOS\NEA-TECH-ARROZ\instant-capture-grid"
git switch feature/agromatch-stellar
$env:Path = "$env:USERPROFILE\.bun\bin;$env:USERPROFILE\.local\stellar-cli;$env:Path"
bun install --frozen-lockfile
bun run dev
```

Vite muestra la URL (`http://localhost:8080`, o `8081` si el 8080 está ocupado).
**Abrir siempre con `localhost`**: por la IP de la red la firma queda deshabilitada a propósito.

Comprobaciones (en otra terminal, ajustando el puerto):

```powershell
curl.exe -s "http://localhost:8080/api/public/stellar/acuerdos?info=1"
# esperado: {"ok":true,"red":"testnet","firmaHabilitada":true}
curl.exe -s -o NUL -w "%{http_code}`n" "http://localhost:8080/evidencia-stellar"
# esperado: 200
```

Si `firmaHabilitada` es `false`, falta `.env.local` (claves de las cuentas **de prueba**, ignorado por git).
Recrearlo sin mostrar las claves en pantalla y reiniciar `bun run dev`:

```powershell
$lineas = @(
  "# Cuentas de PRUEBA de Stellar Testnet (sin valor). Nunca commitear.",
  "STELLAR_DEMO_SIGNING=1",
  "STELLAR_DEMO_BUYER_SECRET=$(stellar keys secret agroglobal-buyer)",
  "STELLAR_DEMO_SELLER_SECRET=$(stellar keys secret agroglobal-seller)",
  "STELLAR_DEMO_ARBITER_SECRET=$(stellar keys secret agroglobal-arbiter)"
)
$lineas | Set-Content -Encoding utf8 .env.local
```

Antes de presentar: en el pie de página, **Restablecer datos demo** (deja el catálogo
limpio; los acuerdos de referencia #0 y #1 se conservan).

## 2. Recorrido (5 minutos) — probado de punta a punta en navegador

| # | Pantalla | Acción | Qué decir |
|---|---|---|---|
| 1 | Selector inicial → **Exportador / COMEX** (Molino Azul) · **Mis productos** | Cantidad 50, precio 510 → **Publicar lote** | "El productor publica su lote." |
| 2 | Barra superior → empresa **Bordó Alimentos** → **Comprador internacional** · **Marketplace** | En el lote publicado: **Comprar con garantía Stellar** | "Ahora somos otra empresa, el comprador." |
| 3 | Diálogo de compra | **Venta local** (no pide Incoterm), 12 tn → **Generar acuerdo en Stellar Testnet** | "Las condiciones se hashean; solo el hash va a la cadena. Firma el comprador." (Si se pide más que el stock, el botón se bloquea.) |
| 4 | **Evidencia Stellar** (abre sola, ~10 s) | Mostrar *Creado*, la verificación cruzada y la transacción confirmada | "Esto se consulta al contrato en este momento. Izquierda: lo que guardó AgroGlobal. Derecha: lo que confirma Stellar." |
| 5 | Misma vista | **Aceptar condiciones** → **Depositar en garantía** → **Confirmar entrega y liberar** | "Cada paso es una transacción real firmada por quien corresponde. Miren 'Depósito en garantía': en custodia del contrato, y luego liberada." |
| 6 | Clic en un hash → Stellar Expert | — | "Cualquiera lo verifica sin confiar en AgroGlobal." |
| 7 | **Operaciones** → Detalle de la operación de Bordó | — | "Venta local: Incoterm y permiso de embarque no aplican. El acuerdo figura como liberado, leído de la red. El stock bajó de 50 a 38 tn." |

Opcional (1 min): repetir la compra como **Exportación** (pide Incoterm y puerto),
depositar y **Reembolsar (árbitro)**. Mostrar también que con **Molino Azul**
activa la app no permite comprar su propio lote.

## 3. Contrato y transacciones verificadas en Testnet

Verificado el 16/10/2026 consultando el contrato (`get`, `count`) y cada hash en Horizon.

| Elemento | Valor |
|---|---|
| Contract ID (agroglobal-escrow) | `CAERX6PVDUP5ZQNOL7RS2JC3GKHMAYBFGGJBZ24XN5ZQYS4GTOTCHDH2` |
| SHA-256 del WASM (igual al compilado) | `51573fd8e93acbd6cf66e010113b6bd2592fc19e8240ea41207fbaf1b3b9c04e` |
| Activo de prueba AGROUSD (contrato SAC) | `CDO7QI6PFDEKTUUR6QPH5WMHCUKONVFCJLKHJFHOOBZ3ZK3ENTXCD3IL` |
| Transacciones de despliegue | 6 de 6 confirmadas (ver `blockchain/deployments/testnet.json`) |

| Acuerdo | Orden | Tipo | Estado en cadena | Monto (prueba) | Transacciones |
|---|---|---|---|---|---|
| #0 | OC-2026-0001 | Exportación | Released | 20.800 AGROUSD | 4/4 confirmadas |
| #1 | OC-2026-0002 | Local | Refunded (árbitro) | 5.200 AGROUSD | 4/4 confirmadas |
| #2 | OC-PRUEBA-API | Local | Released | 2.400 AGROUSD | 4/4 confirmadas |
| #3 | OC-20261016-6772 | Local | Released | 6.120 AGROUSD | 4/4 confirmadas |
| #4 | OC-20261016-6422 | Local | Released | 6.120 AGROUSD | 4/4 confirmadas |
| #5 | OC-20261016-9619 | Exportación | Refunded (árbitro) | 2.550 AGROUSD | 4/4 confirmadas |

#0 y #1: scripts de despliegue (aparecen siempre en la app). #2: prueba por API.
#3–#5: pruebas automáticas desde la interfaz (navegador). Explorador:
https://stellar.expert/explorer/testnet/contract/CAERX6PVDUP5ZQNOL7RS2JC3GKHMAYBFGGJBZ24XN5ZQYS4GTOTCHDH2

Hashes de los acuerdos de referencia (para mostrar si la red falla):

- #0 create `85d91d145b58624fe9f5665c1751416f1a0beff6c758169e3778b89bdbfc76b6` · release `8bed5f351c8c74868f287b549adb7070b2a19217c14813be7a531b8b3e97b33a`
- #1 create `4f18968a6cd6b5cc6256f5aa612bf2c561b98b599bdbc1b78cfbf2de9c90a8e6` · refund `6172226f7576cdc4f2fbadab5c13a692ed2349b4ccc733b85d6efe005bcc3a81`

## 4. Si algo falla

- **La red tarda:** cada paso tarda 5–10 s. Justo después de un paso, una transacción puede figurar "Pendiente de indexación en Horizon" unos segundos; la página reintenta sola y nunca la marca como confirmada antes de tiempo.
- **Sin red o RPC caído:** mostrar #0/#1 y los enlaces del explorador desde otra conexión. Los datos locales se muestran como "Registro local", no como prueba.
- **`firmaHabilitada: false`:** revisar `.env.local`, abrir con `localhost` y reiniciar `bun run dev`. La app queda en solo lectura (no simula transacciones).
- **Saldo de prueba:** al comprador le quedan ~64.560 AGROUSD; cada compra admite hasta 50.000. Para recargar:
  `stellar contract invoke --id CDO7QI6PFDEKTUUR6QPH5WMHCUKONVFCJLKHJFHOOBZ3ZK3ENTXCD3IL --source-account agroglobal-admin --network testnet -- mint --to GBP57FLASGVQ5GAPHFSOU27IOPT6ONVATESTSEJKP4EGFGGKQ5GDFDXR --amount 1000000000000`

## 5. Qué es real y qué es demo

| Real (verificable en Testnet) | Demo / pendiente |
|---|---|
| Contrato Soroban desplegado y sus reglas (14 pruebas) | Empresas, productos y precios ficticios |
| Creación, aceptación, depósito, liberación y reembolso | Activo AGROUSD sin valor; firma por el servidor local con cuentas de prueba |
| Hash de condiciones verificado en la cadena | Catálogo, órdenes e inventario en el navegador (Supabase: propuesta lista, no aplicada) |
| Eventos y transacciones consultados en vivo | Login de empresas; WhatsApp sin conectar al inventario único |
| La app publicada nunca firma (el build desactiva la firma) | Firma con billetera del usuario (Freighter) |

## 6. Preguntas probables

- **¿Por qué Stellar?** Comisiones mínimas, confirmación en segundos, activos emitidos de forma nativa (un stablecoin real podría reemplazar AGROUSD) y contratos Soroban para la garantía.
- **¿Quién controla los fondos?** El contrato. Solo el comprador (o el árbitro) libera; el comprador solo puede pedir reembolso tras el vencimiento; el vendedor no puede liberarse los fondos.
- **¿Qué datos van a la cadena?** Partes, monto, referencia de orden y hash de condiciones. Nunca precios ni datos comerciales en claro.
- **¿Quién firma en la demo?** El servidor local, con cuentas de prueba, para no depender de billeteras en el escenario. El paso siguiente es que cada empresa firme con su billetera (Freighter).
- **Próximo paso:** persistencia en Supabase con RLS por empresa (esquema ya validado), firma del usuario y stablecoin real solo tras auditoría del contrato y revisión legal.
