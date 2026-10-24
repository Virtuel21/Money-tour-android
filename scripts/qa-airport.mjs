/** Airport acceptance through ordinary saved-game resume, including public builds.
 * AIRPORT_QA_URL targets a running preview/deployment; otherwise starts Vite.
 * AIRPORT_QA_OUT selects the evidence directory. Mobile/touch input is emulated.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { tsImport } from 'tsx/esm/api';
import { createPlayerFixture } from './qa-player-fixtures.mjs';
import { qaServer } from './qa-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(
  process.env.AIRPORT_QA_OUT ?? '../../outputs/recette-aeroport-partage/airport-local',
);
const fixture = createPlayerFixture('friends');
const state = fixture.save.state;
const airport = state.config.board.find((tile) => tile.type === 'travel');
assert(airport, 'The current board has an airport');
state.players[state.currentPlayer].position = airport.id;
const { validateState } = await tsImport('../packages/engine/src/index.ts', import.meta.url);
assert.deepEqual(validateState(state), [], 'Airport fixture is a valid current save');
assert.equal(state.config.board.length, 32);

const results = {
  startedAt: new Date().toISOString(),
  url: '',
  environment: 'Headless Chrome and WebKit; mobile viewport/touch input is emulated.',
  checks: [],
  screenshots: [],
  errors: [],
  failures: [],
};
const screens = [
  ['desktop', 1440, 1000],
  ['mobile', 390, 844],
  ['landscape', 844, 390],
];
const engines = [
  ['chrome', chromium, { channel: 'chrome' }],
  ['webkit', webkit, {}],
];
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.AIRPORT_QA_URL, 4198);
results.url = app.url;
const write = () => fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));

async function capture(page, name, clip) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(out, filename), animations: 'disabled', clip });
  results.screenshots.push(filename);
}

async function geometry(page) {
  return page.evaluate((id) => {
    const label = document.querySelector(`[data-tile-label="${id}"][data-label-kind="name"]`);
    const box = label?.getBoundingClientRect();
    return {
      tiles: document.querySelectorAll('.board-hit-polygons [role="button"]').length,
      names: document.querySelectorAll('[data-label-kind="name"]').length,
      airportName: label?.textContent,
      labelInViewport: Boolean(
        box &&
        box.width > 0 &&
        box.height > 0 &&
        box.left >= -1 &&
        box.top >= -1 &&
        box.right <= innerWidth + 1 &&
        box.bottom <= innerHeight + 1,
      ),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      contextLossEvents: window.airportQaContextLosses,
      contexts: [
        ...document.querySelectorAll('.board-canvas canvas, .festival-foreground-layer'),
      ].map((canvas) => {
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        return { width: canvas.width, height: canvas.height, lost: !gl || gl.isContextLost() };
      }),
    };
  }, airport.id);
}

async function run(browser, browserName, screen, width, height) {
  const name = `${browserName}-${screen}-${width}x${height}`;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: width < 1000,
    hasTouch: width < 1000,
    locale: 'fr-FR',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => results.errors.push({ name, message: error.message }));
  try {
    await context.addInitScript((save) => {
      localStorage.clear();
      localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
      localStorage.setItem('money-tour.language.v1', 'fr');
      localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, sound: false }));
      localStorage.setItem(
        'money-tour.comfort',
        JSON.stringify({ largeText: false, pace: 'normal', boardZoom: 100 }),
      );
      window.airportQaContextLosses = 0;
      document.addEventListener('webglcontextlost', () => window.airportQaContextLosses++, true);
    }, fixture.save);
    await page.goto(app.url);
    await page.getByRole('button', { name: /Reprendre ma partie$/ }).click({ timeout: 45000 });
    await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
    await page.locator('.board-canvas canvas').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForFunction(
      () =>
        document.querySelector('.board-hit-polygons polygon')?.getAttribute('points')?.length > 10,
      null,
      { timeout: 60000 },
    );
    await page.locator('.turn-banner').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const understood = page.getByRole('button', { name: 'Compris', exact: true });
    if (await understood.count()) await understood.click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    const board = await geometry(page);
    assert.equal(board.tiles, 32, 'Every board tile retains its accessible label/button');
    // Départ intentionally has no printed name; the other 31 cells keep theirs.
    assert.equal(board.names, 31, 'All printed board names remain present');
    assert.equal(board.airportName, 'Voyage');
    assert(board.labelInViewport, 'The Voyage name is visible inside the viewport');
    assert(!board.overflow, 'No horizontal document overflow');
    assert.equal(board.contextLossEvents, 0, 'No WebGL context-loss event');
    assert(board.contexts.length >= 1, 'The real board canvas is rendered');
    assert(
      board.contexts.every((gl) => gl.width > 0 && gl.height > 0 && !gl.lost),
      'All board WebGL contexts remain valid',
    );
    await capture(page, `${name}-board`);
    const tile = page.getByRole('button', { name: `Voir ${airport.name}`, exact: true });
    const box = await tile.boundingBox();
    assert(box, 'Airport has a projected clickable tile');
    const left = Math.max(0, Math.floor(box.x - 35));
    const top = Math.max(0, Math.floor(box.y - 90));
    await capture(page, `${name}-airport`, {
      x: left,
      y: top,
      width: Math.min(width - left, Math.ceil(box.width + 70)),
      height: Math.min(height - top, Math.ceil(box.height + 125)),
    });
    await tile.click();
    const dialog = page.getByRole('dialog', { name: airport.name, exact: true });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('heading', { name: airport.name, exact: true }).waitFor();
    assert.match(await dialog.innerText(), /Au prochain tour, voyagez pour 50/);
    await capture(page, `${name}-inspection`);
    await dialog.getByRole('button', { name: 'Retour au plateau', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const after = await geometry(page);
    assert(!after.overflow, 'No horizontal overflow after airport inspection');
    assert.equal(after.contextLossEvents, 0);
    assert(
      after.contexts.every((gl) => !gl.lost),
      'Board survives airport inspection',
    );
    assert.equal(results.errors.filter((error) => error.name === name).length, 0);
    results.checks.push({ name, passed: true, board, inspectionOpened: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.failures.push({ name, message: error.message, stack: error.stack });
    await capture(page, `${name}-failure`).catch(() => {});
    console.log(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.close();
    await write();
  }
}

try {
  for (const [name, engine, options] of engines) {
    const browser = await engine.launch({ headless: true, ...options });
    try {
      for (const [screen, width, height] of screens)
        await run(browser, name, screen, width, height);
    } finally {
      await browser.close();
    }
  }
  assert.equal(results.failures.length, 0, 'Every airport browser case passes');
  assert.equal(results.errors.length, 0, 'No page errors');
} finally {
  results.finishedAt = new Date().toISOString();
  await write();
  app.close();
}
