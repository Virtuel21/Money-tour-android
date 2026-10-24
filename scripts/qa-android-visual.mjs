/** Android visual acceptance using real Chromium/WebGL and emulated touch.
 * A minimal Capacitor bridge selects the Android UI; native OS/plugin behavior is
 * verified separately. ANDROID_VISUAL_URL may target the bundled production build.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { qaServer } from './qa-server.mjs';
import { createActionFixture, actionFixtureNames } from './qa-action-fixtures.mjs';
import { createPlayerFixture } from './qa-player-fixtures.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.ANDROID_VISUAL_OUT ?? 'artifacts/android-qa/visual');
await fs.mkdir(out, { recursive: true });
const server = await qaServer(process.env.ANDROID_VISUAL_URL, 4208);
const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium';
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const report = {
  startedAt: new Date().toISOString(),
  url: server.url,
  browser: browser.version(),
  environment:
    'Desktop Chromium, software WebGL, emulated Android touch viewport and Capacitor platform bridge. Decision snapshots hold performance.now to isolate layout from timeout. Native system bars, keyboard and plugins require APK verification.',
  screens: [],
  captures: [],
  checks: [],
  accessibility: [],
  failures: [],
  pageErrors: [],
};
const write = () => fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
const screens = (process.env.ANDROID_VISUAL_SCREENS ?? '360x640,393x851,412x915,851x393')
  .split(',')
  .map((size) => size.split('x').map(Number));
const cases = process.env.ANDROID_VISUAL_CASES?.split(',');
if (process.env.ANDROID_VISUAL_APPEND) {
  const previous = JSON.parse(await fs.readFile(path.join(out, 'results.json'), 'utf8'));
  for (const key of ['screens', 'captures', 'checks', 'accessibility', 'failures', 'pageErrors'])
    report[key] = previous[key];
}
async function check(name, fn) {
  if (cases && !cases.some((selection) => name.includes(selection))) return;
  report.checks = report.checks.filter((entry) => entry.name !== name);
  report.failures = report.failures.filter((entry) => entry.name !== name);
  try {
    await fn();
    report.checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.failures.push({ name, message: error.message, stack: error.stack });
    console.log(`FAIL ${name}: ${error.message}`);
  }
  await write();
}
async function contextFor(width, height, save) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
    reducedMotion: 'reduce',
  });
  await context.addInitScript((saved) => {
    try {
      localStorage.setItem('money-tour.language.v1', 'fr');
      localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, effects: false }));
      if (saved) localStorage.setItem('money-tour.local.v17', JSON.stringify(saved));
    } catch {
      /* Browser-internal empty frames may not expose storage. */
    }
    // Select the real native layout without representing this as an OS/plugin test.
    window.androidBridge = {};
    window.Capacitor = {
      PluginHeaders: [
        {
          name: 'App',
          methods: [
            { name: 'addListener', rtype: 'callback' },
            { name: 'removeListener', rtype: 'promise' },
            { name: 'getLaunchUrl', rtype: 'promise' },
            { name: 'getState', rtype: 'promise' },
            { name: 'minimizeApp', rtype: 'promise' },
          ],
        },
      ],
      nativeCallback: () => 'visual-qa',
      nativePromise: (_plugin, method) =>
        Promise.resolve(method === 'getState' ? { isActive: true } : {}),
    };
  }, save);
  context.on('page', (page) => {
    page.setDefaultTimeout(20000);
    page.on('pageerror', (error) =>
      report.pageErrors.push({ width, height, error: error.message }),
    );
  });
  return context;
}
async function capture(page, name, { fullPage = false, audit = false, targets = false } = {}) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const geometry = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
    const body = dialog?.querySelector('.modal-body, .player-details-body');
    const rect = (el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    };
    const controls = [
      ...(dialog ?? document).querySelectorAll('button, input, select, summary, a[href]'),
    ].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && !el.disabled && !el.closest('[inert]');
    });
    return {
      width: innerWidth,
      height: innerHeight,
      platform: document.documentElement.dataset.platform,
      viewport: document.querySelector('meta[name="viewport"]')?.content,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      bodyOverflow: !!body && body.scrollWidth > body.clientWidth + 1,
      dialog: dialog ? rect(dialog) : null,
      controls: controls.map((el) => {
        const target = el.type === 'checkbox' ? el.closest('label') : el;
        return {
          label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 60),
          ...rect(target),
        };
      }),
    };
  });
  const filename = `${name}-${geometry.width}x${geometry.height}.png`;
  await page.screenshot({ path: path.join(out, filename), fullPage, animations: 'disabled' });
  report.captures = report.captures.filter((entry) => entry.filename !== filename);
  report.captures.push({ name, filename, ...geometry });
  assert.equal(geometry.platform, 'android', 'Android layout is selected');
  assert(geometry.viewport.includes('viewport-fit=contain'), 'Native inset viewport is selected');
  assert(!geometry.overflowX, 'No horizontal document overflow');
  assert(!geometry.bodyOverflow, 'No horizontal dialog body overflow');
  if (geometry.dialog) {
    assert(geometry.dialog.x >= -0.5 && geometry.dialog.y >= -0.5, 'Dialog begins within viewport');
    assert(
      geometry.dialog.x + geometry.dialog.width <= geometry.width + 0.5,
      'Dialog fits horizontally',
    );
    assert(geometry.dialog.height <= geometry.height + 0.5, 'Dialog fits vertically');
  }
  if (targets) {
    const small = geometry.controls.filter(
      (control) => control.width < 43.5 || control.height < 43.5,
    );
    assert.deepEqual(small, [], `Touch controls are at least 44px: ${JSON.stringify(small)}`);
  }
  if (audit) {
    let axe = new AxeBuilder({ page }).withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21aa',
      'wcag22aa',
      'best-practice',
    ]);
    if (await page.locator('dialog[open]').count()) axe = axe.include('dialog[open]');
    const results = await axe.analyze();
    const violations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    }));
    report.accessibility.push({
      name,
      width: geometry.width,
      height: geometry.height,
      violations,
      passes: results.passes.length,
    });
    assert.deepEqual(
      violations,
      [],
      `Automated accessibility violations: ${JSON.stringify(violations)}`,
    );
  }
}
async function closeModal(page) {
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'hidden' });
}
async function readyBoard(page) {
  await page.locator('.board-canvas canvas').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector('.board-hit-polygons polygon')?.getAttribute('points')?.length > 10,
  );
  await page.waitForFunction(() => !document.querySelector('.turn-banner'));
  assert.equal(await page.locator('.board-fallback').count(), 0, 'Real WebGL board loaded');
}
async function resume(page, waitForBoard = true) {
  await page.goto(server.url);
  await page.getByRole('button', { name: /Reprendre ma partie$/ }).tap();
  if (waitForBoard) await readyBoard(page);
}
async function holdSnapshotClock(page) {
  await page.evaluate(() => {
    const now = performance.now();
    performance.now = () => now;
  });
}

try {
  for (const [width, height] of screens) {
    const size = `${width}x${height}`;
    if (!report.screens.some((screen) => screen.width === width && screen.height === height))
      report.screens.push({ width, height });
    await check(`home-settings-invitation-${size}`, async () => {
      const context = await contextFor(width, height);
      const page = await context.newPage();
      try {
        await page.goto(server.url);
        await page.getByRole('button', { name: /Créer un salon en ligne/ }).waitFor();
        assert.equal(
          await page.locator('.hero-map').count(),
          0,
          'Native landing does not initialize decorative WebGL',
        );
        await capture(page, 'home', { fullPage: true, audit: width === 393, targets: true });
        await page.getByRole('button', { name: 'Réglages', exact: true }).tap();
        await page.locator('dialog[open]').waitFor();
        await capture(page, 'settings', { audit: width === 393, targets: true });
        await page
          .locator('dialog[open] .modal-body')
          .evaluate((el) => (el.scrollTop = el.scrollHeight));
        await capture(page, 'settings-bottom', { targets: true });
        await closeModal(page);
        await page.getByRole('button', { name: 'Rejoindre un salon', exact: true }).tap();
        await page.locator('dialog[open]').waitFor();
        await capture(page, 'invitation', { audit: width === 393, targets: true });
        await page.getByLabel('Votre nom', { exact: true }).fill('Voyageur Android');
        await page.getByLabel('Lien d’invitation', { exact: true }).fill('invitation invalide');
        await page.getByRole('button', { name: 'Rejoindre le salon', exact: true }).tap();
        await page.getByRole('alert').waitFor();
        await capture(page, 'invitation-error', { targets: true });
        // A resized WebView represents available space with the soft keyboard open.
        await page.setViewportSize({ width, height: Math.max(250, height - 280) });
        await page.getByLabel('Lien d’invitation', { exact: true }).focus();
        await capture(page, 'keyboard-reduced-space', { targets: true });
        const close = page.locator('dialog[open] .modal-heading button');
        await close.tap();
        await page.locator('dialog[open]').waitFor({ state: 'hidden' });
      } finally {
        await context.close();
      }
    });
    await check(`tutorial-${size}`, async () => {
      const context = await contextFor(width, height);
      const page = await context.newPage();
      try {
        await page.goto(server.url);
        await page.getByRole('button', { name: /Comment jouer/ }).tap();
        await page
          .getByRole('button', { name: 'Démarrer le tutoriel interactif', exact: true })
          .tap();
        await page.getByRole('dialog', { name: 'Partie guidée', exact: true }).waitFor();
        await readyBoard(page);
        await capture(page, 'tutorial-start', { targets: true });
        await page.getByRole('button', { name: 'Toutes les leçons (27)', exact: true }).tap();
        const lessons = await page
          .getByLabel('Choisir une leçon', { exact: true })
          .locator('option')
          .evaluateAll((entries) =>
            entries.map((entry) => ({ value: entry.value, title: entry.textContent })),
          );
        for (const lesson of width === 393
          ? lessons
          : [lessons[4], lessons[7], lessons[14], lessons.at(-1)]) {
          await page.getByLabel('Choisir une leçon', { exact: true }).selectOption(lesson.value);
          await page.waitForTimeout(100);
          await capture(page, `tutorial-lesson-${lesson.value}`, { targets: true });
        }
        await page.getByRole('button', { name: 'Quitter le tutoriel', exact: true }).tap();
        await page.getByRole('dialog', { name: 'Comment jouer', exact: true }).waitFor();
      } finally {
        await context.close();
      }
    });
    await check(`profile-reactions-${size}`, async () => {
      const context = await contextFor(width, height, createPlayerFixture('two').save);
      const page = await context.newPage();
      try {
        await resume(page, false);
        await holdSnapshotClock(page);
        await page.getByRole('button', { name: 'Voir le profil de Sacha', exact: true }).tap();
        await page.locator('.player-details-dialog[open]').waitFor();
        const react = page.getByRole('button', { name: 'Réagir à Sacha', exact: true });
        assert(await react.isEnabled(), 'Reactions are reachable from a player profile');
        await capture(page, 'profile-reaction-action', { targets: true, audit: width === 393 });
        await react.tap();
        await page.locator('.player-details-dialog').waitFor({ state: 'hidden' });
        await page.locator('.taunt-picker').waitFor();
        await capture(page, 'profile-reaction-picker', { targets: true });
        await page.getByRole('button', { name: 'Merci pour le loyer !', exact: true }).tap();
        await page.locator('.taunt-picker').waitFor({ state: 'hidden' });
      } finally {
        await context.close();
      }
    });
    for (const name of actionFixtureNames) {
      await check(`decision-${name}-${size}`, async () => {
        const context = await contextFor(width, height, createActionFixture(name).save);
        const page = await context.newPage();
        try {
          await resume(page, ['insurance', 'travel', 'festival'].includes(name));
          await holdSnapshotClock(page);
          // Decision modals open after the entry presentation; insurance is passive.
          if (!['insurance', 'travel', 'festival'].includes(name))
            await page
              .locator('dialog[open]')
              .waitFor({ timeout: 12000 })
              .catch(() => {});
          await capture(page, `decision-${name}`, {
            audit: width === 393 && ['purchase', 'debt', 'duel', 'casino'].includes(name),
            targets: !!(await page.locator('dialog[open]').count()),
          });
          if (await page.locator('.modal[open] .modal-body').count()) {
            await page
              .locator('.modal[open] .modal-body')
              .evaluate((el) => (el.scrollTop = el.scrollHeight));
            await capture(page, `decision-${name}-bottom`, { targets: true });
          }
        } finally {
          await context.close();
        }
      });
    }
    await check(`board-touch-and-settings-${size}`, async () => {
      const fixture = createPlayerFixture('two');
      fixture.save.state.currentPlayer = 0;
      const context = await contextFor(width, height, fixture.save);
      const page = await context.newPage();
      try {
        await resume(page);
        // Pause isolates camera/layout acceptance from the automatic turn timeout.
        await page.getByRole('button', { name: 'Pause', exact: true }).tap();
        await page.getByRole('button', { name: 'Réglages de la partie', exact: true }).tap();
        await page.locator('dialog[open]').waitFor();
        await page.getByRole('checkbox', { name: /Textes agrandis/ }).check();
        await capture(page, 'game-settings-large-text', { targets: true });
        const zoom = page.getByRole('slider', { name: /Zoom du plateau/ });
        await zoom.fill('200');
        await page.getByRole('button', { name: 'Terminé', exact: true }).tap();
        await page.getByRole('button', { name: 'Suivre mon pion', exact: true }).tap();
        await page.waitForTimeout(300);
        await capture(page, 'board-follow-zoom-200');
        // Real touch events exercise pinch + drag on the rendered board.
        const start = await page.evaluate(() => {
          for (let y = innerHeight * 0.3; y < innerHeight * 0.75; y += 15)
            for (let x = innerWidth * 0.25; x < innerWidth * 0.7; x += 15)
              if (document.elementFromPoint(x, y)?.closest('.board-shell')) return { x, y };
          return null;
        });
        assert(start, 'An exposed board region receives touch');
        const before = await page
          .locator('.board-hit-polygons polygon')
          .first()
          .getAttribute('points');
        const session = await context.newCDPSession(page);
        for (let frame = 0; frame <= 5; frame++) {
          await session.send('Input.dispatchTouchEvent', {
            type: frame === 0 ? 'touchStart' : 'touchMove',
            touchPoints: [
              {
                id: 1,
                x: start.x + frame * 10,
                y: start.y + frame * 2,
                radiusX: 4,
                radiusY: 4,
                force: 1,
              },
            ],
          });
          await page.waitForTimeout(40);
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(300);
        const after = await page
          .locator('.board-hit-polygons polygon')
          .first()
          .getAttribute('points');
        assert.notEqual(before, after, 'Touch drag moves the board projections');
        assert.equal(
          await page.locator('dialog[open]').count(),
          0,
          'Dragging does not open a tile',
        );
        await capture(page, 'board-touch-pan');
        await page.getByRole('button', { name: 'Recentrer mon pion', exact: true }).tap();
        const zoomBefore = await page.evaluate(
          () => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom,
        );
        for (let frame = 0; frame <= 5; frame++) {
          await session.send('Input.dispatchTouchEvent', {
            type: frame === 0 ? 'touchStart' : 'touchMove',
            touchPoints: [
              { id: 1, x: start.x - 20 - frame * 5, y: start.y, radiusX: 4, radiusY: 4, force: 1 },
              { id: 2, x: start.x + 20 + frame * 5, y: start.y, radiusX: 4, radiusY: 4, force: 1 },
            ],
          });
          await page.waitForTimeout(40);
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
        const zoomAfter = await page.evaluate(
          () => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom,
        );
        assert(
          zoomAfter > zoomBefore,
          `Pinch increases saved board zoom (${zoomBefore} → ${zoomAfter})`,
        );
        await capture(page, 'board-touch-pinch');
      } finally {
        await context.close();
      }
    });
  }
  assert.deepEqual(report.pageErrors, [], 'No uncaught application errors');
  assert.deepEqual(report.failures, [], 'All Android visual checks pass');
} finally {
  report.completedAt = new Date().toISOString();
  await write();
  await browser.close();
  server.close();
}
