import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSeed } from '@/data/seed';
import {
  BANK_REPORT_STATUS,
  DOCUMENT_STATUS,
  INCOTERMS,
  OPERATION_STATUS,
  PACKAGING_TYPES,
  PAYMENT_METHODS,
  PROCESSING,
  PRODUCT_CATEGORIES,
  QUOTATION_STATUS,
  RECONCILIATION_STATUS,
  REQUEST_STATUS,
  REQUIREMENT_CATEGORIES,
  RICE_TYPES,
  ROLES,
  SHIPMENT_STATUS,
  VERIFICATION_STATUS,
  VERSION_STATUS,
} from '@/domain/catalogs';
import { COST_STAGES, COST_UNITS } from '@/domain/costing';
import { MATCH_STATUS_LABEL } from '@/domain/matching';
import { CURRENCIES } from '@/domain/units';
import { seedToSql } from '../../scripts/db/seedSql';

const migration = readFileSync(resolve(__dirname, '../../supabase/migrations/20261016000000_agromatch_schema.sql'), 'utf8');

/** Valores del `check (columna in (...))` de una columna en el `create table` correspondiente. */
function checkValues(table: string, column: string): string[] {
  const start = migration.indexOf(`create table public.${table} (`);
  if (start < 0) throw new Error(`Tabla ${table} no encontrada`);
  const body = migration.slice(start, migration.indexOf('\n);', start));
  const line = body.split('\n').find((l) => l.trimStart().startsWith(`${column} `));
  const match = line?.match(/ in \(([^)]*)\)/);
  if (!match) throw new Error(`Check de ${table}.${column} no encontrado`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

const keys = (record: Record<string, unknown>) => Object.keys(record).sort();

describe('esquema SQL alineado con el dominio', () => {
  const cases: [string, string, string[]][] = [
    ['organization_members', 'role', keys(ROLES)],
    ['products', 'category', keys(PRODUCT_CATEGORIES)],
    ['products', 'commercial_type', keys(RICE_TYPES)],
    ['products', 'processing', keys(PROCESSING)],
    ['products', 'ncm_status', keys(VERIFICATION_STATUS)],
    ['product_presentations', 'packaging', keys(PACKAGING_TYPES)],
    ['lots', 'quality_status', keys(VERIFICATION_STATUS)],
    ['buyer_requests', 'status', keys(REQUEST_STATUS)],
    ['buyer_requests', 'commercial_type', keys(RICE_TYPES)],
    ['buyer_requests', 'packaging_type', keys(PACKAGING_TYPES)],
    ['buyer_requests', 'currency', [...CURRENCIES].sort()],
    ['buyer_requests', 'preferred_incoterm', [...INCOTERMS].sort()],
    ['commercial_matches', 'status', keys(MATCH_STATUS_LABEL)],
    ['cost_catalog', 'stage', keys(COST_STAGES)],
    ['cost_catalog', 'unit', keys(COST_UNITS)],
    ['scenario_cost_lines', 'unit', keys(COST_UNITS)],
    ['quotations', 'status', keys(QUOTATION_STATUS)],
    ['quotation_versions', 'status', keys(VERSION_STATUS)],
    ['quotation_versions', 'incoterm', [...INCOTERMS].sort()],
    ['trade_operations', 'status', keys(OPERATION_STATUS)],
    ['trade_operations', 'payment_method', keys(PAYMENT_METHODS)],
    ['shipments', 'status', keys(SHIPMENT_STATUS)],
    ['destination_requirements', 'category', keys(REQUIREMENT_CATEGORIES)],
    ['operation_documents', 'status', keys(DOCUMENT_STATUS)],
    ['payments', 'bank_report_status', keys(BANK_REPORT_STATUS)],
    ['financial_reconciliations', 'status', keys(RECONCILIATION_STATUS)],
    ['verification_records', 'status', keys(VERIFICATION_STATUS)],
  ];

  it.each(cases)('%s.%s acepta exactamente los valores del catálogo', (table, column, expected) => {
    expect(checkValues(table, column)).toEqual(expected);
  });

  it('todas las tablas de negocio tienen RLS habilitado', () => {
    const tables = [...migration.matchAll(/create table public\.(\w+) \(/g)].map((m) => m[1]);
    const rlsBlock = migration.slice(migration.indexOf('foreach t in array array['), migration.indexOf('] loop'));
    for (const table of tables) expect(rlsBlock, table).toContain(`'${table}'`);
  });
});

describe('seed SQL', () => {
  const sql = seedToSql(buildSeed());

  it('es una única transacción sin valores indefinidos', () => {
    expect(sql).toMatch(/^-- AgroMatch COMEX/);
    expect(sql).toContain('\nbegin;\n');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).not.toMatch(/undefined|NaN/);
  });

  it('incluye la operación demo con su versión aceptada y no inventa registros blockchain', () => {
    expect(sql).toContain("'OP-2026-0001'");
    expect(sql).toContain('insert into public.quotation_version_costing');
    expect(sql).toContain('-- public.blockchain_records: sin filas');
  });

  it('coincide con supabase/seed.sql versionado (regenerar con npm run db:seed)', () => {
    const committed = readFileSync(resolve(__dirname, '../../supabase/seed.sql'), 'utf8');
    expect(committed).toBe(sql);
  });
});
