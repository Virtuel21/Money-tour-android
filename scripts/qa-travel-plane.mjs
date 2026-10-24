/** Plane visual acceptance using valid saves through ordinary Resume my game.
 * PLANE_QA_URL / PLANE_QA_OUT support local preview and the public deployment.
 * Screenshots require human inspection: DOM/context checks cannot prove an intact silhouette.
 * Mobile/touch input and WebKit are desktop emulations, not physical-phone validation.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';
import { tsImport } from 'tsx/esm/api';
import { createPlayerFixture } from './qa-player-fixtures.mjs';
import { qaServer } from './qa-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.PLANE_QA_OUT ?? '../../outputs/recette-avion/local');
const requested = (process.env.PLANE_QA_BROWSERS ?? 'chrome,webkit').split(',');
const caseFilter = process.env.PLANE_QA_CASE;
const { validateState } = await tsImport('../packages/engine/src/index.ts', import.meta.url);
const scenarios = [
  { name: 'desktop-empty', width: 1440, height: 1000, occupancy: 'empty', zoom: 100 },
  { name: 'desktop-single', width: 1440, height: 1000, occupancy: 'single', zoom: 100 },
  { name: 'desktop-crowded', width: 1440, height: 1000, occupancy: 'crowded', zoom: 100 },
  { name: 'mobile-single', width: 390, height: 844, occupancy: 'single', zoom: 100 },
  { name: 'mobile-crowded-zoom200', width: 390, height: 844, occupancy: 'crowded', zoom: 200 },
  { name: 'small-mobile-single', width: 320, height: 740, occupancy: 'single', zoom: 100 },
  { name: 'landscape-crowded', width: 844, height: 390, occupancy: 'crowded', zoom: 100 },
];
const engines = [
  ['chrome', chromium, { channel: 'chrome' }],
  ['webkit', webkit, {}],
];
const results = {
  startedAt: new Date().toISOString(),
  url: '',
  environment: 'Headless Chrome and WebKit; mobile viewport/touch input is emulated.',
  visualReviewRequired:
    'Inspect plane crops and board frames for full silhouette, clipping, text and pawn overlap.',
  asset: null,
  checks: [],
  screenshots: [],
  errors: [],
  failures: [],
};
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.PLANE_QA_URL, 4197);
results.url = app.url;
const write = () =>
  fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n');

function fixtureFor(occupancy) {
  const fixture = createPlayerFixture('friends');
  const state = fixture.save.state;
  const travel = state.config.board.find((tile) => tile.type === 'travel');
  assert(travel, 'The board retains its travel tile');
  // Keep every pawn away for the unobstructed silhouette. Single and crowded saves
  // explicitly exercise foreground occlusion at the actual travel destination.
  for (const [index, player] of state.players.entries())
    player.position = occupancy === 'crowded' ? travel.id : (travel.id + 4 + index * 5) % 32;
  if (occupancy === 'single') state.players[state.currentPlayer].position = travel.id;
  assert.deepEqual(validateState(state), [], `${occupancy}: valid current save`);
  return { fixture, travel };
}

async function inspectAsset() {
  const url = new URL('textures/travel-plane-v1.webp', app.url.replace(/\/$/, '') + '/').href;
  const response = await fetch(url);
  assert(response.ok, 'The new plane texture is publicly fetchable');
  const bytes = Buffer.from(await response.arrayBuffer());
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  let opaque = 0;
  let transparent = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha === 0) transparent++;
      if (alpha < 32) continue;
      opaque++;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const box = { left, top, width: right - left + 1, height: bottom - top + 1 };
  assert(
    transparent > info.width * info.height * 0.1,
    'Texture has a substantial transparent background',
  );
  assert(box.width > info.width * 0.55, 'Plane fills useful texture width');
  assert(box.height > info.height * 0.4, 'Plane fills useful texture height');
  assert(
    left > 0 && top > 0 && right < info.width - 1 && bottom < info.height - 1,
    'Source silhouette is not cut off at texture edges',
  );
  results.asset = {
    url,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: info.width,
    height: info.height,
    alphaBounds: box,
    occupiedFraction: opaque / (info.width * info.height),
    transparentFraction: transparent / (info.width * info.height),
  };
}

async function capture(page, name, clip) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(out, filename), animations: 'disabled', clip });
  results.screenshots.push(filename);
}

async function geometry(page, id) {
  return page.evaluate((tileId) => {
    const label = document.querySelector(`[data-tile-label="${tileId}"][data-label-kind="name"]`);
    const box = label?.getBoundingClientRect();
    return {
      camera: document.querySelector('.board-shell')?.getAttribute('data-camera'),
      tiles: document.querySelectorAll('.board-hit-polygons [role="button"]').length,
      names: document.querySelectorAll('[data-label-kind="name"]').length,
      travelName: label?.textContent,
      label: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
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
      contextLossEvents: window.planeQaContextLosses,
      contexts: [
        ...document.querySelectorAll('.board-canvas canvas, .festival-foreground-layer'),
      ].map((canvas) => {
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        return { width: canvas.width, height: canvas.height, lost: !gl || gl.isContextLost() };
      }),
    };
  }, id);
}

async function capturePlane(page, name, travel, width, height) {
  const tile = page.getByRole('button', { name: `Voir ${travel.name}`, exact: true });
  const box = await tile.boundingBox();
  assert(box, 'Travel retains its projected tile');
  // Include the full illustrated sprite above the tile plus adjacent names and
  // pawn lane. A tightly clipped DOM label alone hid the old edge-on mesh bug.
  const left = Math.max(0, Math.floor(box.x - box.width * 0.75));
  const top = Math.max(0, Math.floor(box.y - box.height * 1.8));
  const right = Math.min(width, Math.ceil(box.x + box.width * 1.75));
  const bottom = Math.min(height, Math.ceil(box.y + box.height * 1.5));
  assert(right > left && bottom > top, 'Travel plane has a visible crop');
  await capture(page, `${name}-plane`, {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
  return box;
}

async function run(browser, browserName, scenario) {
  const { name: caseName, width, height, occupancy, zoom } = scenario;
  const name = `${browserName}-${caseName}-${width}x${height}`;
  const mobile = width < 1000;
  const { fixture, travel } = fixtureFor(occupancy);
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'fr-FR',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const textureRequests = [];
  page.on('response', (response) => {
    if (/\/textures\/travel-(plane|airport)/.test(response.url()))
      textureRequests.push({ url: response.url(), status: response.status() });
  });
  page.on('pageerror', (error) => results.errors.push({ name, message: error.message }));
  try {
    await context.addInitScript(
      ({ save, zoomPercent }) => {
        localStorage.clear();
        localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
        localStorage.setItem('money-tour.language.v1', 'fr');
        localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, sound: false }));
        localStorage.setItem(
          'money-tour.comfort',
          JSON.stringify({ largeText: false, pace: 'normal', boardZoom: zoomPercent }),
        );
        window.planeQaContextLosses = 0;
        document.addEventListener('webglcontextlost', () => window.planeQaContextLosses++, true);
      },
      { save: fixture.save, zoomPercent: zoom },
    );
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
    if (mobile) {
      // Pause intentionally forces the global camera; resume before exercising follow.
      await page.getByRole('button', { name: 'Reprendre', exact: true }).click();
      await page.getByRole('button', { name: 'Suivre mon pion', exact: true }).click();
      await page.locator('.turn-banner').waitFor({ state: 'hidden' });
      await page.waitForFunction(
        () => document.querySelector('.board-shell')?.getAttribute('data-camera') === 'follow',
      );
    }
    await page.waitForTimeout(500);
    const board = await geometry(page, travel.id);
    assert.equal(board.tiles, 32, 'Every board tile retains its accessible button');
    assert.equal(board.names, 31, 'Every printed name remains present');
    assert.equal(board.travelName, 'Voyage');
    assert(board.labelInViewport, 'Voyage name is visible in the screenshot');
    assert(!board.overflow, 'No horizontal document overflow');
    assert.equal(board.contextLossEvents, 0, 'No WebGL context-loss event');
    assert(
      board.contexts.length > 0 &&
        board.contexts.every((gl) => gl.width > 0 && gl.height > 0 && !gl.lost),
      'Real board contexts stay healthy',
    );
    assert(
      textureRequests.some(
        (entry) => /travel-plane-v1\.webp/.test(entry.url) && entry.status === 200,
      ),
      'Scene requests new plane texture',
    );
    assert(
      !textureRequests.some((entry) => /travel-airport/.test(entry.url)),
      'Scene no longer requests airport texture',
    );
    await capture(page, `${name}-${mobile ? 'follow' : 'board'}-zoom${zoom}`);
    const tileBox = await capturePlane(page, name, travel, width, height);
    if (mobile) {
      assert.equal(board.camera, 'follow', 'Mobile is using ordinary player follow view');
      await page.getByRole('button', { name: 'Vue globale', exact: true }).click();
      await page.waitForFunction(
        () => document.querySelector('.board-shell')?.getAttribute('data-camera') === 'overview',
      );
      await page.waitForTimeout(250);
      await capture(page, `${name}-overview`);
    }
    const after = await geometry(page, travel.id);
    assert.equal(after.contextLossEvents, 0);
    assert.equal(
      results.errors.filter((error) => error.name === name).length,
      0,
      'No runtime error',
    );
    results.checks.push({ name, passed: true, occupancy, zoom, board, tileBox, textureRequests });
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
  await inspectAsset();
  for (const [name, engine, options] of engines) {
    if (!requested.includes(name)) continue;
    const browser = await engine.launch({ headless: true, ...options });
    try {
      for (const scenario of scenarios) {
        if (caseFilter && !scenario.name.includes(caseFilter)) continue;
        await run(browser, name, scenario);
      }
    } finally {
      await browser.close();
    }
  }
  assert(results.checks.length > 0, 'At least one selected browser case ran');
  assert.equal(results.failures.length, 0, 'Every plane browser case passes');
  assert.equal(results.errors.length, 0, 'No page errors');
} finally {
  results.finishedAt = new Date().toISOString();
  await write();
  app.close();
}
