# Documentación de cálculos

Todo cálculo es una **función pura** (`src/domain/*`) con aritmética decimal exacta (`decimal.js`, 40 dígitos significativos). Importes y cantidades viajan como strings decimales; solo se redondea el **precio final**. Cada resultado guarda la versión del motor (`engineVersion`) y la versión de cotización congela entrada, resultado y escenario completos para que sea reproducible.

## 1. Cantidades, envases y pesos (`domain/quantity.ts`, `domain/units.ts`)

- Conversión de masa: `t = kg / 1000`, `kg = t × 1000`.
- **Envases**: `envases exactos = (t netas × 1000) / kg netos por envase`. Si no es entero, el sistema **no redondea en silencio**: ofrece dos opciones (`round_down` / `round_up`) con la cantidad neta resultante y exige una decisión (`needsDecision`). Granel: 0 envases, bruto = neto.
- **Pallets**: `ceil(envases / envases por pallet)`.
- **Tara** = `tara por envase × envases + tara por pallet × pallets`; **peso bruto** = neto efectivo + tara.
- **Volumen** (si hay volumen por envase) = `volumen por envase × envases`.
- **Contenedores** = `max(ceil(bruto / límite efectivo), ceil(volumen / capacidad), ceil(pallets / pallets máx.))`. El límite efectivo es el menor entre la carga útil máxima del equipo y el **límite operativo configurado** (ruta, balanza, naviera), que prevalece si es menor. Se informa el factor limitante y, si falta volumen, que se calculó solo por peso.
- **Stock por lote** (a partir de movimientos, nunca editado a mano):
  - físico = inicial + ajustes − embarcado
  - reservado = reservas − liberaciones − compromisos que convierten reserva
  - comprometido = compromisos − embarcado
  - **disponible = físico − reservado − comprometido**. No se puede reservar ni comprometer por encima del disponible (`assertAvailable` en la app; trigger diferido `check_lot_stock` en la base).

## 2. Motor de costos y precio (`domain/costing.ts`)

### 2.1 Partidas

Cada partida tiene importe, moneda, unidad (`per_ton`, `per_container`, `per_operation`, `per_day`, `per_unit`, `percent`), punto de la cadena (`CostPoint`), etapa, fuente, vigencia y estado de verificación. Cantidad automática según unidad:

| Unidad | Cantidad automática |
|---|---|
| `per_ton` | t netas (o brutas si `tonBasis = gross`) |
| `per_container` | contenedores calculados |
| `per_operation` | 1 |
| `per_unit` | envases o pallets (`unitBasis`) |
| `per_day` | manual (días); con **días libres** y **tramos** (`dayCharge`: días cobrables = días − libres; cada tramo cobra su tarifa en su rango) y opción “por contenedor” |
| `percent` | se calcula sobre una base (ver 2.3) |

Se excluyen (y se explica por qué): partidas desactivadas, no aplicables al modo de transporte o Incoterm (`appliesTo`, **costos condicionales**), y las marcadas como **incluidas en otra partida** (`includedInLineId`, evita doble conteo; si la partida madre no existe o está desactivada se suma igual y se advierte).

**Duplicados**: se advierte si dos partidas activas comparten nombre normalizado y punto, o el mismo concepto de catálogo, o si una partida suele estar incluida en otra presente (`mayBeIncludedIn`, p. ej. VGM dentro de THC).

### 2.2 Modelo lineal β/α (sin circularidad)

Cada partida aporta `importe = β + α × P`, donde `P` es el precio total de venta:
- `β` = parte fija en moneda de cotización (importe × cantidad, convertido).
- `α` = fracción del precio (comisiones sobre venta, seguro sobre valor asegurado, derechos sobre FOB, financiación).

Sumando las partidas a cargo del vendedor: `B = Σβ` y `A = Σα`.

### 2.3 Bases de porcentajes

| Base | Fórmula |
|---|---|
| `merchandise_value` | % × suma de partidas fijas del punto “mercadería” |
| `custom_amount` | % × monto indicado (convertido) |
| `sale_value` | α = % (sobre el precio de venta) |
| `insured_value` | valor asegurado = 110 % × valor CIF. α = % × 1,1; si el Incoterm es FCA/FOB se agrega β = % × 1,1 × flete principal (porque el precio no lo incluye) |
| `fob_value` | en FCA/FOB: α = %. En CFR/CIF/DAP: FOB = P − costos posteriores al embarque del vendedor (`P × (1 − α_post) − β_post`), entonces α = % × (1 − α_post), β = −% × β_post |

### 2.4 Precio

- **Margen sobre venta** (`margin_on_sale`): `P = B / (1 − m − A)`. Ejemplo QUOTE-03 del PRD: gasto 2 % sobre venta y margen 12 % ⇒ denominador 0,86 (no se suma 14 % al costo). Si `m + A ≥ 100 %` el cálculo es inválido y se muestra el error (QUOTE-04).
- **Recargo sobre costo** (`markup_on_cost`): `P = B × (1 + k)`; las comisiones sobre venta se calculan aparte y reducen el margen resultante.
- **Precio negociado** (`fixed_price`): `P = precio/t × t`; el margen resulta de los costos.
- **Precio mínimo (equilibrio)**: `B / (1 − A)` (si `A < 1`).
- **Redondeo**: por tonelada (`precio/t` redondeado y total = precio/t × t, precio contractual) o sobre el total (`precio/t = total / t`), con decimales y modo configurables.

### 2.5 Resultados

Con el precio final `P` se evalúa cada partida (`β + α × P`) y se informa:
- costo del vendedor (total, por t, por contenedor), costos a cargo del comprador (fuera del precio), costo total de la operación;
- comisiones y gastos financieros (etapas comercial y financiera del vendedor);
- **margen absoluto** = P − costo del vendedor; **margen % sobre venta** = margen / P; **recargo % sobre costo** = margen / costo del vendedor (se muestran por separado: no son lo mismo);
- totales por etapa (vendedor / comprador), alertas y explicación de cada asignación.

### 2.6 Financiación

Interés simple con convención explícita: `interés = capital × tasa anual × días / base (360 o 365)`. El capital es un % del valor de venta (aporta α) o un monto fijo (aporta β). La convención aplicada se muestra en el resultado.

### 2.7 Tipo de cambio (`domain/units.ts`)

`convert()` usa solo cotizaciones documentadas: directa (`base→quote`, multiplica) o inversa (divide). **Nunca inventa tasas**: si falta el par, la partida se excluye con error “falta tipo de cambio documentado” y el cálculo queda inválido. Cada partida convertida registra tasa, fecha, fuente y par. Los tipos de cambio demo son estimados y figuran como tales.

### 2.8 Vigencia y verificación

Una tarifa vencida (`validUntil < fecha`) **no desaparece**: pasa a estado efectivo *Vencido*, se mantiene en el cálculo como estimación no verificada y genera advertencia (QUOTE-05). Partidas sin fuente o estimadas/pendientes generan avisos; una tarifa crítica requerida sin importe es error (QUOTE-02), igual que la falta del lugar convenido del Incoterm.

### 2.9 Sensibilidad y escenarios

- **Sensibilidad ±10 %**: recalcula variando las 3 partidas más pesadas del vendedor, cada tipo de cambio involucrado y la cantidad (−10 %); muestra precio/t, Δ precio/t y Δ margen.
- **Escenarios**: se duplican y comparan (precio, costos, margen); nunca sobrescriben una versión de cotización ya enviada o aceptada.

## 3. Reparto de costos por Incoterm 2020 (`domain/incoterms.ts`)

La asignación depende del **punto de la cadena** y del **tipo de lugar convenido**, no de la categoría contable. Cambiar de Incoterm reasigna sin borrar importes (QUOTE-01: al pasar de FOB a CIF se suman flete y seguro del vendedor). Un **pacto contractual** (`payerOverride` + nota) reemplaza la regla y queda registrado como “Pactado”.

| Punto | FCA instalaciones | FCA terminal | FOB | CFR | CIF | DAP terminal destino | DAP lugar interior |
|---|---|---|---|---|---|---|---|
| Mercadería, envases, carga en planta | V | V | V | V | V | V | V |
| Transporte interno hasta entrega/puerto | **C** | V | V | V | V | V | V |
| Despacho de exportación | V | V | V | V | V | V | V |
| Terminal de origen hasta bordo | C | C | V | V | V | V | V |
| Transporte internacional | C | C | C | V | V | V | V |
| Seguro internacional | C | C | C | C | V (Cláusulas C, 110 %) | V (riesgo del vendedor) | V |
| Puerto/terminal de destino | C | C | C | C* | C* | C | V |
| Transporte en destino | C | C | C | C | C | C | V |
| Despacho de importación y tributos | C | C | C | C | C | C | C |
| Descarga en lugar final | C | C | C | C | C | C | C |
| Comisiones, gastos comerciales y financieros | V | V | V | V | V | V | V |

V = vendedor, C = comprador. \*Salvo que esté incluido en el contrato de transporte del vendedor (marcar la partida como incluida en el flete). Advertencias: falta de lugar convenido (error), tipo de lugar incoherente con el Incoterm, FOB/CFR/CIF con contenedores (se sugiere FCA) y reglas marítimas con camión.

## 4. Conciliación financiera (`domain/reconciliation.ts`)

Los cobros son registros informativos cargados por el usuario. Con tolerancias de importe (0,01 por defecto) y de cantidad (0,001 t):

- **Neto esperado** por cobro = bruto − comisiones del exterior − comisiones locales − otras deducciones. Si el neto informado difiere: “neto no explicado” (*a revisar*).
- Cada comisión o deducción > 0 genera una diferencia explicada con causa probable y **evidencia requerida**; queda *pendiente de respaldo* hasta adjuntar un documento y luego *explicada*.
- Cruces: moneda de factura vs. operación, cantidad facturada vs. embarcada, importe facturado vs. contrato (precio pactado × cantidad facturada), cobros sin imputar, **saldo pendiente** = facturado − imputado (informativo), cobro por encima de lo facturado (*a revisar*).
- Estado sugerido: sin datos → parcialmente conciliado → diferencia a revisar. Solo un **operador** puede marcar “conciliado por operador”, con nota obligatoria, cuando no quedan diferencias abiertas.

**Escenario F**: factura 30.000, bruto 30.000, comisión exterior 150 ⇒ neto 29.850; la diferencia de 150 se explica como comisión del banco del exterior y pide el comprobante bancario. No se infiere incumplimiento cambiario.

## 5. Hash de términos (`integrations/stellar/terms.ts`)

`terms_hash = SHA-256(JSON canónico de los términos aceptados)` — claves ordenadas, sin espacios, importes y cantidades como strings decimales (solo se admiten números enteros seguros, para no depender de la representación de punto flotante); `deal_key = SHA-256("agromatch:deal:v1:" + id de operación)`. Cualquier cambio en un término produce otro hash; la versión aceptada guarda el suyo y la operación lo hereda.
