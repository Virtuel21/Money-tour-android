/** Real browser acceptance for desktop board exploration and home pawn compositing.
 * DESKTOP_CONTROLS_QA_URL targets an existing server or the public deployment.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { qaServer } from './qa-server.mjs';
import { createPlayerFixture } from './qa-player-fixtures.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(
  process.env.DESKTOP_CONTROLS_QA_OUT ?? '../../outputs/recette-commandes-pc',
);
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.DESKTOP_CONTROLS_QA_URL, 4197);
const browser = await chromium.launch({ headless: true });
const results = { url: app.url, checks: [], screenshots: [], errors: [] };
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on('pageerror', (error) => results.errors.push(error.message));
const write = () => fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
const capture = async (name) => {
  await page.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' });
  results.screenshots.push(`${name}.png`);
};
const ready = async () => {
  await page.locator('.board-canvas canvas').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.locator('.pawn-foreground').first().waitFor({ state: 'visible', timeout: 60000 });
};
const projection = () => page.locator('.board-hit-polygons polygon').first().getAttribute('points');
const zoom = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom);
async function pointOnTile() {
  return page.evaluate(() => {
    const svg = document.querySelector('.board-hit-polygons');
    const box = svg.getBoundingClientRect();
    for (const polygon of svg.querySelectorAll('polygon')) {
      const points = polygon
        .getAttribute('points')
        .trim()
        .split(/\s+/)
        .map((point) => point.split(',').map(Number));
      const x =
        box.x +
        (box.width * points.reduce((sum, point) => sum + point[0], 0)) / (100 * points.length);
      const y =
        box.y +
        (box.height * points.reduce((sum, point) => sum + point[1], 0)) / (100 * points.length);
      if (document.elementFromPoint(x, y) === polygon)
        return { x, y, label: polygon.getAttribute('aria-label') };
    }
    return null;
  });
}
try {
  await page.addInitScript((save) => {
    localStorage.clear();
    localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
    localStorage.setItem('money-tour.language.v1', 'fr');
    // The preview must stay fully framed even after playing at maximum zoom.
    localStorage.setItem('money-tour.comfort', JSON.stringify({ boardZoom: 400, pace: 'normal' }));
    localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, sound: false }));
  }, createPlayerFixture('friends').save);
  await page.goto(app.url);
  await ready();
  const home = await page.evaluate(() => {
    const shell = document.querySelector('.board-demo');
    const labels = shell.querySelector('.board-labels');
    const layer = shell.querySelector('.pawn-foreground-layer');
    return {
      foregroundPawns: layer.querySelectorAll('.pawn-foreground').length,
      visiblePawns: [...layer.querySelectorAll('.pawn-foreground')].filter(
        (pawn) => getComputedStyle(pawn).visibility === 'visible',
      ).length,
      foregroundZ: Number(getComputedStyle(layer).zIndex),
      labelsZ: Number(getComputedStyle(labels).zIndex),
      startName:
        shell.querySelector('[data-tile-label="0"][data-label-kind="name"]')?.textContent ?? null,
      duelName: [...labels.querySelectorAll('[data-label-kind="name"]')].find((label) =>
        label.textContent.includes('Duel'),
      )?.textContent,
    };
  });
  assert.equal(home.foregroundPawns, 4);
  assert.equal(home.visiblePawns, 4);
  assert(
    home.foregroundZ > home.labelsZ,
    'Preview characters paint completely in front of city text',
  );
  assert.equal(home.startName, null, 'Start has no visible label');
  assert.equal(home.duelName, 'Duel');
  await capture('accueil-personnages');
  results.checks.push({ name: 'home-foreground-and-short-labels', ...home });
  await page.getByRole('button', { name: /Reprendre ma partie$/ }).click();
  await ready();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Vue globale', exact: true }).click();
  assert.equal(await zoom(), 100);
  await page.waitForTimeout(180);
  const initial = await projection();
  const tile = await pointOnTile();
  assert(tile, 'An exposed tile has a real mouse target');
  await page.mouse.move(tile.x, tile.y);
  await page.mouse.wheel(0, -500);
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom > 100,
  );
  await page.waitForTimeout(180);
  const enlarged = await projection();
  assert.notEqual(enlarged, initial);
  const enlargedZoom = await zoom();
  const dragPoint = await pointOnTile();
  assert(dragPoint);
  await page.mouse.move(dragPoint.x, dragPoint.y);
  await page.mouse.down();
  await page.mouse.move(dragPoint.x + 100, dragPoint.y + 35, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(180);
  assert.notEqual(await projection(), enlarged, 'Holding left click moves the actual board camera');
  assert.equal(await page.locator('dialog[open]').count(), 0, 'Drag release does not open a tile');
  assert.equal(await page.locator('.board-shell').getAttribute('data-camera'), 'manual');
  await capture('plateau-zoom-deplace');
  const clickPoint = await pointOnTile();
  assert(clickPoint);
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await page.locator('dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'hidden' });
  results.checks.push({
    name: 'wheel-drag-and-fresh-tile-click',
    zoom: enlargedZoom,
    realPointerInput: true,
  });
  await page.getByRole('button', { name: 'Vue globale', exact: true }).click();
  await page.waitForTimeout(180);
  assert.equal(await zoom(), 100);
  assert.equal(await page.locator('.board-shell').getAttribute('data-camera'), 'overview');
  assert.equal(
    await projection(),
    initial,
    'Global view restores the initial camera scale and position',
  );
  const wheelPoint = await pointOnTile();
  await page.mouse.move(wheelPoint.x, wheelPoint.y);
  await page.mouse.wheel(0, -10000);
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom === 400,
  );
  await page.mouse.wheel(0, 10000);
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom === 70,
  );
  const tools = await page.locator('.game-tools').boundingBox();
  await page.mouse.move(tools.x + 5, tools.y + 5);
  await page.mouse.wheel(0, -1000);
  await page.waitForTimeout(100);
  assert.equal(await zoom(), 70, 'Wheel outside the board leaves its zoom unchanged');
  await page.getByRole('button', { name: 'Vue globale', exact: true }).click();
  await capture('plateau-vue-globale');
  results.checks.push({ name: 'global-reset-clamp-and-wheel-scope', minimum: 70, maximum: 400 });
  assert.deepEqual(results.errors, []);
  console.log(
    JSON.stringify({
      passed: results.checks.length,
      screenshots: results.screenshots,
      url: app.url,
    }),
  );
} catch (error) {
  results.failure = { message: error.message, stack: error.stack };
  await capture('echec').catch(() => {});
  throw error;
} finally {
  await write();
  await context.close();
  await browser.close();
  app.close();
}
