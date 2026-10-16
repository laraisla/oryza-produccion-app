/**
 * Genera supabase/seed.sql a partir de los datos demo de la app.
 *   npm run db:seed            → escribe el archivo
 *   npm run db:seed -- --check → falla si el archivo versionado no coincide con el generado
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSeed } from '@/data/seed';
import { seedToSql } from './seedSql';

const target = resolve(import.meta.dirname, '../../supabase/seed.sql');
const sql = seedToSql(buildSeed());

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Archivo inexistente: se informa abajo como desactualizado.
  }
  if (current !== sql) {
    console.error('supabase/seed.sql no coincide con los datos demo actuales. Ejecutar: npm run db:seed');
    process.exit(1);
  }
  console.log('supabase/seed.sql está actualizado.');
} else {
  writeFileSync(target, sql);
  console.log(`Escrito ${target} (${sql.length} bytes).`);
}
