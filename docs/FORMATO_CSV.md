# Formato CSV de movimientos (propio)

COBRO CLARO **no** promete compatibilidad con los archivos de ningún banco. Usa un formato propio,
descargable desde **Importar movimientos → Descargar plantilla**. Para usar un extracto real habría que
convertirlo a este formato (manualmente o con una adaptación por banco, fuera del alcance actual).

| Columna | Obligatoria | Formato |
|---|---|---|
| `id_movimiento` | Sí | Identificador de la operación en el origen (≤ 60). |
| `cuenta` | Sí | Nombre de la cuenta de origen (≤ 60). Con `id_movimiento` forma la clave anti-duplicados. |
| `fecha` | Sí | `AAAA-MM-DD` o `DD/MM/AAAA`. |
| `importe` | Sí | Positivo, punto decimal, sin separador de miles: `45000.00`. Solo ingresos. |
| `moneda` | Sí | `ARS`. Otra moneda es error de fila (no se convierte). |
| `estado` | Sí | `acreditado`, `pendiente` o `revertido`. Solo `acreditado` cuenta. |
| `referencia` | No | Texto libre (≤ 140). Se busca la referencia del pedido. |
| `descripcion` | No | Texto libre (≤ 200). También se busca la referencia. |

- Separador `,` o `;`. Codificación UTF-8. Encabezados sin distinguir mayúsculas ni acentos.
- Límites: 1 MB y 2.000 filas. Columnas desconocidas se ignoran con aviso.
- Lectura con PapaParse (comillas y separadores dentro de campos se respetan). El contenido es texto, nunca HTML.
- Errores informados por **fila** (la fila 1 es el encabezado) y **columna**; las filas inválidas no se importan.

## Reimportación (ver docs/REGLAS.md, tabla E)
- Misma cuenta + id + mismos datos → «ya importado», no se duplica.
- Solo cambia `estado` → actualización de estado; se registra y se recalculan asignaciones.
- Cambia fecha, importe, moneda o referencia → **conflicto**: no se sobrescribe, queda para revisión.

## Ejemplo
```csv
id_movimiento,cuenta,fecha,importe,moneda,estado,referencia,descripcion
OP-0001,Cuenta principal,2026-09-15,45000.00,ARS,acreditado,PED-001,Transferencia recibida
OP-0002,Cuenta principal,16/09/2026,12500.50,ARS,pendiente,,Depósito en revisión
```
