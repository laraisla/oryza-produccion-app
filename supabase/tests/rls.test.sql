-- AgroMatch COMEX — pruebas de seguridad por fila (RLS) e integridad sobre el seed demo.
-- Requiere: migraciones + supabase/seed.sql aplicados. Ejecutar con `npm run test:db`
-- (o `psql -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql` como rol postgres).
-- Cada aserción imprime "ok - ..."; la primera falla aborta con "FALLA: ...".
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create schema if not exists agromatch_test;
grant usage on schema agromatch_test to anon, authenticated;

-- Simula una sesión de Supabase Auth: claims del JWT + rol authenticated (hasta el fin de la transacción).
create or replace function agromatch_test.login(user_email text) returns text
language plpgsql as $$
declare
  uid uuid;
begin
  perform set_config('role', 'none', true);
  select id into strict uid from public.profiles where email = user_email;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  return '# sesión: ' || user_email;
end;
$$;

create or replace function agromatch_test.ok(passed boolean, description text) returns text
language plpgsql as $$
begin
  if passed is distinct from true then
    raise exception 'FALLA: %', description;
  end if;
  return 'ok - ' || description;
end;
$$;

-- La sentencia debe fallar con un mensaje que contenga `expected`.
create or replace function agromatch_test.fails(statement text, expected text, description text) returns text
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm ilike '%' || expected || '%' then
      return 'ok - ' || description;
    end if;
    raise exception 'FALLA: % (error inesperado: %)', description, sqlerrm;
  end;
  raise exception 'FALLA: % (la sentencia no falló)', description;
end;
$$;

-- Filas afectadas por una sentencia (RLS filtra en silencio los UPDATE/DELETE no autorizados).
create or replace function agromatch_test.affected(statement text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on all functions in schema agromatch_test to anon, authenticated;

-- Referencias (como postgres, antes de cambiar de rol).
select id as op_id, quotation_id as quot_id, accepted_version_id as acc_ver, product_id as prd_id from public.trade_operations where code = 'OP-2026-0001' \gset
select id as org_litoral from public.organizations where name = 'Molino Demo Litoral S.A.' \gset
select id as org_chaco from public.organizations where name = 'Arrocera Demo Chaco S.R.L.' \gset
select id as org_andes from public.organizations where name = 'Importadora Demo Andes S.A.C.' \gset
select id as lot009 from public.lots where code = 'LOT-2026-009' \gset
select id as lot014 from public.lots where code = 'LOT-2026-014' \gset
select id as lot021 from public.lots where code = 'LOT-2026-021' \gset
select id as fac_chaco from public.facilities where organization_id = :'org_chaco' limit 1 \gset
select id as pres_lit from public.product_presentations where product_id = :'prd_id' limit 1 \gset
select id as fin_doc from public.operation_documents where is_financial limit 1 \gset
select id as buyer_doc from public.operation_documents where organization_id = :'org_andes' and current_version = 0 limit 1 \gset
select id as seller_doc from public.operation_documents where organization_id = :'org_litoral' and not is_financial and status = 'submitted' limit 1 \gset
select id as req002 from public.buyer_requests where code = 'RFQ-2026-002' \gset

\echo '# 1. Comprador de la operación (Importadora Demo Andes, rol comprador)'
begin;
select agromatch_test.login('diego@andes-import.example');
select agromatch_test.ok((select count(*) from trade_operations) = 1, 've su operación OP-2026-0001');
select agromatch_test.ok((select count(*) from quotation_versions where quotation_id = :'quot_id') = 2, 've las versiones enviadas de su cotización');
select agromatch_test.ok((select price_per_t from quotation_versions where id = :'acc_ver') = 750, 've el precio pactado (USD 750/t)');
select agromatch_test.ok((select count(*) from quotation_version_costing) = 0, 'no ve el costeo privado del vendedor (costos, márgenes)');
select agromatch_test.ok((select count(*) from quotation_items) = 0, 'no ve el desglose de gastos de la cotización');
select agromatch_test.ok((select count(*) from cost_scenarios) = 0, 'no ve escenarios de costos del vendedor');
select agromatch_test.ok((select count(*) from scenario_cost_lines) = 0, 'no ve partidas de costos del vendedor');
select agromatch_test.ok((select count(*) from cost_catalog) = 0, 'no ve el catálogo de costos del vendedor');
select agromatch_test.ok((select count(*) from fx_rates) = 0, 'no ve tipos de cambio internos del vendedor');
select agromatch_test.ok((select count(*) from invoices) = 0, 'no ve facturas del vendedor');
select agromatch_test.ok((select count(*) from payments) = 0, 'no ve cobros ni comisiones bancarias del vendedor');
select agromatch_test.ok((select count(*) from payment_allocations) = 0, 'no ve imputaciones de cobros');
select agromatch_test.ok((select count(*) from financial_reconciliations) = 0, 'no ve la conciliación financiera');
select agromatch_test.ok((select count(*) from operation_documents where id = :'fin_doc') = 0, 'no ve documentos financieros del vendedor');
select agromatch_test.ok((select count(*) from operation_documents) = 10, 've los documentos compartidos y los propios (10 de 11)');
select agromatch_test.ok((select count(*) from document_versions) = 7, 've las versiones de los documentos compartidos');
select agromatch_test.ok((select count(*) from traceability_events where not shared) = 0, 'no ve eventos internos del vendedor');
select agromatch_test.ok((select count(*) from traceability_events where operation_id = :'op_id') > 0, 've los hitos compartidos de su operación');
select agromatch_test.ok((select count(*) from audit_logs) = 0, 'no ve la auditoría de otra empresa');
select agromatch_test.ok((select count(*) from verification_records) = 0, 'no ve registros de verificación de otra empresa');
select agromatch_test.ok((select count(*) from inventory_movements) = 0, 'no ve movimientos de inventario del vendedor');
select agromatch_test.ok((select count(*) from lots where id = :'lot009') = 0, 'no ve lotes no publicados de otra empresa');
select agromatch_test.ok((select physical_t is null and reserved_t is null and committed_t is null and available_t = 60 from lot_stock where lot_id = :'lot014'), 'de un lote publicado ajeno solo ve el disponible (60 t)');
select agromatch_test.ok((select count(*) from profiles) = 4, 've su perfil y los usuarios de la contraparte');
select agromatch_test.ok(agromatch_test.affected($$update trade_operations set payment_terms = 'otra condición'$$) = 0, 'no puede modificar la operación');
select agromatch_test.ok(agromatch_test.affected(format($$update operation_documents set status = 'verified' where id = %L$$, :'seller_doc')) = 0, 'no puede verificar documentos del vendedor');
select agromatch_test.fails(format($$insert into inventory_movements (organization_id, lot_id, type, quantity_t, reference_kind) values (%L, %L, 'reservation', 1, 'manual')$$, :'org_litoral', :'lot014'), 'row-level security', 'no puede reservar stock de un lote ajeno');
select agromatch_test.fails(format($$insert into operation_documents (operation_id, organization_id, document_type, name, responsible_party, status) values (%L, %L, 'other', 'Documento falso', 'seller', 'pending')$$, :'op_id', :'org_litoral'), 'row-level security', 'no puede cargar documentos a nombre del vendedor');
select agromatch_test.ok(agromatch_test.affected(format($$insert into operation_documents (operation_id, organization_id, document_type, name, responsible_party, status) values (%L, %L, 'other', 'Registro sanitario del importador', 'buyer', 'pending')$$, :'op_id', :'org_andes')) = 1, 'puede aportar sus propios documentos a la operación');
rollback;

\echo '# 2. Otra empresa compradora (Demo Levant Trading)'
begin;
select agromatch_test.login('noa@levant-trading.example');
select agromatch_test.ok((select count(*) from trade_operations) = 0, 'no ve operaciones de terceros');
select agromatch_test.ok((select count(*) from quotations) = 0, 'no ve cotizaciones de terceros');
select agromatch_test.ok((select count(*) from quotation_versions) = 0, 'no ve versiones de cotizaciones de terceros');
select agromatch_test.ok((select count(*) from operation_documents) = 0, 'no ve documentos de operaciones ajenas');
select agromatch_test.ok((select count(*) from document_versions) = 0, 'no ve archivos de operaciones ajenas');
select agromatch_test.ok((select count(*) from shipments) = 0, 'no ve embarques ajenos');
select agromatch_test.ok((select count(*) from traceability_events where operation_id = :'op_id') = 0, 'no ve hitos de una operación ajena');
select agromatch_test.ok((select count(*) from buyer_requests where id = :'req002') = 1, 've su propia solicitud de compra');
select agromatch_test.ok((select count(*) from request_requirements where request_id = :'req002') > 0, 've los requisitos de su solicitud');
select agromatch_test.ok((select count(*) from profiles) = 1, 'solo ve su propio perfil');
select agromatch_test.fails(format($$select respond_quotation_version(%L, true)$$, :'acc_ver'), 'Solo la empresa compradora', 'no puede responder cotizaciones de otra empresa');
rollback;

\echo '# 3. Otra empresa productora (Arrocera Demo Chaco)'
begin;
select agromatch_test.login('rocio@arrocera-chaco.example');
select agromatch_test.ok((select count(*) from lots where organization_id = :'org_chaco') = 2, 've sus lotes');
select agromatch_test.ok((select count(*) from lots where organization_id = :'org_litoral' and not published) = 0, 'no ve lotes no publicados de otra empresa');
select agromatch_test.ok((select count(*) from cost_catalog) = 0, 'no ve el catálogo de costos de otra empresa');
select agromatch_test.ok((select count(*) from quotation_version_costing) = 0, 'no ve costeos de otra empresa');
select agromatch_test.ok((select count(*) from trade_operations) = 0, 'no ve operaciones ajenas');
select agromatch_test.ok((select reserved_t is not null from lot_stock where lot_id = :'lot021'), 've el detalle de stock de sus lotes');
select agromatch_test.ok(agromatch_test.affected(format($$update lots set published = false where organization_id = %L$$, :'org_litoral')) = 0, 'no puede modificar lotes de otra empresa');
rollback;

\echo '# 4. Vendedor — rol productor (Lucía, Molino Demo Litoral)'
begin;
select agromatch_test.login('lucia@molino-litoral.example');
select agromatch_test.ok((select count(*) from quotation_version_costing) = 2, 've el costeo de las cotizaciones de su empresa');
select agromatch_test.ok((select count(*) from invoices) = 0, 'no ve facturas (finanzas: solo COMEX/administración)');
select agromatch_test.ok((select count(*) from payments) = 0, 'no ve cobros (finanzas: solo COMEX/administración)');
select agromatch_test.ok((select count(*) from operation_documents where is_financial) = 0, 'no ve documentos financieros de su empresa');
select agromatch_test.ok((select physical_t = 0 and committed_t = 0 from lot_stock where lot_id = :'lot009'), 'el lote vendido quedó sin stock físico ni comprometido');
select agromatch_test.ok((select count(*) from lots) = 6, 've sus lotes y los publicados de otras empresas');
select agromatch_test.fails(format($$insert into lots (organization_id, product_id, code, facility_id, presentation_id, physical_stock_t, available_from, quality_status) values (%L, %L, 'LOT-X', %L, %L, 10, '2026-10-16', 'estimated')$$, :'org_litoral', :'prd_id', :'fac_chaco', :'pres_lit'), 'foreign key', 'un lote no puede usar la planta de otra empresa');
rollback;

\echo '# 5. Vendedor — rol COMEX (Martín, Molino Demo Litoral)'
begin;
select agromatch_test.login('martin@molino-litoral.example');
select agromatch_test.ok((select count(*) from payments) = 1, 've el cobro registrado (informativo)');
select agromatch_test.ok((select gross_amount = 30000 and foreign_bank_fees = 150 and net_amount = 29850 from payments), 'cobro bruto 30.000, comisión exterior 150, neto 29.850');
select agromatch_test.ok((select status from financial_reconciliations) = 'difference_to_review', 'la conciliación queda con diferencia a revisar');
select agromatch_test.ok((select count(*) from operation_documents) = 11, 've documentos propios, financieros y los aportados por el comprador');
select agromatch_test.ok((select count(*) from audit_logs) > 0, 've la auditoría de su empresa');
select agromatch_test.ok(agromatch_test.affected(format($$update operation_documents set status = 'observed', observation = 'Falta firma' where id = %L$$, :'buyer_doc')) = 1, 'puede observar un documento aportado por el comprador');
set constraints all immediate;
select agromatch_test.fails(format($$insert into inventory_movements (organization_id, lot_id, type, quantity_t, reference_kind) values (%L, %L, 'reservation', 60.001, 'manual')$$, :'org_litoral', :'lot014'), 'Stock insuficiente', 'no puede reservar más que el disponible del lote');
select agromatch_test.fails(format($$insert into inventory_movements (organization_id, lot_id, type, quantity_t, reference_kind) values (%L, %L, 'commitment', 1, 'manual')$$, :'org_litoral', :'lot009'), 'Stock insuficiente', 'no puede comprometer stock ya vendido');
select agromatch_test.ok(agromatch_test.affected(format($$insert into inventory_movements (organization_id, lot_id, type, quantity_t, reference_kind) values (%L, %L, 'reservation', 40, 'manual')$$, :'org_litoral', :'lot014')) = 1, 'puede reservar 40 t del lote de 60 t');
select agromatch_test.fails(format($$insert into inventory_movements (organization_id, lot_id, type, quantity_t, reference_kind) values (%L, %L, 'commitment', 21, 'manual')$$, :'org_litoral', :'lot014'), 'Stock insuficiente', 'luego no puede comprometer más de las 20 t restantes');
select agromatch_test.fails(format($$insert into inventory_movements (organization_id, lot_id, type, quantity_t, reference_kind) values (%L, %L, 'reservation', 1, 'manual')$$, :'org_chaco', :'lot021'), 'row-level security', 'no puede mover stock de lotes de otra empresa');
rollback;

\echo '# 6. Respuesta del comprador mediante la función controlada'
begin;
select agromatch_test.login('martin@molino-litoral.example');
insert into quotations (id, code, seller_organization_id, buyer_organization_id, product_id, status)
values ('00000000-0000-4000-8000-0000000000a1', 'COT-PRUEBA-1', :'org_litoral', :'org_andes', :'prd_id', 'sent');
insert into quotation_versions (id, quotation_id, version, status, price_per_t, total_amount, currency, quantity_t, incoterm, named_place, valid_until, terms, terms_hash)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 1, 'sent', 760, 30400, 'USD', 40, 'FOB', 'Buenos Aires', current_date + 10, '{}'::jsonb, repeat('a', 64)),
       ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 2, 'sent', 755, 30200, 'USD', 40, 'FOB', 'Buenos Aires', current_date - 1, '{}'::jsonb, repeat('b', 64));
update quotations set current_version_id = '00000000-0000-4000-8000-0000000000b1' where id = '00000000-0000-4000-8000-0000000000a1';
select agromatch_test.login('diego@andes-import.example');
select agromatch_test.ok(agromatch_test.affected($$update quotation_versions set status = 'accepted', accepted_at = now(), accepted_by = auth.uid() where id = '00000000-0000-4000-8000-0000000000b1'$$) = 0, 'el comprador no puede editar la versión directamente');
select agromatch_test.fails($$select respond_quotation_version('00000000-0000-4000-8000-0000000000b2', true)$$, 'vencida', 'no se acepta una versión vencida');
select agromatch_test.fails($$select respond_quotation_version('00000000-0000-4000-8000-0000000000b1', false, '  ')$$, 'motivo', 'el rechazo exige motivo');
select respond_quotation_version('00000000-0000-4000-8000-0000000000b1', true);
select agromatch_test.ok((select status = 'accepted' and accepted_by = auth.uid() from quotation_versions where id = '00000000-0000-4000-8000-0000000000b1'), 'el comprador acepta la versión enviada');
select agromatch_test.ok((select accepted_version_id = '00000000-0000-4000-8000-0000000000b1' from quotations where id = '00000000-0000-4000-8000-0000000000a1'), 'la cotización registra la versión aceptada');
select agromatch_test.ok((select status from quotation_versions where id = '00000000-0000-4000-8000-0000000000b2') = 'superseded', 'las demás versiones enviadas quedan reemplazadas');
select agromatch_test.fails($$select respond_quotation_version('00000000-0000-4000-8000-0000000000b1', true)$$, 'ya tiene una versión aceptada', 'una cotización aceptada no se vuelve a responder');
rollback;

\echo '# 7. Inmutabilidad e integridad (aplica también al rol propietario)'
begin;
select agromatch_test.fails(format($$update quotation_versions set price_per_t = 700 where id = %L$$, :'acc_ver'), 'inmutables', 'la versión aceptada no cambia de precio');
select agromatch_test.fails(format($$update quotation_versions set terms = '{}'::jsonb where id = %L$$, :'acc_ver'), 'inmutables', 'la versión aceptada no cambia de términos');
select agromatch_test.fails(format($$update quotation_versions set status = 'sent' where id = %L$$, :'acc_ver'), 'definitivo', 'el estado aceptado es definitivo');
select agromatch_test.fails(format($$delete from quotation_versions where id = %L$$, :'acc_ver'), 'no puede eliminarse', 'la versión aceptada no se elimina');
select agromatch_test.fails(format($$update quotation_version_costing set result = '{}'::jsonb where version_id = %L$$, :'acc_ver'), 'inmutable', 'el costeo congelado de la versión no cambia');
select agromatch_test.fails(format($$update quotation_items set amount = 0 where version_id = %L$$, :'acc_ver'), 'inmutable', 'el desglose congelado de la versión no cambia');
select agromatch_test.fails(format($$update trade_operations set price_per_t = 700 where id = %L$$, :'op_id'), 'no se editan', 'la operación conserva el precio pactado');
select agromatch_test.fails($$update audit_logs set summary = 'editado'$$, 'solo inserción', 'la auditoría es de solo inserción');
select agromatch_test.fails($$delete from traceability_events$$, 'solo inserción', 'la trazabilidad es de solo inserción');
select agromatch_test.fails($$update document_versions set sha256 = repeat('0', 64)$$, 'solo inserción', 'las versiones de documentos no se alteran');
select agromatch_test.fails($$delete from verification_history$$, 'solo inserción', 'el historial de verificación no se borra');
set constraints all immediate;
select agromatch_test.fails($$update payment_allocations set amount = amount + 1$$, 'superan el cobro bruto', 'las imputaciones no superan el cobro bruto');
select agromatch_test.fails(format($$insert into verification_records (organization_id, subject_kind, subject_id, data_label, value, unit, source, consulted_at, responsible, status) values (%L, 'price', gen_random_uuid(), 'Precio', '1', 'USD', 'Fuente', current_date, 'Responsable', 'verified')$$, :'org_litoral'), 'violates check constraint', 'no hay dato verificado sin evidencia');
select agromatch_test.fails(format($$insert into fx_rates (organization_id, base, quote, rate, date, source, status) values (%L, 'USD', 'ARS', 1000, current_date, 'Fuente demo', 'verified')$$, :'org_litoral'), 'violates check constraint', 'no hay tipo de cambio verificado sin URL de respaldo');
select agromatch_test.fails(format($$insert into payments (operation_id, organization_id, reference, received_date, currency, gross_amount, net_amount, bank_report_status, record_kind) values (%L, %L, 'X', current_date, 'USD', 1, 1, 'informed_by_user', 'bank_transfer')$$, :'op_id', :'org_litoral'), 'violates check constraint', 'los cobros son solo registros informativos');
select agromatch_test.fails(format($$insert into blockchain_records (operation_id, network, contract_id, action, deal_key, terms_hash, terms_version, tx_hash, ledger, confirmed_at, signer, status) values (%L, 'testnet', 'C' || repeat('A', 55), 'create_deal', repeat('a', 64), repeat('b', 64), 1, repeat('c', 64), 1, now(), 'G' || repeat('A', 55), 'pending')$$, :'op_id'), 'violates check constraint', 'no se guardan transacciones blockchain no confirmadas');
select agromatch_test.fails(format($$insert into blockchain_records (operation_id, network, contract_id, action, deal_key, terms_hash, terms_version, tx_hash, ledger, confirmed_at, signer, status) values (%L, 'testnet', 'C' || repeat('A', 55), 'create_deal', repeat('a', 64), repeat('b', 64), 1, 'tx-inventada', 1, now(), 'G' || repeat('A', 55), 'confirmed')$$, :'op_id'), 'violates check constraint', 'el hash de transacción debe tener formato válido');
select agromatch_test.fails(format($$insert into operation_documents (operation_id, organization_id, document_type, name, responsible_party, status, is_financial, shared_with_counterparty) values (%L, %L, 'bank_receipt', 'Comprobante', 'seller', 'pending', true, true)$$, :'op_id', :'org_litoral'), 'violates check constraint', 'un documento financiero no puede compartirse con la contraparte');
select agromatch_test.fails(format($$update operation_documents set status = 'submitted' where id = %L$$, :'buyer_doc'), 'violates check constraint', 'no se presenta un documento sin archivo');
rollback;

\echo '# 8. Rol anónimo'
begin;
set local role anon;
select agromatch_test.fails($$select count(*) from public.organizations$$, 'permission denied', 'el rol anónimo no lee tablas de negocio');
select agromatch_test.fails($$select count(*) from public.lots$$, 'permission denied', 'el rol anónimo no lee lotes');
rollback;

set client_min_messages = warning;
drop schema agromatch_test cascade;
\echo '# Fin: todas las aserciones pasaron.'
