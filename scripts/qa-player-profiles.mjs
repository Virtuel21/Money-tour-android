/** Profile/archipelago acceptance against the real application and validated current saves.
 * PROFILE_QA_URL selects an existing preview/public deployment; otherwise starts Vite.
 * PROFILE_QA_PROFILE=public uses the shorter deployment smoke matrix.
 * PROFILE_QA_CASES is a comma-separated case-id filter; PROFILE_QA_AXE=0 skips axe.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { qaServer } from './qa-server.mjs';
import { createPlayerFixture } from './qa-player-fixtures.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.PROFILE_QA_OUT ?? '../../outputs/recette-profils');
const results = {
  startedAt: new Date().toISOString(),
  url: '',
  environment: 'Headless Chromium; touch/viewport emulation is not a physical phone test.',
  checks: [],
  frames: [],
  accessibility: [],
  errors: [],
  failures: [],
};
const matrix = [
  ['desktop-reference', 'friends', 'fr', 1536, 1024],
  ['desktop-wide', 'friends', 'fr', 1920, 1080],
  ['desktop-laptop', 'friends', 'fr', 1280, 800],
  ['desktop-short', 'stress', 'en', 1366, 768],
  ['tablet-landscape', 'friends', 'fr', 1024, 768],
  ['tablet-portrait', 'friends', 'en', 768, 1024],
  ['mobile-reference', 'friends', 'fr', 390, 844],
  ['mobile-wide', 'friends', 'fr', 430, 932],
  ['mobile-small', 'friends', 'fr', 320, 740],
  ['mobile-landscape', 'friends', 'en', 844, 390],
  ['mobile-short-landscape', 'stress', 'fr', 667, 375],
  ['teams-desktop', 'teams', 'fr', 1536, 1024],
  ['teams-mobile', 'teams', 'en', 390, 844],
  ['two-desktop', 'two', 'en', 1280, 900],
  ['two-mobile', 'two', 'fr', 320, 740],
  ['stress-desktop', 'stress', 'fr', 1536, 1024],
  ['stress-mobile', 'stress', 'en', 390, 844],
  ['comfort-small', 'stress', 'fr', 320, 740, true, true],
  ['comfort-landscape', 'friends', 'en', 844, 390, true, true],
  ['comfort-desktop', 'stress', 'en', 1280, 900, true, true],
];
const publicIds = new Set([
  'desktop-reference',
  'desktop-laptop',
  'tablet-landscape',
  'mobile-reference',
  'mobile-small',
  'mobile-landscape',
  'teams-mobile',
  'stress-desktop',
  'comfort-small',
]);
const selected = process.env.PROFILE_QA_CASES?.split(',');
const cases = matrix.filter(([id]) =>
  selected
    ? selected.includes(id)
    : process.env.PROFILE_QA_PROFILE !== 'public' || publicIds.has(id),
);
assert(cases.length, 'At least one named profile acceptance case must be selected');
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.PROFILE_QA_URL, 4189);
results.url = app.url;
const browser = await chromium.launch({ headless: true });
results.browser = browser.version();
let saving = Promise.resolve();
const saveResults = () => {
  const contents = JSON.stringify(results, null, 2) + '\n';
  saving = saving.then(() => fs.writeFile(path.join(out, 'results.json'), contents));
  return saving;
};
const panelSelector = '.player-profiles > .player-panel';
const dialogSelector = '.player-details-dialog';

async function capture(page, id, stage) {
  const filename = `${id}-${stage}.png`;
  await page.screenshot({ path: path.join(out, filename), animations: 'disabled' });
  results.frames.push({ id, stage, filename });
}

async function openFixture(page, fixture, language, largeText) {
  await page.addInitScript(
    ({ save, language, largeText }) => {
      localStorage.clear();
      localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
      localStorage.setItem('money-tour.language.v1', language);
      localStorage.setItem(
        'money-tour.comfort',
        JSON.stringify({ largeText, pace: 'normal', boardZoom: 100 }),
      );
      localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, sound: false }));
    },
    { save: fixture.save, language, largeText },
  );
  await page.goto(app.url);
  await page
    .getByRole('button', {
      name: language === 'fr' ? /Reprendre ma partie$/ : /Resume my game$/,
    })
    .click({ timeout: 45000 });
  await page.locator(panelSelector).first().waitFor({ state: 'visible' });
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page
    .locator('.board-hit-polygons polygon')
    .first()
    .waitFor({ state: 'attached', timeout: 60000 });
  await page.waitForFunction(() => {
    const polygon = document.querySelector('.board-hit-polygons polygon');
    return polygon && (polygon.getAttribute('points')?.length ?? 0) > 10;
  });
  await page.waitForFunction(() => {
    const art = document.querySelector('.archipelago-backdrop__art');
    return art instanceof HTMLImageElement && art.complete && art.naturalWidth > 0;
  });
  assert.equal(await page.locator('.board-canvas canvas').count(), 1, 'Real WebGL board is drawn');
  assert.equal(
    await page.locator('dialog[open]').count(),
    0,
    'Profiles start with the board unobscured',
  );
}

async function boardGeometry(page) {
  const value = await page.evaluate(() => {
    const board = document.querySelector('.board-viewport').getBoundingClientRect();
    const serial = (rect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    });
    const panels = [...document.querySelectorAll('.player-profiles > .player-panel')].map(
      (panel) => {
        const rect = panel.getBoundingClientRect();
        const frame = panel.querySelector('.player-portrait-frame')?.getBoundingClientRect();
        const image = panel.querySelector('.player-portrait-image')?.getBoundingClientRect();
        const heading = panel.querySelector('.player-panel-heading')?.getBoundingClientRect();
        const statLabelsFit = [...panel.querySelectorAll('.player-panel-stats small')].every(
          (label) => {
            const box = label.getBoundingClientRect();
            if (!box.width || !box.height) return true;
            const range = document.createRange();
            range.selectNodeContents(label);
            const text = range.getBoundingClientRect();
            const tile = label.closest('.player-panel-stats > div').getBoundingClientRect();
            return (
              text.left >= tile.left - 1 &&
              text.right <= tile.right + 1 &&
              text.top >= tile.top - 1 &&
              text.bottom <= tile.bottom + 1
            );
          },
        );
        const balanceFitsChevron = [
          ...panel.querySelectorAll(
            '.player-panel-heading .player-panel-money-full, .player-panel-heading .player-panel-money-compact',
          ),
        ].every((amount) => {
          const amountBox = amount.getBoundingClientRect();
          if (amountBox.width <= 2 || amountBox.height <= 2) return true;
          const range = document.createRange();
          range.selectNodeContents(amount);
          const text = range.getBoundingClientRect();
          const mark = panel.classList.contains('is-active')
            ? panel.querySelector('.player-active-mark')
            : panel.querySelector('.player-compact-chevron');
          if (!mark || getComputedStyle(mark).visibility === 'hidden') return true;
          const markBox = mark.getBoundingClientRect();
          return (
            !markBox.width ||
            !markBox.height ||
            Math.min(text.right, markBox.right) - Math.max(text.left, markBox.left) <= 0.5 ||
            Math.min(text.bottom, markBox.bottom) - Math.max(text.top, markBox.top) <= 0.5
          );
        });
        const portraitCentered =
          frame &&
          image &&
          Math.abs((frame.left + frame.right - image.left - image.right) / 2) <= 1.5 &&
          Math.abs((frame.top + frame.bottom - image.top - image.bottom) / 2) <= 1.5;
        return {
          player: panel.getAttribute('data-bank'),
          ...serial(rect),
          portraitCentered: !!portraitCentered,
          overlapsBoard:
            Math.min(rect.right, board.right) - Math.max(rect.left, board.left) > 1 &&
            Math.min(rect.bottom, board.bottom) - Math.max(rect.top, board.top) > 1,
          horizontallyFits: rect.left >= -1 && rect.right <= innerWidth + 1,
          verticallyFits: rect.top >= -1 && rect.bottom <= innerHeight + 1,
          headingFits:
            !!heading &&
            heading.left >= rect.left - 1 &&
            heading.right <= rect.right + 1 &&
            heading.top >= rect.top - 1 &&
            heading.bottom <= rect.bottom + 1,
          statLabelsFit,
          balanceFitsChevron,
        };
      },
    );
    const openButtons = [...document.querySelectorAll('.player-profile-open')]
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.getAttribute('aria-label') ?? button.textContent.trim(),
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((button) => button.width && button.height);
    const artwork = document.querySelector('.archipelago-backdrop__art');
    const navigation = [
      ...document.querySelectorAll(
        '.board-controls > button, .game-sidebar .actions > button.primary',
      ),
    ]
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.getAttribute('aria-label') ?? button.textContent.trim(),
          ...serial(rect),
          fits:
            rect.left >= -1 &&
            rect.top >= -1 &&
            rect.right <= innerWidth + 1 &&
            rect.bottom <= innerHeight + 1,
          overlapsBoard:
            Math.min(rect.right, board.right) - Math.max(rect.left, board.left) > 1 &&
            Math.min(rect.bottom, board.bottom) - Math.max(rect.top, board.top) > 1,
        };
      })
      .filter((button) => button.width && button.height);
    const tilePoints = [...document.querySelectorAll('.board-hit-polygons polygon')]
      .flatMap((polygon) => (polygon.getAttribute('points') ?? '').trim().split(/\s+/))
      .map((point) => point.split(',').map(Number))
      .filter((point) => point.length === 2 && point.every(Number.isFinite));
    return {
      board: serial(board),
      panels,
      openButtons,
      navigation,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      viewport: { width: innerWidth, height: innerHeight },
      renderedTiles: [...document.querySelectorAll('.board-hit-polygons polygon')].filter(
        (polygon) => polygon.getAttribute('points'),
      ).length,
      artwork: {
        loaded: artwork instanceof HTMLImageElement && artwork.complete && artwork.naturalWidth > 0,
        source: artwork?.getAttribute('src'),
        currentSource: artwork instanceof HTMLImageElement ? artwork.currentSrc : '',
        expectsPortraitSource: matchMedia('(max-width: 999px) and (orientation: portrait)').matches,
        hiddenFromAccessibility: artwork?.closest('[aria-hidden="true"]') !== null,
      },
      projectedBounds: {
        minX: Math.min(...tilePoints.map(([x]) => x)),
        maxX: Math.max(...tilePoints.map(([x]) => x)),
        minY: Math.min(...tilePoints.map(([, y]) => y)),
        maxY: Math.max(...tilePoints.map(([, y]) => y)),
      },
    };
  });
  assert(value.noHorizontalOverflow, 'Application must not overflow horizontally');
  assert(
    value.board.width > 200 && value.board.height > 160,
    `Board retains usable space: ${JSON.stringify(value.board)}`,
  );
  assert(value.renderedTiles >= 30, 'Board tile controls have projected geometry');
  assert(
    value.projectedBounds.minX >= -1 &&
      value.projectedBounds.maxX <= 101 &&
      value.projectedBounds.minY >= -1 &&
      value.projectedBounds.maxY <= 101,
    `The default board view shows every playable tile: ${JSON.stringify(value.projectedBounds)}`,
  );
  for (const panel of value.panels) {
    assert(!panel.overlapsBoard, `${panel.player}: profile must stay outside the board viewport`);
    assert(panel.horizontallyFits, `${panel.player}: profile fits the screen width`);
    assert(panel.verticallyFits, `${panel.player}: profile fits the screen height`);
    assert(
      panel.headingFits,
      `${panel.player}: name/portrait/balance header stays inside its profile frame`,
    );
    assert(
      panel.statLabelsFit,
      `${panel.player}: property/lap labels stay inside their statistic tiles`,
    );
    assert(
      panel.balanceFitsChevron,
      `${panel.player}: balance/status text does not overlap the profile chevron`,
    );
    assert(panel.portraitCentered, `${panel.player}: portrait is centered in its circular frame`);
  }
  assert(value.artwork.loaded, 'The production archipelago bitmap is loaded');
  assert(
    value.artwork.currentSource.endsWith(
      value.artwork.expectsPortraitSource
        ? '/textures/archipelago-mobile-bokeh.webp'
        : '/textures/archipelago-bokeh.webp',
    ),
    'The scene chooses the dedicated portrait artwork only for mobile portrait screens',
  );
  assert(
    value.artwork.hiddenFromAccessibility,
    'Decorative scenery is hidden from assistive technology',
  );
  for (const button of value.openButtons)
    assert(
      button.width >= 43 && button.height >= 43,
      `${button.name}: profile action has a 44px touch target`,
    );
  assert(value.navigation.length >= 4, 'The primary action and board navigation remain present');
  for (const button of value.navigation) {
    assert(button.fits, `${button.name}: primary/navigation action fits the viewport`);
    assert(
      button.width >= 43 && button.height >= 43,
      `${button.name}: navigation has a 44px touch target`,
    );
    assert(!button.overlapsBoard, `${button.name}: navigation remains outside the playable board`);
  }
  return value;
}

async function boardGestures(page, context, language, id) {
  const fr = language === 'fr';
  const shell = page.locator('.board-shell');
  // Pause intentionally frames the entire board; resume through the normal UI
  // before exercising the player's follow camera and touch controls.
  await page.getByRole('button', { name: fr ? 'Reprendre' : 'Resume', exact: true }).click();
  await page
    .getByRole('button', { name: fr ? 'Suivre mon pion' : 'Follow my pawn', exact: true })
    .click();
  await page.locator('.board-shell[data-camera="follow"]').waitFor();
  await page
    .getByRole('button', { name: fr ? 'Vue globale' : 'Board overview', exact: true })
    .click();
  await page.locator('.board-shell[data-camera="overview"]').waitFor();
  await page
    .getByRole('button', { name: fr ? 'Suivre mon pion' : 'Follow my pawn', exact: true })
    .click();
  await page.locator('.board-shell[data-camera="follow"]').waitFor();
  const cdp = await context.newCDPSession(page);
  const box = await shell.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const initial = Math.min(25, box.width / 8);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x - initial, y, id: 1 },
      { x: x + initial, y, id: 2 },
    ],
  });
  for (const factor of [1.2, 1.5, 1.8])
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - initial * factor, y, id: 1 },
        { x: x + initial * factor, y, id: 2 },
      ],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom > 100,
  );
  const zoom = await page.evaluate(
    () => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom,
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 3 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 40, y: y + 12, id: 3 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('.board-shell[data-camera="manual"]').waitFor();
  await page
    .getByRole('button', { name: fr ? 'Recentrer mon pion' : 'Centre on my pawn', exact: true })
    .click();
  await page.locator('.board-shell[data-camera="follow"]').waitFor();
  await capture(page, id, 'pinch-pan-recenter');
  await cdp.detach();
  return { overviewFollowToggle: true, pinchZoom: zoom, dragPan: true, recenter: true };
}

async function dialogGeometry(dialog) {
  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const close = element.querySelector('.player-details-close').getBoundingClientRect();
    const back = element.querySelector('.player-details-back').getBoundingClientRect();
    const body = element.querySelector('.player-details-body') ?? element;
    const heading = document.getElementById(element.getAttribute('aria-labelledby'));
    const originalScrollTop = body.scrollTop;
    const propertyReachability = [...element.querySelectorAll('.mini-property')].map((property) => {
      property.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
      const propertyBox = property.getBoundingClientRect();
      const bodyBox = body.getBoundingClientRect();
      return (
        propertyBox.top >= bodyBox.top - 1 &&
        propertyBox.bottom <= bodyBox.bottom + 1 &&
        propertyBox.left >= bodyBox.left - 1 &&
        propertyBox.right <= bodyBox.right + 1
      );
    });
    body.scrollTop = originalScrollTop;
    return {
      bounds: {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      },
      fits:
        box.left >= -1 &&
        box.top >= -1 &&
        box.right <= innerWidth + 1 &&
        box.bottom <= innerHeight + 1,
      noHorizontalOverflow: body.scrollWidth <= body.clientWidth + 1,
      closeFits:
        close.left >= 0 &&
        close.top >= 0 &&
        close.right <= innerWidth &&
        close.bottom <= innerHeight &&
        close.width >= 43 &&
        close.height >= 43,
      backFits:
        back.left >= 0 &&
        back.top >= 0 &&
        back.right <= innerWidth &&
        back.bottom <= innerHeight &&
        back.width >= 43 &&
        back.height >= 43,
      labelled: !!heading?.textContent.trim(),
      bodyScrolls: body.scrollHeight > body.clientHeight + 1,
      bodyHeight: body.clientHeight,
      everyPropertyReachableByScrolling: propertyReachability.every(Boolean),
    };
  });
  assert(geometry.fits, 'Player details fit inside the viewport');
  assert(geometry.noHorizontalOverflow, 'Player details do not overflow horizontally');
  assert(geometry.closeFits, 'Close target remains visible and touch sized');
  assert(geometry.backFits, 'Return-to-board action remains visible and touch sized');
  assert(geometry.labelled, 'Player details have an accessible heading');
  assert(
    geometry.everyPropertyReachableByScrolling,
    'Every owned property can be revealed inside the details scroll area',
  );
  return geometry;
}

async function audit(page, id, stage, selector) {
  if (process.env.PROFILE_QA_AXE === '0') return;
  const analysis = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = analysis.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.map((node) => node.target),
  }));
  results.accessibility.push({ id, stage, violations });
  assert.deepEqual(violations, [], `${stage}: scoped automated accessibility audit`);
}

async function runCase([
  id,
  fixtureName,
  language,
  width,
  height,
  largeText = false,
  reducedMotion = false,
]) {
  const fixture = createPlayerFixture(fixtureName);
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 1000,
    hasTouch: width < 1000,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => results.errors.push({ id, message: error.message }));
  const auditCase = [
    'desktop-reference',
    'mobile-reference',
    'mobile-landscape',
    'comfort-small',
    'teams-mobile',
  ].includes(id);
  try {
    await openFixture(page, fixture, language, largeText);
    assert.equal(await page.locator(panelSelector).count(), fixture.save.state.players.length);
    const initial = await boardGeometry(page);
    await capture(page, id, 'board');
    // Keep the real running-game screenshot, then use the ordinary local Pause
    // control so CPU-heavy audits do not spend the player's 30-second decision.
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    if (auditCase) await audit(page, id, 'profiles', '.player-profiles');
    const firstPanel = page.locator(panelSelector).first();
    const opener = firstPanel.locator('.player-profile-open').filter({ visible: true }).first();
    await opener.click();
    const dialog = page.locator(`${dialogSelector}[open]`);
    await dialog.waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('dialog[open]').count(),
      1,
      'Only one player detail dialog may be open',
    );
    const details = await dialogGeometry(dialog);
    assert.equal(
      await dialog.locator('.mini-property').count(),
      Object.values(fixture.save.state.properties).filter((property) => property.ownerId === 'p1')
        .length,
      'Details retain every owned property, including properties beyond the card preview',
    );
    await capture(page, id, 'details');
    for (let count = 0; count < 3; count++) {
      await page.keyboard.press('Tab');
      assert(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
        'Tab focus stays inside details',
      );
    }
    await page.keyboard.press('Shift+Tab');
    assert(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
      'Reverse Tab stays inside details',
    );
    const focusable = dialog
      .locator(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      .filter({ visible: true });
    await focusable.last().focus();
    await page.keyboard.press('Tab');
    assert(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
      'Forward focus wraps inside details at the last control',
    );
    await focusable.first().focus();
    await page.keyboard.press('Shift+Tab');
    assert(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
      'Reverse focus wraps inside details at the first control',
    );
    if (auditCase) await audit(page, id, 'details', dialogSelector);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert(
      await opener.evaluate((element) => document.activeElement === element),
      'Escape restores focus to the profile action',
    );
    await opener.click();
    await dialog.locator('.player-details-back').click();
    await dialog.waitFor({ state: 'hidden' });
    await opener.click();
    await dialog.locator('.player-details-close').click();
    await dialog.waitFor({ state: 'hidden' });
    await opener.click();
    const bounds = await dialog.boundingBox();
    const outside =
      bounds.y > 4
        ? { x: width / 2, y: Math.max(1, bounds.y / 2) }
        : bounds.x > 4
          ? { x: 1, y: height / 2 }
          : null;
    let backdropDismissed = false;
    if (outside) {
      if (width < 1000) await page.touchscreen.tap(outside.x, outside.y);
      else await page.mouse.click(outside.x, outside.y);
      await dialog.waitFor({ state: 'hidden' });
      backdropDismissed = true;
    } else await dialog.locator('.player-details-close').click();
    const collapse = firstPanel.locator('.player-panel-collapse');
    let collapsed = null;
    if (await collapse.isVisible()) {
      await collapse.click();
      collapsed = await boardGeometry(page);
      assert.equal(await collapse.getAttribute('aria-expanded'), 'false');
      if (['desktop-reference', 'stress-desktop'].includes(id))
        await capture(page, id, 'collapsed');
      await collapse.click();
      assert.equal(await collapse.getAttribute('aria-expanded'), 'true');
    }
    let activeDetails = null;
    if (['desktop-reference', 'mobile-reference'].includes(id)) {
      await page
        .locator(`${panelSelector}.is-active .player-profile-open`)
        .filter({ visible: true })
        .first()
        .click();
      await dialog.waitFor({ state: 'visible' });
      activeDetails = await dialogGeometry(dialog);
      assert.equal(
        await dialog.getByRole('heading', { name: 'Noa', exact: true }).count(),
        1,
        'Reference detail sheet presents the active gold player',
      );
      await capture(page, id, 'active-details');
      await dialog.locator('.player-details-back').click();
      await dialog.waitFor({ state: 'hidden' });
    }
    const gestures = ['mobile-reference', 'mobile-landscape'].includes(id)
      ? await boardGestures(page, context, language, id)
      : null;
    results.checks.push({
      id,
      fixture: fixtureName,
      language,
      width,
      height,
      largeText,
      reducedMotion,
      initial,
      details,
      collapsed,
      backdropDismissed,
      focusTrap: true,
      escapeRestoresFocus: true,
      backButton: true,
      closeButton: true,
      detailedAuditPausedViaUi: true,
      gestures,
      activeDetails,
    });
  } catch (error) {
    results.failures.push({ id, message: error.message, stack: error.stack });
    await capture(page, id, 'failure').catch(() => undefined);
    if (process.env.PROFILE_QA_FAIL_FAST === '1') throw error;
  } finally {
    await context.close();
    await saveResults();
  }
}

try {
  const queue = [...cases];
  const concurrency = Math.max(1, Number(process.env.PROFILE_QA_CONCURRENCY ?? 1));
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) await runCase(queue.shift());
    }),
  );
  assert.deepEqual(results.errors, [], 'No JavaScript application errors');
  assert.equal(
    results.failures.length,
    0,
    results.failures.map(({ id, message }) => `${id}: ${message}`).join('; '),
  );
  console.log(
    JSON.stringify({
      checks: results.checks.length,
      screenshots: results.frames.length,
      accessibility: results.accessibility.length,
      out,
    }),
  );
} finally {
  results.finishedAt = new Date().toISOString();
  await saveResults();
  await browser.close();
  app.close();
}
