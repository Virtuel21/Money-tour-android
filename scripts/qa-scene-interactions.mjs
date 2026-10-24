/** Browser interaction acceptance for the profile/archipelago scene.
 * SCENE_QA_URL / SCENE_QA_OUT can target a local preview or public deployment.
 * Touch gestures below use Chromium's browser input protocol, not a physical phone.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createPlayerFixture } from './qa-player-fixtures.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const url = process.env.SCENE_QA_URL ?? 'http://127.0.0.1:5173';
const out = path.resolve(process.env.SCENE_QA_OUT ?? '../../outputs/recette-profils/interactions');
const results = {
  startedAt: new Date().toISOString(),
  url,
  environment: 'Headless Chromium; mobile viewport and touch input are emulated.',
  checks: [],
  screenshots: [],
  errors: [],
  failures: [],
};
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const write = () => fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
async function capture(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(out, filename), animations: 'disabled' });
  results.screenshots.push({ name, filename });
}
async function check(name, run) {
  try {
    const evidence = await run();
    results.checks.push({ name, passed: true, evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.failures.push({ name, message: error.message, stack: error.stack });
    console.log(`FAIL ${name}: ${error.message}`);
    throw error;
  } finally {
    await write();
  }
}
async function newPage(width, height, fixture) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 1000,
    hasTouch: width < 1000,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) =>
    results.errors.push({ viewport: [width, height], message: error.message }),
  );
  await page.addInitScript((save) => {
    localStorage.clear();
    if (save) localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
    localStorage.setItem('money-tour.language.v1', 'fr');
    localStorage.setItem(
      'money-tour.comfort',
      JSON.stringify({ largeText: false, pace: 'normal', boardZoom: 100 }),
    );
    localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, sound: false }));
  }, fixture?.save);
  await page.goto(url);
  if (fixture)
    await page.getByRole('button', { name: /Reprendre ma partie$/ }).click({ timeout: 45000 });
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.locator('.board-canvas canvas').waitFor({ state: 'visible', timeout: 60000 });
  // The lazy board component can attach its canvas before textures/models finish.
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  if (fixture)
    await page.waitForFunction(
      () =>
        document.querySelector('.board-hit-polygons polygon')?.getAttribute('points')?.length > 10,
    );
  return { context, page };
}
async function closeDialog(page) {
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'hidden' });
}
async function projections(page) {
  return page.evaluate(() => {
    const points = [...document.querySelectorAll('.board-hit-polygons polygon')]
      .flatMap((polygon) => polygon.getAttribute('points').trim().split(/\s+/))
      .map((point) => point.split(',').map(Number));
    return {
      minX: Math.min(...points.map(([x]) => x)),
      maxX: Math.max(...points.map(([x]) => x)),
      minY: Math.min(...points.map(([, y]) => y)),
      maxY: Math.max(...points.map(([, y]) => y)),
    };
  });
}
async function assertFullBoard(page) {
  await page.waitForTimeout(400);
  const bounds = await projections(page);
  assert(
    bounds.minX >= -1 && bounds.maxX <= 101 && bounds.minY >= -1 && bounds.maxY <= 101,
    JSON.stringify(bounds),
  );
  return bounds;
}
async function zoom(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom);
}
async function touchGesture(page, frames) {
  const session = await page.context().newCDPSession(page);
  try {
    for (const [index, points] of frames.entries()) {
      await session.send('Input.dispatchTouchEvent', {
        type: index === 0 ? 'touchStart' : points.length ? 'touchMove' : 'touchEnd',
        touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })),
      });
      await page.waitForTimeout(60);
    }
  } finally {
    await session.detach();
  }
}

try {
  const home = await newPage(1536, 1024);
  await check('home-3d-preview', async () => {
    assert.equal(await home.page.locator('.board-demo .board-canvas canvas').count(), 1);
    assert.equal(await home.page.locator('.archipelago-backdrop').count(), 0);
    assert.equal(await home.page.locator('.play-scene').count(), 0);
    await capture(home.page, 'home-desktop');
    return { realWebglPreview: true, gameBackdropRestrictedToGame: true };
  });
  await home.context.close();

  const mobile = await newPage(390, 844, createPlayerFixture('friends'));
  const { page } = mobile;
  try {
    await check('mobile-initial-board-and-follow-toggle', async () => {
      const full = await assertFullBoard(page);
      await capture(page, 'mobile-full-board');
      await page.getByRole('button', { name: 'Suivre mon pion', exact: true }).tap();
      await page.getByRole('button', { name: 'Vue globale', exact: true }).waitFor();
      await page.waitForTimeout(400);
      const followed = await projections(page);
      assert(
        followed.maxX - followed.minX > (full.maxX - full.minX) * 1.5,
        'Following brings the active pawn closer',
      );
      await capture(page, 'mobile-follow-pawn');
      await page.getByRole('button', { name: 'Vue globale', exact: true }).tap();
      await assertFullBoard(page);
      await page.getByRole('button', { name: 'Pause', exact: true }).tap();
      return { full, followed };
    });
    await check('mobile-tap-profile-locate-and-clear', async () => {
      await page.getByRole('button', { name: 'Voir le profil de Léa', exact: true }).tap();
      const details = page.locator('.player-details-dialog');
      await details
        .getByRole('button', { name: 'Repérer ses biens sur le plateau', exact: true })
        .tap();
      await details.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Tout afficher', exact: true }).waitFor();
      assert.match(await page.locator('.roll-status').innerText(), /Léa.*1 propriété/);
      await capture(page, 'mobile-property-filter');
      await page.getByRole('button', { name: 'Tout afficher', exact: true }).tap();
      await page.getByRole('button', { name: 'Suivre mon pion', exact: true }).waitFor();
      await assertFullBoard(page);
      return { profileTapped: true, propertyFilterReachedBoard: true, filterCleared: true };
    });
    await check('mobile-profile-property-opens-real-inspection', async () => {
      await page.getByRole('button', { name: 'Voir le profil de Léa', exact: true }).tap();
      const property = page.locator('.player-details-dialog .mini-property').first();
      const title = await property.locator('b').innerText();
      await property.tap();
      await page.locator('.player-details-dialog').waitFor({ state: 'hidden' });
      await page.getByRole('dialog', { name: title, exact: true }).waitFor();
      assert.equal(
        await page.locator('.action-card-dialog[open]').count(),
        0,
        'Property inspection keeps its ordinary property dialog',
      );
      await capture(page, 'mobile-property-inspection');
      await closeDialog(page);
      return { inspectedProperty: title };
    });
    await check('mobile-profile-bonus-opens-action-card', async () => {
      await page.getByRole('button', { name: 'Voir le profil de Léa', exact: true }).tap();
      const bonus = page.locator('.player-details-dialog .bonus-tokens button').first();
      const title = (await bonus.innerText()).trim();
      await bonus.tap();
      const card = page.locator('.action-card-dialog[open]');
      await card.waitFor();
      assert.match(
        await card.locator('h2').innerText(),
        new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
      await capture(page, 'mobile-bonus-card');
      await card.getByRole('button', { name: 'Compris', exact: true }).tap();
      await card.waitFor({ state: 'hidden' });
      return { bonus: title, actionCardOpenedAndClosed: true };
    });
    await check('mobile-keyboard-profile-open-close', async () => {
      const opener = page.getByRole('button', { name: 'Voir le profil de Noa', exact: true });
      await opener.focus();
      await page.keyboard.press('Enter');
      await page.locator('.player-details-dialog').waitFor();
      assert.equal(await page.locator('.player-details-dialog h2').innerText(), 'Noa');
      await closeDialog(page);
      assert(await opener.evaluate((element) => element === document.activeElement));
      return { enterOpens: true, escapeCloses: true, openerFocusRestored: true };
    });
    await check('mobile-settings-keyboard-zoom-400', async () => {
      await page.getByRole('button', { name: 'Suivre mon pion', exact: true }).tap();
      await page.getByRole('button', { name: 'Réglages de la partie', exact: true }).tap();
      const range = page.getByRole('slider', { name: 'Zoom du plateau', exact: true });
      await range.focus();
      await page.keyboard.press('End');
      assert.equal(await zoom(page), 400);
      await capture(page, 'mobile-settings-zoom-400');
      await page.getByRole('button', { name: 'Terminé', exact: true }).tap();
      await page.getByRole('button', { name: 'Reprendre', exact: true }).tap();
      await page.locator('.board-can-pan').waitFor();
      await capture(page, 'mobile-zoom-400');
      return { persistedZoom: await zoom(page), boardAllowsPan: true };
    });
    await check('mobile-two-touch-pinch-pan-and-recenter', async () => {
      const board = await page.locator('.board-viewport').boundingBox();
      const x = board.x + board.width / 2;
      const y = board.y + board.height / 2;
      await touchGesture(page, [
        [
          [x - 80, y],
          [x + 80, y],
        ],
        [
          [x - 65, y],
          [x + 65, y],
        ],
        [
          [x - 40, y],
          [x + 40, y],
        ],
        [],
      ]);
      assert.equal(await zoom(page), 200, 'Two-finger pinch updates the real stored zoom');
      await touchGesture(page, [[[x, y]], [[x + 15, y + 10]], [[x + 45, y + 25]], []]);
      const recenter = page.getByRole('button', { name: 'Recentrer mon pion', exact: true });
      await recenter.waitFor();
      assert.equal(await page.locator('dialog[open]').count(), 0, 'Pan must not activate a tile');
      await capture(page, 'mobile-panned');
      await recenter.tap();
      await page.getByRole('button', { name: 'Vue globale', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Vue globale', exact: true }).tap();
      const restored = await assertFullBoard(page);
      await page.getByRole('button', { name: 'Pause', exact: true }).tap();
      await capture(page, 'mobile-restored-overview');
      return { pinchZoom: 200, panRecognized: true, noAccidentalTile: true, restored };
    });
    await check('mobile-real-primary-roll', async () => {
      // Start the same ordinary validated save again so screenshot/render time
      // does not consume its real 30-second decision limit before this check.
      await page.reload();
      await page.getByRole('button', { name: /Reprendre ma partie$/ }).tap();
      await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
      const before = await page.evaluate(
        () => JSON.parse(localStorage.getItem('money-tour.local.v17')).state.seq,
      );
      const roll = page
        .locator('.game-sidebar .actions')
        .getByRole('button', { name: /Lancer les dés/ });
      assert(await roll.isEnabled());
      await roll.tap();
      await page.waitForFunction(
        (seq) => JSON.parse(localStorage.getItem('money-tour.local.v17')).state.seq > seq,
        before,
      );
      const after = await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('money-tour.local.v17')).state;
        return { seq: state.seq, phase: state.phase, dice: state.dice };
      });
      assert(after.dice.every((die) => die >= 1 && die <= 6));
      await capture(page, 'mobile-real-roll');
      return { beforeSeq: before, after };
    });
  } catch (error) {
    await capture(page, 'mobile-failure');
    console.log(error.stack);
  } finally {
    await mobile.context.close();
  }

  const desktop = await newPage(1536, 1024, createPlayerFixture('friends'));
  try {
    await check('desktop-real-board-and-profile-preview-click', async () => {
      const bounds = await assertFullBoard(desktop.page);
      const preview = desktop.page.locator('.player-property-preview-item').first();
      const title = await preview.locator('b').innerText();
      await preview.click();
      await desktop.page.getByRole('dialog', { name: title, exact: true }).waitFor();
      await capture(desktop.page, 'desktop-property-preview');
      await closeDialog(desktop.page);
      return { bounds, inspectedProperty: title, realWebglBoard: true };
    });
    await check('desktop-profile-bonus-click-and-keyboard-close', async () => {
      await desktop.page.locator('.player-panel-bonuses button').first().click();
      await desktop.page.locator('.action-card-dialog[open]').waitFor();
      await capture(desktop.page, 'desktop-bonus-card');
      await closeDialog(desktop.page);
      await capture(desktop.page, 'desktop-final-board');
      return { bonusOpens: true, escapeCloses: true };
    });
  } catch (error) {
    await capture(desktop.page, 'desktop-failure');
    console.log(error.stack);
  } finally {
    await desktop.context.close();
  }
} catch (error) {
  results.failures.push({ name: 'setup-or-unhandled', message: error.message, stack: error.stack });
} finally {
  await browser.close();
  results.finishedAt = new Date().toISOString();
  await write();
}
if (results.failures.length || results.errors.length) process.exitCode = 1;
console.log(
  JSON.stringify({
    checks: results.checks.length,
    failures: results.failures.length,
    errors: results.errors.length,
    out,
  }),
);
