/**
 * Verificación visual: recorre las pantallas principales, guarda capturas en
 * docs/screenshots y falla si hay errores de consola o de página.
 *   npm run build && npx vite preview --port 4173 &
 *   npm run screenshots
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { buildSeed, IDS } from '../src/data/seed';
import { ROOT } from './stellar/common';

const BASE = process.env.APP_URL ?? 'http://localhost:4173/';
const OUT = resolve(ROOT, 'docs/screenshots');
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const db = buildSeed();
const op = db.operations.find((o) => o.code === 'OP-2026-0001')!;

const PAGES: [string, string][] = [
  ['01-dashboard', '#/'],
  ['02-marketplace', '#/marketplace'],
  ['03-productos', '#/productos?tab=lotes'],
  ['04-lote-cantidades', `#/productos/${IDS.prdLitLf}?lote=${IDS.lot014}`],
  ['05-solicitudes', '#/solicitudes'],
  ['06-matching-escenario-a-jazmin', `#/matching?request=${IDS.req002}`],
  ['07-matching-escenario-b-compatible', `#/matching?request=${IDS.req003}`],
  ['08-matching-consolidacion', `#/matching?request=${IDS.req004}`],
  ['09-cotizacion-versiones', `#/cotizaciones/${op.quotationId}`],
  ['10-operacion-resumen', `#/operaciones/${op.id}`],
  ['11-operacion-documentos', `#/operaciones/${op.id}?tab=documentos`],
  ['12-operacion-embarque', `#/operaciones/${op.id}?tab=embarque`],
  ['13-conciliacion-escenario-f', `#/conciliacion?op=${op.id}`],
  ['14-trazabilidad', `#/trazabilidad?op=${op.id}`],
  ['15-verificacion', '#/verificacion'],
  ['16-operacion-stellar', `#/operaciones/${op.id}?tab=stellar`],
  ['17-configuracion', '#/configuracion'],
  ['18-asistente', '#/nueva-operacion'],
];

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'es-AR' });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  for (const [name, hash] of PAGES) {
    await page.goto(`${BASE}${hash}`);
    await settle(page);
    const fallback = await page.getByText('No se pudo mostrar esta pantalla').count();
    if (fallback) problems.push(`${name}: la pantalla cayó en el ErrorBoundary`);
    await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });
    console.log(`✓ ${name}`);
  }

  // Vista móvil de una pantalla densa.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}#/`);
  await settle(page);
  await page.screenshot({ path: resolve(OUT, '19-movil-dashboard.png'), fullPage: true });
  console.log('✓ 19-movil-dashboard');

  await browser.close();
  if (problems.length) {
    console.error(`\n${problems.length} problema(s):\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`\nCapturas en ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
