/** Focused real-browser regressions for room cancellation and the responsive board. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createPlayerFixture } from './qa-player-fixtures.mjs';
import { qaServer } from './qa-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.BUGFIX_QA_OUT ?? '../../outputs/recette-corrections');
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.BUGFIX_QA_URL, 4192);
const browser = await chromium.launch({ headless: true });
const result = {
  url: app.url,
  browser: browser.version(),
  environment: 'Headless Chromium; mobile viewports/touch are emulated, not physical devices.',
  checks: [],
  errors: [],
  failures: [],
};
const selected = process.env.BUGFIX_QA_CASES?.split(',');
async function check(name, run) {
  if (selected && !selected.includes(name)) return;
  try {
    result.checks.push({ name, passed: true, evidence: await run() });
    console.log(`PASS ${name}`);
  } catch (error) {
    result.failures.push({ name, message: error.message, stack: error.stack });
    throw error;
  } finally {
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
  }
}
async function contextFor(width, height, fixture, boardZoom = 100) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: width < 1000,
    isMobile: width < 1000,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    ({ save, boardZoom }) => {
      // Preserve state across subsequent reloads within each case.
      if (sessionStorage.getItem('bugfix-qa-initialized')) return;
      sessionStorage.setItem('bugfix-qa-initialized', '1');
      localStorage.clear();
      if (save) localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
      localStorage.setItem('money-tour.language.v1', 'fr');
      localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, effects: false }));
      localStorage.setItem(
        'money-tour.comfort',
        JSON.stringify({ boardZoom, pace: 'normal', largeText: false }),
      );
    },
    { save: fixture?.save, boardZoom },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => result.errors.push(error.message));
  await page.goto(app.url);
  return { context, page };
}
async function readyBoard(page) {
  await page.locator('.board-canvas canvas').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector('.board-hit-polygons polygon')?.getAttribute('points')?.length > 10,
  );
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' });
}
async function locate(page) {
  await page.getByRole('button', { name: 'Voir le profil de Léa', exact: true }).click();
  await page.getByRole('button', { name: 'Repérer ses biens sur le plateau', exact: true }).click();
  await page.getByRole('button', { name: 'Tout afficher', exact: true }).waitFor();
  assert((await page.locator('.profile-highlight').count()) > 0);
}

try {
  await check('room-create-cancel-recreate-escape-reload', async () => {
    const { context, page } = await contextFor(1280, 900);
    try {
      const create = page.getByRole('button', { name: 'Créer un salon en ligne', exact: true });
      const local = page.getByRole('button', { name: 'Jouer sur cet appareil', exact: true });
      async function createRoom() {
        await create.click();
        const dialog = page.locator('.online-modal');
        // Home creation is automatic; wait for its real invitation and session.
        const link = dialog.locator('.invite-code input');
        await link.waitFor({ state: 'visible', timeout: 45000 });
        const value = await link.inputValue();
        assert.match(value, /#room=[a-f0-9]{32}/);
        return value;
      }
      async function assertCancelled() {
        await page.locator('.online-modal').waitFor({ state: 'hidden' });
        assert.equal(new URL(page.url()).hash, '');
        assert.equal(await create.isEnabled(), true);
        assert.equal(await local.isEnabled(), true);
        assert.equal(
          await page.evaluate(() => localStorage.getItem('money-tour.online-resume.v1')),
          null,
        );
      }
      const first = await createRoom();
      await page.getByRole('button', { name: 'Fermer le salon', exact: true }).click();
      await assertCancelled();
      const second = await createRoom();
      assert.notEqual(new URL(second).hash, new URL(first).hash);
      await page.keyboard.press('Escape');
      await assertCancelled();
      await page.goto(first);
      await page.reload();
      await page.locator('.online-modal[open]').waitFor();
      await page.keyboard.press('Escape');
      await assertCancelled();
      await page.reload();
      await create.waitFor();
      assert.equal(await page.locator('.online-modal[open]').count(), 0);
      assert.equal(new URL(page.url()).hash, '');
      await local.click();
      await readyBoard(page);
      assert.equal(await page.locator('.play-scene').count(), 1);
      await capture(page, 'local-game-after-room-cancel');
      return { distinctRooms: true, close: true, escape: true, staleInvitation: true, solo: true };
    } finally {
      await context.close();
    }
  });

  for (const [width, height] of [
    [3418, 1279],
    [5120, 1440],
    [1536, 1024],
    [390, 844],
    [844, 390],
  ]) {
    await check(`board-layout-and-dismiss-${width}x${height}`, async () => {
      const { context, page } = await contextFor(width, height, createPlayerFixture('friends'));
      try {
        await page.getByRole('button', { name: /Reprendre ma partie$/ }).click();
        await readyBoard(page);
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        const geometry = await page.evaluate(() => {
          const box = (selector) => {
            const { x, y, width, height } = document
              .querySelector(selector)
              .getBoundingClientRect();
            return { x, y, width, height };
          };
          return {
            controls: box('.board-controls'),
            sidebar: box('.game-sidebar'),
            info: box('.shared-game-info'),
            board: box('.board-viewport'),
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        for (const target of ['controls', 'sidebar', 'info']) {
          assert(geometry[target].width <= 1121, `${target}: ${geometry[target].width}px`);
          if (width >= 1280 || height > width)
            assert(Math.abs(geometry[target].x + geometry[target].width / 2 - width / 2) < 2);
          else {
            // Mobile landscape intentionally keeps its action panel to the right of the board.
            assert(geometry[target].x >= 0);
            assert(geometry[target].x + geometry[target].width <= width + 1);
          }
        }
        assert.equal(geometry.overflow, false);
        await capture(page, `board-${width}x${height}`);
        await locate(page);
        await page.locator('.board-viewport').click({ position: { x: 20, y: 20 } });
        assert.equal(await page.locator('.profile-highlight').count(), 0);
        assert.equal(await page.locator('dialog[open]').count(), 0);
        await locate(page);
        const control = page.getByRole('button', { name: 'Journal des actions', exact: true });
        const snapshot = () =>
          page.evaluate(() => {
            const { phase, players, dice, currentPlayer, turn } = JSON.parse(
              localStorage.getItem('money-tour.local.v17'),
            ).state;
            return JSON.stringify({ phase, players, dice, currentPlayer, turn });
          });
        const before = await snapshot();
        await control.click();
        assert.equal(await page.locator('.profile-highlight').count(), 0);
        assert.equal(await page.locator('dialog[open]').count(), 0);
        assert.equal(
          await snapshot(),
          before,
          'A dismiss click must not also activate a game control',
        );
        await locate(page);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.profile-highlight').count(), 0);
        return { ...geometry, boardClick: true, actionClickConsumed: true, escape: true };
      } finally {
        await context.close();
      }
    });
  }

  for (const zoom of [100, 200, 400]) {
    await check(`mobile-zoom-${zoom}`, async () => {
      const { context, page } = await contextFor(390, 844, createPlayerFixture('friends'), zoom);
      try {
        await page.getByRole('button', { name: /Reprendre ma partie$/ }).click();
        await readyBoard(page);
        await page.getByRole('button', { name: 'Suivre mon pion', exact: true }).click();
        await page.waitForTimeout(700);
        await capture(page, `mobile-zoom-${zoom}`);
        const composition = await page.evaluate(() => ({
          backdrop: getComputedStyle(document.querySelector('.archipelago-backdrop')).zIndex,
          viewport: getComputedStyle(document.querySelector('.board-viewport')).zIndex,
          zoom: JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom,
        }));
        assert.equal(composition.zoom, zoom);
        assert.equal(await page.locator('.board-fallback').count(), 0);
        return composition;
      } finally {
        await context.close();
      }
    });
  }
  assert.deepEqual(result.errors, []);
} finally {
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
  await browser.close();
  app.close();
}
