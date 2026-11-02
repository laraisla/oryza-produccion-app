# AgroGlobal COMEX — Prototipo navegable para Ideathon NEA TECH 2026

## Objetivo

Construir un prototipo web tipo SaaS, profesional y completamente navegable, con datos ficticios consistentes entre pantallas, que demuestre el recorrido comercial completo: publicar/buscar producto → matching → cálculo de exportación → cotización → operación → conciliación → trazabilidad.

Todo en español, sin backend real: estado en la aplicación + localStorage para persistir entre recargas.

## Identidad visual

- Estética fintech/logística B2B (referencia Stripe/Linear): fondo blanco/gris muy claro, tarjetas con bordes sutiles, mucho espacio, gráficos limpios.
- Paleta de tokens semánticos en `src/styles.css`:
  - Navy / azul petróleo: navegación lateral y elementos institucionales.
  - Verde esmeralda: acciones positivas y resultados compatibles.
  - Ámbar: pendientes y advertencias.
  - Rojo moderado: incompatibilidades y errores.
- Tipografía: Sora (títulos) + Manrope (cuerpo), cargadas vía `<link>` en `__root.tsx`.
- Iconografía Lucide. Prioridad escritorio, adaptable a móvil.

## Estructura de la app

Layout con sidebar persistente + barra superior (buscador general, notificaciones, empresa activa, perfil) y selector de rol demostrativo (Productor/Molino, Comprador/Importador, Exportador/Admin COMEX) que ajusta el contenido de pantallas clave.

Rutas (TanStack Start, una por sección):

```text
/                      Dashboard
/marketplace           Catálogo B2B con filtros laterales
/mis-productos         Gestión de productos propios (CRUD local)
/solicitudes           Solicitudes de compra
/matching              Motor de matching inteligente
/calculadora           Calculadora COMEX de costos de exportación
/cotizaciones          Generador y listado de cotizaciones
/documentacion         Checklist documental por destino
/operaciones           Operaciones y embarques con timeline
/conciliacion          Conciliación financiera + seguimiento SECOEXPO (demo)
/trazabilidad          Expediente de lote + verificación blockchain (demo)
/configuracion         Empresa, usuario, preferencias
```

## Datos y estado

- `src/data/`: dataset ficticio consistente (productos A/B/C del brief, solicitudes, cotizaciones, operaciones, documentos, cobros) etiquetado como "Demo".
- Store global (Context + reducer, respaldado en localStorage) para que publicar un producto, aceptar una cotización o registrar un cobro actualice dashboard, operaciones y conciliación.
- Nada de cifras reales de comercio argentino ni tasas inventadas como oficiales; campos normativos marcados "pendiente de verificación".

## Pantallas (en orden de prioridad del brief)

1. **Dashboard**: 6 tarjetas de indicadores (conectadas al store), gráfico de oportunidades por país (recharts), tabla de solicitudes recientes, panel de operaciones en seguimiento, alertas documentales, accesos rápidos.
2. **Marketplace**: tarjetas de producto con todos los atributos del brief (variedad, toneladas, % quebrado, humedad, presentación, precio indicativo, documentación), filtros laterales completos, buscador, botones "Ver detalle" (modal) y "Solicitar cotización".
3. **Matching inteligente**: formulario de solicitud de compra → motor de reglas determinísticas que clasifica cada lote en Compatible / Compatible con condiciones / Incompatible (una variedad distinta nunca es compatible por cantidad o presentación). Tarjetas comparativas, panel lateral de comparación técnica, botón "Analizar oportunidad" con resumen explicativo generado por reglas.
4. **Calculadora COMEX**: selectores de operación (producto, cantidad, origen, puertos, Incoterm, moneda, contenedores) + 6 grupos de costos editables (mercadería, logística nacional, portuarios, aduana/certificaciones, transporte internacional, comerciales/financieros). Cada concepto con importe, moneda, unidad, cantidad, responsable, "incluido en otra tarifa" y tipo de dato (estimado/cotizado/verificado). Cálculos dinámicos: costo total, costo/tn, precio mínimo, margen, FCA/FOB/CFR/CIF según Incoterms 2020 (sin sumar gastos del comprador ni duplicar cargos incluidos), tipo de cambio editable, gráfico waterfall de composición, botón "Generar cotización" que transfiere los datos.
5. **Cotizaciones**: listado con estados (Borrador/Enviada/En negociación/Aceptada/Rechazada), vista previa profesional de la cotización, edición de margen con recálculo, exportación a PDF (impresión del navegador).
6. **Documentación**: formulario (producto, NCM, destino, Incoterm) → checklist agrupada en 6 categorías con estados, responsable, fecha límite, costo estimado y adjunto simulado. Requisitos de país presentados como ejemplos pendientes de validación regulatoria.
7. **Operaciones y embarques**: tabla de operaciones con estados documental/logístico/financiero, detalle con timeline de 7 hitos, documentos y costos vinculados.
8. **Conciliación financiera**: tarjetas (conciliadas, con diferencias, documentos faltantes, próximas a revisar), ejemplo USD 30.000 con diferencia de USD 150 por comisión exterior identificada como "requiere respaldo" (nunca como incumplimiento cambiario), panel SECOEXPO con estados demo y aviso explícito de que no hay conexión real con BCRA ni bancos; sin acciones que simulen liquidar divisas.
9. **Trazabilidad**: expediente por lote con historial y evidencias; pantalla "Verificación blockchain" con campos Stellar Testnet / Soroban etiquetados "Demo", "Sin conexión", "Pendiente de integración".
10. **Mis productos, Solicitudes, Configuración**: CRUD local simple y coherentes con el store.

## Recorrido demo navegable

Los 6 escenarios del brief quedan soportados de punta a punta con datos consistentes: jazmín vs. largo fino (incompatible), 40 tn largo fino ≤5% quebrado en bolsas de 25 kg (lote B compatible), cotización desde la calculadora, aceptación que crea la operación, checklist y expediente, y cobro con diferencia por comisiones.

## Metadata

Cada ruta con `head()` propio (título y descripción en español, og:type, twitter:card); se reemplazan los textos "Lovable App" del root y el placeholder de `index.tsx`.

## Notas técnicas

- TanStack Start + React 19 + Tailwind v4 (tokens en `src/styles.css`, sin hardcodear colores en componentes).
- Gráficos con recharts; iconos lucide-react; componentes shadcn existentes.
- Sin Lovable Cloud en esta etapa (prototipo sin persistencia real, según el brief).
- Funciones no implementadas marcadas como "Próximamente" en vez de botones decorativos.
