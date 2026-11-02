// Valida la migración propuesta en un Postgres embebido (PGlite), sin red.
// Uso: node validar.mjs <raiz del proyecto>
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.argv[2];
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const db = new PGlite();
let fallos = 0;
const ok = (m) => console.log("  ✔", m);
const mal = (m) => { fallos++; console.log("  ✘", m); };
async function debeFallar(desc, sql, patron) {
  try { await db.exec(sql); mal(`${desc} (no falló)`); }
  catch (e) { (patron && !patron.test(e.message)) ? mal(`${desc}: ${e.message}`) : ok(`${desc} → rechazado: ${e.message.split("\n")[0]}`); }
}
const uno = async (sql) => (await db.query(sql)).rows[0];

// --- Entorno tipo Supabase (stubs mínimos) ---
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id UUID PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth, public TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
`);
console.log("▶ Migración existente 0000 (WhatsApp)");
await db.exec(leer("drizzle/migrations/0000_whatsapp_inbox_y_asistente.sql"));
await db.exec(`INSERT INTO whatsapp_acciones (id, telefono, tipo, datos, resumen) VALUES ('00000000-0000-0000-0000-0000000000aa','5493620000000','publicar_oferta','{}','x');
  INSERT INTO whatsapp_ofertas (codigo, telefono, tipo_arroz, variedad, cantidad_tn) VALUES ('OF-0001','5493620000000','Blanco','Largo fino',80);`);
ok("tablas whatsapp_* creadas con 1 oferta de ejemplo");

console.log("▶ Propuesta 0001");
await db.exec(leer("db/propuesta/0001_nucleo_comercial.sql"));
ok("aplicada sin errores");

// --- Datos ---
const U_VEND = "11111111-1111-1111-1111-111111111111", U_COMP = "22222222-2222-2222-2222-222222222222", U_AJENO = "33333333-3333-3333-3333-333333333333";
await db.exec(`
  INSERT INTO auth.users VALUES ('${U_VEND}'), ('${U_COMP}'), ('${U_AJENO}');
  INSERT INTO empresas (id, razon_social, nombre_comercial) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001','Molino Demo','Molino'), ('aaaaaaaa-0000-0000-0000-000000000002','Comprador Demo','Comprador'),
    ('aaaaaaaa-0000-0000-0000-000000000003','Ajena Demo','Ajena');
  INSERT INTO miembros VALUES ('aaaaaaaa-0000-0000-0000-000000000001','${U_VEND}','admin'),
    ('aaaaaaaa-0000-0000-0000-000000000002','${U_COMP}','comercial'), ('aaaaaaaa-0000-0000-0000-000000000003','${U_AJENO}','admin');
  INSERT INTO productos (id, empresa_id, tipo_arroz, variedad) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Blanco','Largo fino');
  INSERT INTO lotes (id, codigo, producto_id, empresa_id, quebrado_pct, humedad_pct, presentacion)
    VALUES ('cccccccc-0000-0000-0000-000000000001','LT-1','bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',4,13,'Bolsas de 25 kg');
`);

console.log("▶ Inventario");
await db.exec(`SELECT registrar_movimiento('cccccccc-0000-0000-0000-000000000001','ingreso',100,'web','ingreso-1')`);
await db.exec(`SELECT registrar_movimiento('cccccccc-0000-0000-0000-000000000001','ingreso',100,'web','ingreso-1')`);
let s = await uno(`SELECT stock_fisico_tn::float AS s, (SELECT count(*)::int FROM movimientos_stock) AS n FROM lotes`);
s.s === 100 && s.n === 1 ? ok("ingreso idempotente: repetir la clave no duplica (100 tn, 1 movimiento)") : mal(`ingreso duplicado ${JSON.stringify(s)}`);
await db.exec(`SELECT registrar_movimiento('cccccccc-0000-0000-0000-000000000001','egreso',10,'whatsapp','wa-accion-1')`);
await db.exec(`SELECT registrar_movimiento('cccccccc-0000-0000-0000-000000000001','egreso',10,'whatsapp','wa-accion-1')`);
s = await uno(`SELECT stock_fisico_tn::float AS s FROM lotes`);
s.s === 90 ? ok("egreso por WhatsApp idempotente: un solo descuento (90 tn)") : mal(`descuento duplicado ${s.s}`);
await debeFallar("egreso mayor al disponible", `SELECT registrar_movimiento('cccccccc-0000-0000-0000-000000000001','egreso',500,'web','e-x')`, /insuficiente/);
await debeFallar("cantidad negativa", `SELECT registrar_movimiento('cccccccc-0000-0000-0000-000000000001','egreso',-5,'web','e-y')`, /mayor a 0/);
await debeFallar("stock físico negativo por UPDATE directo", `UPDATE lotes SET stock_fisico_tn = -1`, /check/i);

console.log("▶ Órdenes y reservas");
const orden = (id, cod, tn, extra) => `INSERT INTO ordenes (id, codigo, tipo_operacion, lote_id, comprador_empresa_id, vendedor_empresa_id, cantidad_tn, precio_tn_usd, condiciones, terms_hash, incoterm, lugar_designado, lugar_entrega)
  VALUES ('${id}','${cod}',${extra},'cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',${tn},500,'{}','${"a".repeat(64)}',`;
await debeFallar("venta local con Incoterm", orden("dddddddd-0000-0000-0000-00000000000f", "OC-X", 1, "'local'") + `'FOB',NULL,'Planta')`, /orden_por_tipo/);
await debeFallar("exportación sin Incoterm", orden("dddddddd-0000-0000-0000-00000000000e", "OC-Y", 1, "'exportacion'") + `NULL,'Puerto',NULL)`, /orden_por_tipo/);
await db.exec(orden("dddddddd-0000-0000-0000-000000000001", "OC-1", 60, "'local'") + `NULL,NULL,'Planta')`);
await db.exec(orden("dddddddd-0000-0000-0000-000000000002", "OC-2", 60, "'exportacion'") + `'FOB','Puerto de Buenos Aires',NULL)`);
ok("orden local sin Incoterm y orden de exportación con Incoterm aceptadas");
await db.exec(`SELECT reservar_stock('dddddddd-0000-0000-0000-000000000001', now() + interval '2 days')`);
await db.exec(`SELECT reservar_stock('dddddddd-0000-0000-0000-000000000001', now() + interval '2 days')`);
s = await uno(`SELECT disponible_tn::float AS d, (SELECT count(*)::int FROM reservas) AS n FROM lotes_disponibilidad`);
s.d === 30 && s.n === 1 ? ok("reserva idempotente: disponible 90 − 60 = 30 tn") : mal(`reserva ${JSON.stringify(s)}`);
await debeFallar("segunda reserva que excede el disponible", `SELECT reservar_stock('dddddddd-0000-0000-0000-000000000002', now() + interval '2 days')`, /insuficiente/);
await debeFallar("egreso que pisaría la reserva", `SELECT registrar_movimiento('cccccccc-0000-0000-0000-000000000001','egreso',40,'web','e-z')`, /insuficiente/);

console.log("▶ Transiciones");
await debeFallar("saltar de emitida a despachada", `SELECT avanzar_orden('dddddddd-0000-0000-0000-000000000001','despachada')`, /no permitida/);
for (const e of ["aceptada", "en_preparacion", "despachada"]) await db.exec(`SELECT avanzar_orden('dddddddd-0000-0000-0000-000000000001','${e}')`);
s = await uno(`SELECT stock_fisico_tn::float AS f, (SELECT estado FROM reservas) AS r, (SELECT disponible_tn::float FROM lotes_disponibilidad) AS d, (SELECT count(*)::int FROM orden_eventos) AS ev FROM lotes`);
s.f === 30 && s.r === "consumida" && s.d === 30 && s.ev === 3 ? ok("despacho consume la reserva y descuenta el físico una sola vez (30 tn, 3 eventos)") : mal(`despacho ${JSON.stringify(s)}`);
await debeFallar("despachar de nuevo", `SELECT avanzar_orden('dddddddd-0000-0000-0000-000000000001','despachada')`, /no permitida/);

console.log("▶ RLS (rol authenticated)");
await db.exec(`GRANT authenticated TO CURRENT_USER`);
const como = async (uid, sql) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid}',false);`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`RESET ROLE`); }
};
let r = await como(U_COMP, `SELECT codigo FROM ordenes ORDER BY codigo`);
r.length === 2 ? ok("el comprador ve sus 2 órdenes") : mal(`comprador ve ${r.length}`);
r = await como(U_AJENO, `SELECT codigo FROM ordenes`);
r.length === 0 ? ok("una empresa ajena no ve órdenes de terceros") : mal(`ajeno ve ${r.length}`);
r = await como(U_AJENO, `SELECT id FROM movimientos_stock`);
r.length === 0 ? ok("una empresa ajena no ve movimientos de stock") : mal(`ajeno ve movimientos ${r.length}`);
r = await como(U_VEND, `SELECT id FROM movimientos_stock`);
r.length >= 3 ? ok(`el vendedor ve los movimientos de su lote (${r.length})`) : mal(`vendedor ve ${r.length}`);
try { await como(U_VEND, `UPDATE lotes SET stock_fisico_tn = 999`); mal("el vendedor pudo editar el stock directo"); }
catch (e) { ok(`el stock no se edita directo: ${e.message.split("\n")[0]}`); }
try { await como(U_COMP, `UPDATE ordenes SET estado = 'cerrada'`); mal("el comprador cambió el estado sin avanzar_orden"); }
catch (e) { ok(`estado de orden solo vía avanzar_orden: ${e.message.split("\n")[0]}`); }
try { await como(U_AJENO, `SELECT avanzar_orden('dddddddd-0000-0000-0000-000000000002','aceptada')`); mal("un ajeno avanzó una orden"); }
catch (e) { ok(`un ajeno no puede avanzar órdenes: ${e.message.split("\n")[0]}`); }
r = await como(U_COMP, `SELECT * FROM whatsapp_mensajes`).then(() => "visible", (e) => e.message.split("\n")[0]);
r !== "visible" ? ok(`tablas whatsapp_* siguen cerradas al cliente: ${r}`) : mal("whatsapp visible para authenticated");

console.log("▶ Reversión");
await db.exec(leer("db/propuesta/0001_rollback.sql"));
s = await uno(`SELECT (SELECT count(*)::int FROM whatsapp_ofertas) AS o,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public') AS t,
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='whatsapp_ofertas' AND column_name='lote_id') AS c`);
s.o === 1 && s.t === 5 && s.c === 0 ? ok("rollback: quedan solo las 5 tablas whatsapp_* con sus datos intactos") : mal(`rollback ${JSON.stringify(s)}`);
await db.exec(leer("db/propuesta/0001_nucleo_comercial.sql"));
ok("se puede volver a aplicar después del rollback");

console.log(fallos ? `\n✘ ${fallos} verificación(es) fallaron` : "\n✅ Todas las verificaciones pasaron");
process.exit(fallos ? 1 : 0);
