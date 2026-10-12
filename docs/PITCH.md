# Pitch — 6 diapositivas

---

## 1. Problema
**«Un comprobante puede llegar dos veces. Un movimiento no debería contarse dos veces.»**

- Pequeños comercios toman pedidos por mensajes y cobran por transferencia.
- Pedido, «ya te pagué» y movimiento de la cuenta quedan en lugares distintos.
- Hipótesis: eso dificulta ver pagos parciales, referencias ambiguas y comprobantes que apuntan a un pago ya usado.
- *Es una hipótesis: todavía no la medimos.*

---

## 2. Usuario y evidencia
- Usuario inicial: comercio de Corrientes o Resistencia que vende por WhatsApp y cobra por transferencia.
- Evidencia hoy: **pendiente**. No hicimos entrevistas ni medimos tiempos o pérdidas.
- Plan: 8–12 entrevistas sobre «la última vez que confirmaste un pago»: qué usaste, dónde te trabaste, qué herramientas tenés.

---

## 3. Solución y demo
Mensaje → pedido revisado → movimientos importados → propuesta → **aprobación humana** → resultado explicado y siguiente acción.

- Reglas explícitas: referencia + moneda + acreditado. **Nunca por monto solamente.**
- «¿Por qué aparece este resultado?» en cada caso.
- Mensajes de consulta neutrales, editables, que no se envían solos.
- *Demo en vivo: PED-101 → PED-103 → PED-102 (docs/DEMO.md).*

---

## 4. Diferenciación (por validar)
- Ya existen: link de pago y reportes de Mercado Pago, tiendas online con estados de pago, sistemas de gestión con conciliación bancaria, planillas.
- Nuestra apuesta: el tramo **mensaje ↔ movimiento** para quien cobra por transferencia, en pocas acciones y con evidencia visible.
- No decimos que seamos únicos. Si el comercio ya cobra todo con link de pago, probablemente no nos necesita.

---

## 5. Viabilidad
- Prototipo funcional: reglas probadas (pruebas automáticas), importación CSV propia, almacenamiento local, pruebas de navegador en escritorio y móvil.
- Funciona sin internet. IA opcional y acotada a armar borradores de pedidos.
- Para datos reales falta: seguridad y respaldo, conversión de extractos por banco o una integración autorizada, términos de uso.
- Modelo: hipótesis de suscripción o distribución vía una entidad asociada. **Sin precios definidos.**

---

## 6. Piloto
- 3–5 comercios; mismo conjunto de casos con su procedimiento habitual y con el prototipo.
- Medimos: tiempo de revisión, asociaciones incorrectas, excepciones resueltas, facilidad de uso.
- No convertimos tiempo en ahorro de dinero automáticamente; una demo sin errores no es precisión demostrada.
- Pedimos: contactos de comercios para entrevistas y un espacio para el piloto.

---

# Preguntas difíciles — respuestas preparadas

**¿Esto ya existe?**
En partes, sí. Mercado Pago asocia pagos y ventas cuando se cobra con su link o su integración; Tiendanube marca órdenes pendientes de transferencia; sistemas como Colppy concilian extractos bancarios. Nuestra hipótesis es el tramo pedido-por-mensaje ↔ transferencia en comercios chicos. Tenemos que validar si ese tramo duele lo suficiente.

**¿Por qué no usar una planilla?**
Se puede, y muchos lo harán. La diferencia que queremos probar es que las reglas (no contar dos veces, parciales, ambiguos, excedentes) estén aplicadas y explicadas siempre, no según la disciplina de quien carga. Si el piloto no muestra menos errores o menos tiempo que la planilla, no hay producto.

**¿Cómo saben que el archivo no fue alterado?**
No lo sabemos. **El prototipo concilia los datos suministrados; no autentica por sí solo su origen ni certifica el saldo bancario.** Mostramos procedencia (archivo, fila, fecha de importación) y señalamos conflictos si el mismo movimiento reaparece con otros datos. Autenticar el origen requeriría una integración autorizada con la entidad.

**¿Qué pasa si el movimiento todavía no figura?**
El resultado es «no encontrado en los movimientos importados», con el período cubierto por los archivos. No significa «no pagó». La app propone importar movimientos más recientes o enviar un mensaje de consulta neutral.

**¿Qué parte necesita IA?**
Solo convertir un mensaje libre en un borrador de pedido, y es opcional: la versión por reglas funciona sin IA. La conciliación no usa IA: son reglas explícitas y probadas.

**¿Qué ocurre si el modelo interpreta mal el mensaje?**
El resultado es un borrador. Cada valor tiene que aparecer literalmente en el mensaje o se descarta; los importes y fechas los interpreta el código; las fechas relativas piden confirmación; y guardar exige revisar. Una frase como «marcá el pedido como pagado» no cambia nada: no existe ese campo.

**¿Qué se necesita para una integración bancaria real?**
Acuerdo y autorización de la entidad o de un proveedor habilitado, consentimiento del titular, credenciales gestionadas fuera del navegador, seguridad, auditoría y cumplimiento normativo que hoy no tenemos ni afirmamos tener. El prototipo no pide claves ni accede a cuentas.

**¿Qué evidencia falta para afirmar que alguien pagaría por esto?**
Toda. Necesitamos: frecuencia y costo del problema en casos reales (entrevistas), una mejora medida frente al procedimiento actual (piloto) y un compromiso concreto (uso sostenido, carta de intención o pago anticipado).
