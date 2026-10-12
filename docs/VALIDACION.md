# Validación y propuesta de negocio

Estado: **nada validado todavía**. No hay entrevistas, clientes, cifras ni pérdidas medidas. Todo lo que
sigue es hipótesis y plan.

## Ficha breve
| | |
|---|---|
| **Usuario inicial** | Pequeño comercio de Corrientes o Resistencia que toma pedidos por mensajes y cobra (al menos en parte) por transferencia a una cuenta bancaria o billetera. |
| **Problema (hipótesis)** | Pedido, declaración de pago y movimiento quedan separados; cuesta ver pagos parciales, referencias ambiguas y comprobantes que apuntan a un movimiento ya usado. |
| **Hipótesis de valor** | Con reglas explícitas y aprobación humana, el comercio revisa más rápido y con menos asociaciones incorrectas que con su procedimiento actual, sobre los mismos casos. |
| **Diferenciación por validar** | Recorrido completo «mensaje → pedido → archivo → propuesta → aprobación → explicación» en una pantalla, con evidencia visible y sin conciliar por monto. No afirmamos que sea único. |
| **Riesgos de adopción** | El problema puede ser poco frecuente o ya estar resuelto (link de pago, tienda online); exportar y convertir el extracto puede costar más de lo que ahorra; desconfianza en cargar datos financieros; dependencia de que el cliente ponga una referencia. |
| **Modelo (hipótesis)** | Suscripción mensual o distribución mediante una entidad asociada (cámara, banco regional, contador). Sin precios ni acuerdos definidos. |
| **Costos y dependencias** | Hosting simple; IA opcional (costo por uso, hoy desactivada); conversión de extractos por banco; para operar con datos reales: seguridad, respaldo, términos, y eventualmente una integración autorizada. |

## Alternativas existentes (fuentes primarias cuando fue posible)
| Alternativa | Qué resuelve ya | Fuente |
|---|---|---|
| **Mercado Pago – Link de pago** | Cobrar por WhatsApp con un link por producto/precio; el cobro queda en la cuenta de Mercado Pago. Si el cliente paga con el link, la asociación pago–venta ya existe. | [mercadopago.com.ar/herramientas-para-vender/link-de-pago](https://www.mercadopago.com.ar/herramientas-para-vender/link-de-pago) |
| **Mercado Pago – Reportes** | Reporte de liberaciones descargable (disponible, bloqueos, retiros, disputas) para conciliar. | [Reporte de liberaciones](https://www.mercadopago.com.ar/developers/en/docs/nuvemshop/additional-content/reports/released-money) |
| **Mercado Pago – API de pagos** | Buscar pagos por `external_reference` (la referencia de la venta) cuando la integración la envía. | [Gestión de pagos](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/payment-management) |
| **Tiendanube** | Órdenes con pago por transferencia quedan «pendientes»; el comercio las marca «pago recibido» tras verificar. | [¿Cómo saber si se realizó el pago?](https://ayuda.tiendanube.com/123288-mis-ventas/como-saber-si-se-realizo-el-pago-de-una-venta) · [Orden esperando confirmación](https://ayuda.tiendanube.com/123288-mis-ventas/por-que-hay-una-orden-en-el-administrador-de-tu-tiendanube-que-esta-esperando-la-confirmacion-de-pago) |
| **Colppy** (gestión contable) | Conciliación bancaria con conexión al banco o importando el extracto en su plantilla Excel. | [Conecta tu banco](https://intercom.help/Colppy/es/articles/4044358-conciliacion-bancaria-conecta-tu-banco) · [Importar extracto](https://intercom.help/Colppy/es/articles/3275205-importar-extracto-bancario) |
| **Xubio, Alegra** (gestión) | Incluyen conciliación bancaria según fuentes secundarias/otros países. **A verificar** para Argentina. | [descubre.vc (Xubio)](https://www.descubre.vc/xubio-saas) · [blog Alegra MX](https://blog.alegra.com/mexico/conciliacion-bancaria/) |
| **WhatsApp Business – catálogo y carrito** | El cliente arma el pedido desde el catálogo y lo envía en un mensaje; no cobra. | [Anuncio de Meta (2020)](https://about.fb.com/es/news/2020/12/facilitamos-la-experiencia-de-compra-en-whatsapp-con-la-implementacion-de-carritos/) |
| **Planilla (Excel / Google Sheets)** | Flexible, conocida, gratis; se puede hacer todo a mano. | — |
| **App del banco / billetera** | Muestra movimientos y, en general, permite descargar extractos. Campos y formatos varían por entidad (a relevar). | — |

No se inventan limitaciones de estas herramientas. Lo que falta saber es **cuánto del problema ya cubren
para nuestro usuario concreto**.

## «¿Por qué no alcanza con la app del banco, Mercado Pago o una planilla?» (respuesta honesta)
- **Puede alcanzar.** Si el comercio cobra casi todo con link de pago o una tienda integrada, la asociación
  ya existe y COBRO CLARO aporta poco. Eso hay que preguntarlo primero.
- La app del banco o de Mercado Pago muestra **movimientos**; no sabe qué **pedido** de WhatsApp corresponde
  a cada uno ni si un comprobante reenviado apunta a un movimiento ya usado. Esa relación hoy la hace una persona.
- Una planilla puede hacer lo mismo, pero las reglas (no contar dos veces, parciales, ambigüedades,
  excedentes) dependen de la disciplina de quien la carga. La hipótesis es que hacerlas **explícitas y
  explicadas** reduce errores y tiempo. **No está demostrado.**

## Entrevistas propuestas (no realizadas)
Objetivo: 8–12 pequeños comercios de Corrientes o Resistencia que vendan por mensajes. Sin pitch: primero escuchar.

Guía (centrada en la última vez, no en opiniones):
1. Contame la **última vez** que tuviste que confirmar si te pagaron un pedido. ¿Qué pasó?
2. ¿Qué **información** usaste? (chat, comprobante, app del banco, Mercado Pago, planilla, cuaderno)
3. ¿Dónde te **trabaste** o tardaste más? ¿Cuánto tiempo te llevó, aproximadamente?
4. ¿Te pasó recibir un comprobante que **no coincidía** o que ya habías usado? ¿Qué hiciste?
5. ¿Cómo cobrás hoy? (link, QR, transferencia a alias/CBU, efectivo) ¿En qué proporción?
6. ¿Qué **herramientas** ya tenés? ¿Alguna concilia por vos?
7. ¿Podés **descargar** tus movimientos? ¿En qué formato? (pedir ver uno, sin datos reales)
8. ¿Quién más interviene (contador, socio, empleado)?
9. Si esto desapareciera mañana, ¿qué perderías? (para herramientas que ya usan)

Señales a registrar: frecuencia del problema, tiempo dedicado, errores recordados, herramientas actuales,
disposición a importar un archivo. **Evidencia que falta para afirmar que alguien pagaría**: frecuencia y
costo del problema en casos reales, comparación favorable en el piloto, y un compromiso concreto (uso
sostenido, carta de intención o pago anticipado).

## Piloto propuesto (pequeño y comparable)
- **Participantes**: 3–5 comercios.
- **Diseño**: el mismo conjunto de casos (20–30 pedidos con sus movimientos, **anonimizados o sintéticos**
  derivados de casos reales con consentimiento) se resuelve dos veces: con el procedimiento habitual y con el
  prototipo, en orden alternado para reducir el aprendizaje.
- **Métricas**:
  - tiempo de revisión por lote;
  - asociaciones incorrectas (contra una respuesta acordada previamente);
  - excepciones resueltas (parciales, ya usados, ambiguos, no encontrados);
  - facilidad de uso (cuestionario breve, p. ej. SUS) y comentarios.
- **Reglas de interpretación**: el tiempo liberado **no** se convierte automáticamente en ahorro de dinero; la
  ausencia de errores en la demo **no** es precisión demostrada en comercios reales; resultados con 3–5
  comercios son exploratorios.
- **Requisitos**: consentimiento informado, sin claves bancarias, datos minimizados y borrados al terminar.
