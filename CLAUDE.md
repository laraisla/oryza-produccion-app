# COBRO CLARO — reglas del proyecto

Prototipo de entrenamiento: concilia pedidos con movimientos de un **archivo importado**.
No es un banco, ni una billetera, ni un detector de fraude, ni certifica acreditaciones.

## Comandos
- `npm ci` — instalar (lockfile versionado; para AGREGAR dependencias usar npm ≥ 11: `npx npm@11 install …`).
- `npm run dev` — desarrollo en http://localhost:3000
- `npm run build && npm start` — producción local
- `npm run check` — tipos + lint + pruebas unitarias
- `npm run test:e2e` — Playwright (compila y levanta el servidor en :3100)
- `npm run capturas` — capturas y video (requiere servidor en :3000)

## Reglas que no se negocian
- Dinero en centavos enteros (`src/domain/money.ts`); solo ARS; sin conversión de monedas.
- Nunca conciliar por monto solamente. Propuesta = referencia explícita + misma moneda + acreditado. Siempre aprobación humana.
- Una declaración de pago nunca suma dinero conciliado.
- Estados y montos se calculan (`src/domain/reconcile.ts`); no precargar resultados ni condicionar por IDs de la demo.
- Escrituras atómicas en `src/storage/repository.ts` (transacción + revalidación). No confiar en deshabilitar botones.
- Textos al usuario: "no encontrado en los movimientos importados", nunca "no pagó" ni "fraude".
- La IA solo propone borradores de pedidos, desde el servidor, desactivada por defecto. Sin claves en el cliente ni en Git.
- No agregar servicios externos, blockchain ni funciones fuera de alcance (ver docs/LIMITACIONES.md).

## Verificación antes de dar algo por terminado
1. `npm run check` sin errores ni advertencias.
2. `npm run test:e2e` en verde (escritorio y móvil, incluye axe).
3. `npm run build` sin errores.
4. Si cambia una regla: actualizar `docs/REGLAS.md` y agregar prueba en `tests/unit/`.
5. No desactivar reglas de lint ni borrar pruebas para obtener verde.

Detalle: README.md, docs/PRODUCTO.md, docs/REGLAS.md, docs/LIMITACIONES.md.
