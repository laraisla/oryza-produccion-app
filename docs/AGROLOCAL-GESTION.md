# AgroLocal Gestión — integración en AgroGlobal (prototipo demo)

Integrado el 19/11/2026 en la rama `feature/agrolocal-gestion` (creada desde
`feature/agroglobal-stellar-mvp`). Origen: el prototipo independiente
`AgroLocal_Gestion_Demo.zip` (React + TypeScript, 30 pruebas del servicio).

**Estado:** módulo local con datos ficticios de "Acopiadora del Litoral" guardados en
`localStorage` del navegador. Sin Supabase, Marketplace, COMEX, Stellar ni autenticación
propia. No representa inventario empresarial real.

## Rutas

| Pantalla | Ruta |
| --- | --- |
| Dashboard | `/gestion` |
| Depósitos (alta y edición) | `/gestion/depositos` |
| Lotes (alta con saldo cero) | `/gestion/lotes` |
| Movimientos (ingreso, egreso, transferencia, ajuste con motivo) | `/gestion/movimientos` |
| Inventario por lote y depósito + historial filtrable | `/gestion/inventario` |

Acceso desde la navegación principal: **Gestión de acopio (demo)**, en los cuatro modos
de trabajo. Las cinco son rutas reales de TanStack Router (recarga directa con 200;
subrutas inexistentes, 404).

## Qué se reutilizó y qué se adaptó

| Archivo | Origen | Cambios |
| --- | --- | --- |
| `src/gestion/domain.ts` | ZIP | Ninguno de lógica; solo formato Prettier. |
| `src/gestion/browserPersistence.ts` | ZIP | Solo formato. Clave `agrolocal:gestion:demo:acopiadora-del-litoral:v1`. |
| `src/gestion/seed.ts` | ZIP | Solo formato. |
| `src/gestion/domain.test.ts` | ZIP | Las 30 pruebas sin cambios de casos ni aserciones; tipado para `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`. |
| `src/gestion/GestionApp.tsx` | ZIP | Ruta actual por prop (router del host), enlace inyectable, modo `embedded` sin lateral propio y con pestañas internas, aviso "AgroLocal Gestión — PROTOTIPO DEMO", limpieza de avisos al cambiar de pantalla, diálogo de reinicio en portal y CSS cargado por la ruta. |
| `src/gestion/gestion.css` | ZIP | Reglas originales intactas; sección agregada para el modo integrado. |
| `src/gestion/GestionModulo.tsx` | Nuevo | Adaptador: crea el servicio y accede a `localStorage` solo en `useEffect` (nunca en SSR); usa `Link` de TanStack Router. |
| `src/routes/gestion.tsx` + `gestion.{index,depositos,lotes,movimientos,inventario}.tsx` | Nuevos | Layout que monta el módulo una vez y cinco rutas hijas. |
| `src/data/organizaciones.ts` | Modificado | Entrada de navegación. |
| `src/test/gestion-integracion.test.tsx` | Nuevo | Rutas, navegación y SSR sin almacenamiento. |

No se incorporaron `package.json`, `serve.mjs`, `index.html`, `dist/`, `main.tsx`,
`standalone.css` ni la configuración de Vite/ESLint/TypeScript del prototipo.

## Ejecutar

```powershell
bun run dev
```

Abrir `http://localhost:8080/gestion`. El estado se conserva por origen: usar siempre la
misma dirección (`localhost:8080`). "Iniciar demo desde cero" reemplaza solo los datos de
Gestión; el botón "Restablecer datos demo" del pie de AgroGlobal no los toca.

## Límites conocidos

- Datos solo en este navegador y origen; sin concurrencia entre pestañas ni multiusuario.
- El módulo conserva su propia paleta clara aun con el tema oscuro de AgroGlobal.
- Sin relación con el stock comercial de Marketplace (`mis-productos`) ni con reservas.

## Próximo paso: Supabase y stock comercial (no implementado)

1. Esquema PostgreSQL por organización: depósitos, lotes, movimientos (inmutables) y
   saldos derivados o materializados; RLS por empresa y rol.
2. Movimientos como RPC/función transaccional: validación de saldo bajo bloqueo o
   control de versión, transferencia en una sola transacción.
3. Adaptador `Persistence` asíncrono (o servicio servidor) que reemplace `browserPersistence`;
   el dominio ya está aislado de React y del navegador.
4. Migración explícita del demo local (o descarte) y auditoría de usuario por movimiento.
5. Vincular lotes con productos de Marketplace: reservas sobre saldo disponible del
   depósito, egreso al confirmar la operación y conciliación con COMEX.
6. Opcional: anclar en Stellar el hash de cierres de inventario con el servicio existente.
