# ORYZA S.A. · Sistema de Registro Diario de Producción y Fraccionado

MVP web que reemplaza la planilla diaria de producción del sector de Fraccionamiento: carga desde PC, tablet o celular, validación automática, cálculos, flujo de aprobación, trazabilidad por lote, cierre de jornada, reportes, alertas, importación de planillas históricas y exportación a Excel/CSV.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera /dist (sitio estático, se puede servir desde cualquier servidor)
npm test           # tests de cálculos y reglas de negocio
```

La primera vez que se abre, la aplicación genera **30 días de datos de demostración**. Se pueden restablecer en *Administración → Configuración → Restablecer demo*.

> **Sesión simulada**: el usuario activo se elige en la barra superior (Operador, Supervisor, Administrador). Los permisos se aplican tanto en la interfaz como en los servicios.

---

## 1. Análisis

| | |
|---|---|
| **Proceso actual** | El responsable de cada turno completa a mano una planilla con la producción de cada línea: producto, lote, horarios, unidades, paradas, merma y controles. Luego alguien transcribe y consolida en Excel. |
| **Problema** | Doble carga, cálculos manuales, errores de transcripción, información disponible con días de atraso, sin trazabilidad de cambios, sin visibilidad de causas de pérdida. |
| **Solución** | Registro digital por turno/línea con cálculos automáticos, validaciones que previenen errores, aprobación del supervisor con bloqueo, auditoría y tableros que convierten el dato en gestión. |
| **Usuarios** | Operador (carga), Supervisor (revisa, aprueba, cierra jornada, analiza), Administrador (maestros, parámetros, usuarios, importación). |
| **Información mínima** | Fecha, turno, línea, operador, producto, variedad, lote, presentación, horario, unidades, paradas (inicio/fin/causa), merma, rechazo, calidad (5 checks). Todo lo demás **se calcula**. |

**Criterio de diseño aplicado**: nada que pueda calcularse se carga a mano (kg, toneladas, duración, pallets sugeridos, duración de paradas, %, productividad, cumplimiento).

## 2. Modelo de datos

```
USERS (id, name, role, active, code)
SHIFTS (id, name, code, start, end, active)
LINES (id, name, code, module, nominal_capacity_kg_h, target_kg_h, target_kg_shift, active)
PRODUCTS (id, name, code, default_variety_id → VARIETIES, active)
VARIETIES (id, name, code, active)
PRESENTATIONS (id, name, unit_weight_kg, units_per_pallet, active)
DOWNTIME_CATEGORIES (id, name, kind[falla|operativa|abastecimiento|planificada|otra], active)

PRODUCTION_RECORDS
  id, number (PR-000231), module, date, shift_id, operator_id, line_id, product_id, variety_id,
  lot, presentation_id, start_time, end_time, units, unit_weight_kg (snapshot), total_kg,
  pallets, units_per_pallet, scrap_kg, rejected_kg, scrap_reason, scrap_observations,
  observations, status[draft|pending|approved|rejected], source[manual|import],
  created_by, created_at, updated_by, updated_at, submitted_at,
  approved_by, approved_at, rejected_by, rejected_at, review_comment
DOWNTIMES (id, production_record_id, category_id, start_time, end_time, duration_minutes, reason, observations)
QUALITY_CHECKS (production_record_id, lot_ok, packaging_ok, printing_ok, weight_ok, product_ok,
                observations, has_incident, incident_description)     -- valores: ok | obs | nc
TARGETS / SETTINGS (target_kg_shift, target_kg_h, max_scrap_pct, max_stop_minutes, max_downtime_pct, pending_alert_hours)
DAILY_CLOSURES (id, date, closed_by, closed_at, notes, summary snapshot)
AUDIT_LOG (id, at, user_id, action, entity, entity_id, entity_label, changes[{field, from, to}], comment)
```

Mejoras sobre la estructura propuesta:
- `unit_weight_kg` se guarda como **snapshot** en el registro: si luego se modifica la presentación, el histórico no cambia.
- `DOWNTIME_CATEGORIES.kind` clasifica las paradas → permite **MTBF/MTTR** (fallas) y **disponibilidad** (excluye planificadas).
- `LINES.module` y `PRODUCTION_RECORDS.module` preparan el sistema para Recepción, Secado, Silos, Laboratorio, Depósito y Expedición.
- Objetivos **por línea** (una embolsadora de 50 kg no puede compararse con una fraccionadora de 1 kg).
- `DAILY_CLOSURES` congela el resumen del día (documento operativo) y bloquea cambios posteriores de operadores.

En el prototipo, paradas y calidad se persisten dentro del agregado del registro (documento); en SQL son las tablas hijas indicadas.

## 3. Arquitectura

**Stack**: React 18 + TypeScript + Vite · Tailwind CSS · Recharts · ExcelJS (importar/exportar .xlsx) · React Router (HashRouter: funciona como sitio estático) · Vitest.

**Persistencia**: el entorno del prototipo no dispone de servidor de base de datos, por lo que se usa `localStorage` detrás de una **capa de repositorio** (`DataRepository`) con transacciones atómicas (si una validación falla, no se guarda nada). La UI nunca accede al almacenamiento: llama a **servicios** (`productionService`, `masterDataService`, `importService`, `exportService`) que son la "API" de la aplicación. Migrar a PostgreSQL/Supabase implica implementar el repositorio o reemplazar los servicios por llamadas HTTP con la misma firma.

```
src/
  types/        modelo de dominio (domain.ts)
  data/         maestros iniciales (hipótesis) y generador de datos demo
  services/     API de la app: producción, maestros, importación, exportación, auditoría, repositorio
  utils/        cálculos (calc), reglas de negocio (validation), permisos, alertas, analítica, fechas
  hooks/        estado global (useData), feedback (toasts/confirmaciones), filtros
  components/   layout (Sidebar, Topbar), ui (KPICard, StatusBadge, Modal…), production
                (ProductionForm, DowntimeForm, QualityControl, ProductionTable, MetricsPanel),
                charts (ProductionCharts), dashboard (FilterBar, AlertCard)
  pages/        Dashboard, Nuevo/Editar registro, Registros, Detalle, Trazabilidad, Cierre diario,
                Reportes, Alertas, admin/(Catálogos, Usuarios, Importar, Configuración, Auditoría)
```

## 4. Pantallas

| Pantalla | Función |
|---|---|
| **Dashboard** | 6 KPI, producción diaria vs objetivo, producción por producto, productividad vs objetivo, Pareto de paradas, producción por turno, merma diaria, últimos registros y alertas. Filtros por fecha, turno, producto, variedad, línea, responsable y lote. |
| **Nuevo registro** | Formulario en 7 secciones con botones grandes (tablet), valores por defecto (fecha, turno según hora, usuario), cálculo en vivo, panel de revisión con errores y advertencias, barra inferior fija en tablet/celular, recuperación de formulario no guardado. |
| **Registros** | Tabla con búsqueda, filtros, pestañas por estado, orden por columna, paginación y acciones Ver/Editar/Duplicar/Eliminar según permisos. Exportar CSV/Excel. |
| **Detalle** | Ficha imprimible con indicadores, paradas, calidad, observaciones, aprobación, alertas e historial de modificaciones (valor anterior → nuevo). Aprobar/Rechazar/Enviar/Retirar/Reabrir. |
| **Trazabilidad** | Búsqueda por lote (con autocompletado y sugerencias) → encabezado del lote, totales y línea de tiempo con cada turno, línea, responsable, controles, incidencias y paradas. |
| **Cierre diario** | Documento profesional del día: totales, cumplimiento, horas trabajadas, detenido, merma, por turno/producto/línea, principales paradas, incidencias, pendientes. Generar cierre (bloquea la fecha), imprimir/PDF, Excel, historial de cierres. |
| **Reportes** | Diario / semanal / mensual con filtros, tabla por período, oportunidades de mejora automáticas, Pareto, motivos, eficiencia por turno/producto/línea/responsable, indicadores OEE/MTBF/MTTR. |
| **Alertas** | Merma > límite, productividad < objetivo, parada > límite, tiempo detenido alto, calidad no conforme, borradores sin enviar, pendientes de aprobación, lote repetido. Verde/amarillo/rojo, siempre con ícono y texto. |
| **Administración** | ABM de productos, variedades, presentaciones, líneas, turnos, tipos de parada y usuarios; objetivos y parámetros; importación con vista previa; auditoría. |

## 5. Reglas de negocio implementadas

Hora fin > hora inicio (turno noche puede cruzar medianoche) · valores no negativos · unidades enteras · lote, producto, operador, turno, línea, variedad, presentación y los 5 controles obligatorios para enviar · paradas con inicio/fin, categoría, dentro del horario del registro y sin superposición · paradas totales ≤ duración · rechazo ≤ producción · merma sobre el máximo exige motivo · no conforme exige observación · incidencia exige descripción · **registro duplicado bloqueado** (misma fecha+turno+línea+lote+producto) · advertencia de lote usado con otro producto · advertencia de pallets inconsistentes y de productividad mayor a la capacidad nominal · aprobado no editable (solo el administrador puede reabrir con motivo) · jornada cerrada bloquea cargas de operadores · borrador solo requiere datos mínimos.

Los mensajes son para el operador: *"No puedes enviar el registro porque falta indicar el lote."*

## 6. Cálculos

| Indicador | Fórmula |
|---|---|
| Peso total | unidades × peso unitario (kg) · ÷ 1000 (tn) |
| Duración total | hora fin − hora inicio |
| Tiempo detenido | Σ duración de paradas |
| Tiempo productivo | duración − detenido |
| Productividad | kg ÷ horas productivas (kg/h y tn/h) |
| % parada | detenido ÷ duración × 100 |
| % merma | kg merma ÷ kg procesados × 100 (procesados = producidos + merma) |
| Cumplimiento | real ÷ objetivo de la línea |
| Disponibilidad | (tiempo planificado − paradas no planificadas) ÷ tiempo planificado |
| Rendimiento | kg ÷ (capacidad nominal × tiempo de marcha) |
| Calidad | (kg − rechazado) ÷ (kg + merma) |
| OEE estimado | Disponibilidad × Rendimiento × Calidad |
| MTBF / MTTR | tiempo de marcha ÷ n.º fallas / minutos de falla ÷ n.º fallas |

Datos adicionales necesarios para indicadores completos: **plan de producción** (planificado vs real, capacidad utilizada/disponible), **capacidad nominal validada por presentación**, **catálogo de equipos** (MTBF/MTTR por activo) y **unidades reprocesadas / resultados de laboratorio**.

## 7. Hipótesis (todas configurables)

- 3 líneas: L1 fraccionadora 1–5 kg (3.200 kg/h nominal, objetivo 2.600), L2 embolsadora 10–50 kg (6.000 / 4.800), L3 Big Bag (9.000 / 7.000).
- Unidades por pallet ≈ 1 tn por pallet; Big Bag = 1.000 kg.
- Merma máxima 2 %, parada individual máxima 45 min, tiempo detenido máximo 15 %, pendiente demorado > 24 h.
- La fecha de un registro nocturno es la del inicio del turno.
- Los datos importados de planillas anteriores ingresan como *Aprobado (histórico)*; sus minutos de parada se registran en un bloque "Sin clasificar (histórico)".
- Formato de lote sugerido `LOT-DDMMAA-NN`.

## 8. Validación realizada

- **Tests unitarios** (`npm test`): cálculos, turno nocturno, reglas de negocio, duplicados y consistencia de los datos demo.
- **Recorrido completo en navegador (Playwright)**: Dashboard → Nuevo registro → turno/producto/lote → 3.700 u × 5 kg = 18.500 kg → parada 08:00–08:25 = 25 min → merma 250 kg = 1,33 % → calidad → guardar → aparece en historial → enviar → cambio a supervisor → aprobar (queda bloqueado) → dashboard actualizado → trazabilidad del lote → cierre diario → exportación CSV y Excel → persistencia tras recargar. Sin errores de consola. Verificado en 1440 px, tablet (820 px) y celular (390 px, sin scroll horizontal).

## 9. Oportunidades de mejora que habilita la digitalización

La página **Reportes** las detecta automáticamente sobre los datos filtrados: causa principal de parada y concentración Pareto, turno con menor rendimiento, producto con mayor merma, línea con menor cumplimiento, variabilidad diaria, tendencia de productividad semanal, fallas repetitivas (misma causa en la misma línea → candidatas a causa raíz / preventivo) y frecuencia de no conformidades.

## 10. Crecimiento hacia un MES propio

El dominio ya contempla `module` (recepción, secado, silos, producción, laboratorio, fraccionamiento, depósito, expedición), los maestros son genéricos (`CatalogBase` + ABM reutilizable), la auditoría es transversal y el lote es la clave de trazabilidad que conectará los módulos (recepción → silo → proceso → fraccionado → despacho). Próximos pasos sugeridos: backend (Supabase/PostgreSQL con Row Level Security por rol), autenticación real, plan de producción, catálogo de equipos y módulo de Laboratorio vinculado al lote.
