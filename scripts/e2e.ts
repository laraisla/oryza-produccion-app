/**
 * Prueba de punta a punta en navegador real (Chromium headless) sobre el build:
 * Matching → Cotización (recalcula al cambiar Incoterm y margen) → envío →
 * aceptación por el comprador → operación → carga de documento → persistencia.
 *   npm run build && npx vite preview --port 4173 &
 *   npx tsx --tsconfig tsconfig.node.json scripts/e2e.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { IDS } from '../src/data/seed';
import { ROOT } from './stellar/common';

const BASE = process.env.APP_URL ?? 'http://localhost:4173/';
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = resolve(ROOT, 'docs/screenshots');
const SCRATCH = resolve(ROOT, 'test-results');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FALLÓ: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function priceOf(page: Page): Promise<string> {
  await page.waitForTimeout(150);
  return (await page.getByTestId('price-per-t').first().innerText()).trim();
}

async function switchUser(page: Page, name: string) {
  await page.getByRole('button', { name: 'Cambiar usuario demo' }).click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
  await page.waitForTimeout(200);
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'es-AR' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  console.log('Escenario B: matching');
  await page.goto(`${BASE}#/matching?request=${IDS.req003}`);
  await page.getByRole('button', { name: 'Cotizar con este lote' }).click();
  await page.waitForURL(/#\/calculadora\//);
  assert(true, 'el lote compatible abre un escenario de cotización');

  console.log('Escenario C: calculadora');
  const cfr = await priceOf(page);
  assert(/USD/.test(cfr), `precio CFR calculado: ${cfr}/t`);
  await page.getByLabel('Incoterm (2020)').selectOption('FOB');
  const fob = await priceOf(page);
  assert(fob !== cfr, `al pasar a FOB el precio se recalcula: ${fob}/t`);
  await page.getByLabel('Margen objetivo (% sobre venta)').fill('15');
  const fob15 = await priceOf(page);
  assert(fob15 !== fob, `al cambiar el margen a 15 % el precio se recalcula: ${fob15}/t`);
  await page.getByLabel('Incoterm (2020)').selectOption('CFR');
  await page.getByLabel('Margen objetivo (% sobre venta)').fill('10');
  const back = await priceOf(page);
  assert(back === cfr, 'volver a CFR y 10 % reproduce exactamente el precio inicial');
  await page.screenshot({ path: resolve(OUT, '20-calculadora-escenario-c.png'), fullPage: true });

  await page.getByRole('button', { name: 'Generar cotización' }).click();
  await page.getByRole('button', { name: 'Generar', exact: true }).click();
  await page.waitForURL(/#\/cotizaciones\//);
  await page.getByRole('button', { name: 'Enviar al comprador' }).click();
  await page.getByText('Versión enviada al comprador').first().waitFor();
  assert(true, 'cotización generada y enviada');

  console.log('Escenario D: aceptación por el comprador');
  await switchUser(page, 'Diego Paredes');
  const costsHidden = (await page.getByText('Costos internos no compartidos').count()) > 0;
  assert(costsHidden, 'el comprador no ve el desglose de costos del vendedor');
  await page.getByRole('button', { name: /Aceptar versión 1/ }).click();
  await page.getByRole('button', { name: 'Confirmar aceptación' }).click();
  await page.waitForURL(/#\/operaciones\//);
  await page.getByRole('heading', { name: 'Expediente OP-2026-0002' }).waitFor();
  assert(true, 'la aceptación creó la operación OP-2026-0002');

  console.log('Escenario E: documentación');
  await switchUser(page, 'Martín Acosta');
  await page.getByRole('tab', { name: /Documentos/ }).click();
  const file = resolve(SCRATCH, 'factura-e2e.pdf');
  writeFileSync(file, '%PDF-1.4\n% factura de prueba E2E (ficticia)\n');
  const row = page.getByRole('row', { name: /Factura de exportación/ });
  const chooser = page.waitForEvent('filechooser');
  await row.getByRole('button', { name: 'Cargar' }).click();
  await (await chooser).setFiles(file);
  await page.getByText(/Versión cargada · SHA-256/).first().waitFor();
  assert((await row.getByText('v1').count()) > 0, 'el archivo quedó como versión 1 con su hash');

  console.log('Persistencia');
  await page.reload();
  await page.getByRole('heading', { name: 'Expediente OP-2026-0002' }).waitFor();
  await page.getByRole('tab', { name: /Documentos/ }).click();
  assert((await page.getByRole('row', { name: /Factura de exportación/ }).getByText('v1').count()) > 0, 'la operación y el documento persisten tras recargar');
  await page.screenshot({ path: resolve(OUT, '21-operacion-nueva-documentos.png'), fullPage: true });

  await browser.close();
  if (errors.length) throw new Error(`Errores en consola: ${errors.join(' | ')}`);
  console.log('\nE2E OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
