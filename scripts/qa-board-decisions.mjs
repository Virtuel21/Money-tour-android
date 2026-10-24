/** Real UI acceptance for debt inspection, direct Festival choices and island decisions.
 * Uses validated current saves through ordinary Resume my game; supports public Pages.
 * Mobile viewport and touch input are emulated on a computer.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { tsImport } from 'tsx/esm/api';
import { qaServer } from './qa-server.mjs';
import { actionStateSignature, createActionFixture } from './qa-action-fixtures.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(
  process.env.BOARD_DECISIONS_QA_OUT ?? '../../outputs/recette-decisions/local',
);
const requested = process.env.BOARD_DECISIONS_QA_CASE;
const requestedPattern = process.env.BOARD_DECISIONS_QA_FILTER
  ? new RegExp(process.env.BOARD_DECISIONS_QA_FILTER)
  : null;
const { getLegalActions, getPropertyValue, validateState } = await tsImport(
  '../packages/engine/src/index.ts',
  import.meta.url,
);
const en = JSON.parse(await fs.readFile(new URL('../apps/web/src/i18n/en.json', import.meta.url)));
const profiles = [
  { language: 'fr', width: 1280, height: 900 },
  { language: 'fr', width: 390, height: 844 },
  { language: 'en', width: 844, height: 390 },
];
const scenarios = ['debt', 'festival', 'island', 'travel'];
const results = {
  startedAt: new Date().toISOString(),
  url: '',
  environment: 'Headless Chrome; mobile viewport and touch input are emulated.',
  checks: [],
  screenshots: [],
  errors: [],
  failures: [],
};
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.BOARD_DECISIONS_QA_URL, 4196);
results.url = app.url;
const browser = await chromium.launch({ headless: true });
const write = () =>
  fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n');

function text(fr, language) {
  return language === 'fr' ? fr : (en[fr] ?? fr);
}
async function state(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.local.v17')).state);
}
async function changed(page, predicate, message) {
  const deadline = Date.now() + 12000;
  do {
    const current = await state(page);
    if (predicate(current)) return current;
    await page.waitForTimeout(80);
  } while (Date.now() < deadline);
  assert.fail(message);
}
async function capture(page, name, stage) {
  const filename = `${name}-${stage}.png`;
  await page.screenshot({ path: path.join(out, filename), animations: 'disabled', timeout: 15000 });
  results.screenshots.push(filename);
}
async function press(locator, mobile) {
  if (mobile) await locator.tap();
  else await locator.click();
}
async function controlVisible(locator, label) {
  const box = await locator.boundingBox();
  assert(
    box && box.y >= -1 && box.y + box.height <= locator.page().viewportSize().height + 1,
    `${label} is immediately visible without scrolling`,
  );
  assert(
    await locator.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      return hit === element || element.contains(hit);
    }),
    `${label} is not clipped or covered`,
  );
}
async function guidance(page) {
  const hint = page.locator('.game-sidebar .action-card > .board-choice-hint');
  await hint.waitFor();
  assert(
    await hint.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return (
        box.width > 40 &&
        box.height > 12 &&
        box.top >= 0 &&
        box.bottom <= innerHeight + 1 &&
        style.clipPath === 'none' &&
        (hit === element || element.contains(hit))
      );
    }),
    'Direct board guidance is visually readable within the viewport',
  );
  return hint.innerText();
}
function boardTile(page, id) {
  return page.locator('.board-hit-polygons [role="button"]').nth(id);
}
async function boardAccess(page, targets) {
  const points = await page.locator('.board-hit-polygons').evaluate(
    (svg, ids) => {
      const bounds = svg.getBoundingClientRect();
      const polygons = [...svg.querySelectorAll('[role="button"]')];
      return ids.map((id) => {
        const polygon = polygons[id];
        const vertices = [...polygon.points];
        const center = {
          x: vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length,
          y: vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length,
        };
        const samples = [
          center,
          ...vertices.map((vertex) => ({
            x: center.x + (vertex.x - center.x) * 0.45,
            y: center.y + (vertex.y - center.y) * 0.45,
          })),
        ].map((point) => ({
          x: bounds.x + (point.x / 100) * bounds.width,
          y: bounds.y + (point.y / 100) * bounds.height,
        }));
        const accessible = samples.map((point) => {
          const hit = document.elementFromPoint(point.x, point.y);
          return {
            ...point,
            reachable: hit === polygon || polygon.contains(hit),
            covering: hit?.getAttribute('class') ?? hit?.tagName,
          };
        });
        return {
          id,
          centerReachable: accessible[0].reachable,
          point: accessible.find((sample) => sample.reachable) ?? null,
          samples: accessible,
        };
      });
    },
    targets.map((target) => target.tile),
  );
  assert.deepEqual(
    points
      .filter((target) => !target.point)
      .map((target) => ({ id: target.id, samples: target.samples })),
    [],
    'Every legal board target has a reachable interior point without HUD obstruction',
  );
  return points;
}
async function geometry(page) {
  const value = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
    dialogs: [...document.querySelectorAll('dialog[open]')].map((element) => {
      const box = element.getBoundingClientRect();
      return {
        title: document.getElementById(element.getAttribute('aria-labelledby'))?.textContent,
        fits:
          box.left >= -1 &&
          box.top >= -1 &&
          box.right <= innerWidth + 1 &&
          box.bottom <= innerHeight + 1,
        horizontalOverflow: element.scrollWidth > element.clientWidth + 2,
      };
    }),
  }));
  assert(!value.overflow, 'No document horizontal overflow');
  assert(
    value.dialogs.every((dialog) => dialog.fits && !dialog.horizontalOverflow),
    'Open dialogs fit the viewport',
  );
  return value;
}
async function openFixture(page, fixture, language) {
  await page.addInitScript(
    ({ save, language }) => {
      localStorage.clear();
      localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
      localStorage.setItem('money-tour.language.v1', language);
      localStorage.setItem(
        'money-tour.comfort',
        JSON.stringify({ largeText: false, pace: 'normal', boardZoom: 100 }),
      );
      localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, sound: false }));
    },
    { save: fixture.save, language },
  );
  await page.goto(app.url);
  await page
    .getByRole('button', { name: language === 'fr' ? /Reprendre ma partie$/ : /Resume my game$/ })
    .click({ timeout: 45000 });
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.locator('.board-canvas canvas').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector('.board-hit-polygons polygon')?.getAttribute('points')?.length > 10,
  );
  await page.locator('.turn-banner').waitFor({ state: 'hidden' });
  const understood = page.getByRole('button', { name: text('Compris', language), exact: true });
  if ((await understood.count()) && (await understood.isVisible())) await understood.click();
}

async function inspectSidePreview(page, current, language, name) {
  const own = current.config.board.find((tile) => current.properties[tile.id]?.ownerId === 'p1');
  assert(own, 'The active player has a property preview to inspect');
  const signature = actionStateSignature(current);
  const propertyName = text(own.name, language);
  const preview = page
    .locator('[data-bank="p1"] .player-property-preview-item')
    .filter({ hasText: propertyName })
    .first();
  await preview.click();
  const dialog = page.getByRole('dialog', { name: propertyName, exact: true });
  await dialog.waitFor();
  assert.equal(
    actionStateSignature(await state(page)),
    signature,
    'A side property preview only inspects: phase, cash, position and ownership stay unchanged',
  );
  await geometry(page);
  await capture(page, name, 'side-property-inspection');
  await dialog
    .getByRole('button', { name: text('Retour au plateau', language), exact: true })
    .click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    actionStateSignature(await state(page)),
    signature,
    'Closing property inspection preserves the pending board decision',
  );
}

async function debt(page, fixture, profile, name) {
  const { language, width } = profile;
  const mobile = width < 1000;
  const title = text('Réglons cette dette ensemble', language);
  const card = page.getByRole('dialog', { name: title, exact: true });
  await card.waitFor();
  const initial = await state(page);
  const initialSignature = actionStateSignature(initial);
  assert.equal(
    await page.locator('.game-sidebar .action-card .actions button:visible').count(),
    0,
    'No duplicate debt actions behind the modal',
  );
  await geometry(page);
  await capture(page, name, 'sale-open');
  const minimize = card.getByRole('button', {
    name: text('Réduire pour voir le plateau', language),
    exact: true,
  });
  const box = await minimize.boundingBox();
  assert(box && box.width >= 43 && box.height >= 43, 'Minimize has a touch-friendly target');
  // Enter exercises the native button keyboard path independently of touch/click.
  await minimize.focus();
  await page.keyboard.press('Enter');
  await card.waitFor({ state: 'hidden' });
  assert.equal(
    actionStateSignature(await state(page)),
    initialSignature,
    'Minimizing does not dispatch a game action',
  );
  const reopen = page.getByRole('button', {
    name: new RegExp('^' + text('Reprendre la vente', language)),
  });
  await reopen.waitFor();
  await controlVisible(reopen, 'Resume sale');
  await capture(page, name, 'sale-minimized');
  const firstSale = getLegalActions(initial).find((action) => action.type === 'sell');
  const propertyName = text(initial.config.board[firstSale.tile].name, language);
  await press(boardTile(page, firstSale.tile), mobile);
  const inspection = page.getByRole('dialog', { name: propertyName, exact: true });
  await inspection.waitFor();
  assert.equal(
    actionStateSignature(await state(page)),
    initialSignature,
    'Board inspection does not sell the selected property',
  );
  await geometry(page);
  await capture(page, name, 'property-inspection');
  await press(
    inspection.getByRole('button', { name: text('Retour au plateau', language), exact: true }),
    mobile,
  );
  await inspection.waitFor({ state: 'hidden' });
  await press(reopen, mobile);
  await card.waitFor();
  assert.equal(
    actionStateSignature(await state(page)),
    initialSignature,
    'Reopening retains the same debt and assets',
  );
  await page.keyboard.press('Escape');
  await card.waitFor({ state: 'hidden' });
  await press(reopen, mobile);
  await card.waitFor();
  await capture(page, name, 'sale-restored');
  const debtor = initial.players.find((player) => player.id === initial.debt.playerId);
  const creditor = initial.players.find((player) => player.id === initial.debt.creditorId);
  let soldValue = 0;
  const sold = [];
  let current = initial;
  while (current.phase === 'debt') {
    assert(sold.length < 8, 'Debt settles after a bounded number of real legal sales');
    const sale = getLegalActions(current).find((action) => action.type === 'sell');
    assert(sale, 'Debt has a legal sale');
    soldValue += Math.floor(getPropertyValue(current, sale.tile) * current.config.resaleRate);
    await card.waitFor();
    const choice = card
      .locator('.debt-card-choices button')
      .filter({ hasText: text(current.config.board[sale.tile].name, language) })
      .first();
    await press(choice, mobile);
    current = await changed(
      page,
      (next) => next.properties[sale.tile].ownerId === null,
      'Selected sale must be committed',
    );
    sold.push(sale.tile);
  }
  assert.equal(current.debt, null, 'Debt is fully settled');
  assert.equal(
    current.players.find((player) => player.id === debtor.id).cash,
    debtor.cash + soldValue - initial.debt.amount,
    'Resale cash and debt are applied exactly once',
  );
  if (creditor)
    assert.equal(
      current.players.find((player) => player.id === creditor.id).cash,
      creditor.cash + initial.debt.amount,
      'Creditor receives exactly one debt payment',
    );
  await capture(page, name, 'debt-settled');
  return {
    sold,
    amount: initial.debt.amount,
    soldValue,
    minimizedByKeyboard: true,
    minimizedByEscape: true,
    inspectionPreservedState: true,
  };
}

async function festival(page, fixture, profile, name, variant) {
  const { language, width } = profile;
  const mobile = width < 1000;
  const initial = await state(page);
  if (!mobile && !variant) await inspectSidePreview(page, initial, language, name);
  assert.equal(
    await page.locator('.action-card-dialog[open]').count(),
    0,
    'Festival has no blocking card',
  );
  assert.equal(
    await page.locator('.mondial-picker .primary:visible').count(),
    0,
    'Festival has no duplicate property list',
  );
  assert.equal(
    await page.locator('.mobile-tile-list:visible').count(),
    0,
    'Festival has no mobile list replacing board selection',
  );
  const targets = getLegalActions(initial).filter((action) => action.type === 'place_championship');
  const access = await boardAccess(page, targets);
  assert.equal(
    await page.locator('.board-hit-polygons .selectable').count(),
    targets.length,
    'Exactly the legal Festival properties are highlighted',
  );
  const decline = page.getByRole('button', {
    name: new RegExp(text('Ne pas organiser le Festival', language)),
  });
  assert.equal(await decline.count(), 1, 'Exactly one decline action remains available');
  const hint = await guidance(page);
  await controlVisible(decline, 'Skip Festival');
  if (variant === 'no-funds')
    assert.match(hint, /Il vous faut\s+50/, 'Insufficient funds are explained visibly');
  else if (variant === 'no-properties')
    assert(
      hint.includes(
        text('Achetez d’abord une ville ou une île pour y organiser le Festival.', language),
      ),
      'Missing property is explained visibly',
    );
  else
    assert(
      hint.includes(String(initial.config.championshipFee)),
      'Festival price is visible before selecting',
    );
  await geometry(page);
  await capture(page, name, 'direct-board-choice');
  if (variant) {
    assert.equal(targets.length, 0, 'Fallback fixture has no affordable eligible target');
    await press(decline, mobile);
    const after = await changed(
      page,
      (next) => next.phase !== 'championship',
      'Declining leaves Festival without getting stuck',
    );
    assert.equal(
      after.players[0].cash,
      initial.players[0].cash,
      'Declining does not charge the Festival',
    );
    await capture(page, name, 'declined');
    return { variant, targets: 0, declined: true };
  }
  assert(targets.length > 0, 'Festival fixture has legal direct choices');
  const target = targets[0].tile;
  if (mobile) {
    const point = access.find((entry) => entry.id === target).point;
    await page.touchscreen.tap(point.x, point.y);
  } else {
    await boardTile(page, target).focus();
    await page.keyboard.press('Enter');
  }
  const after = await changed(
    page,
    (next) => next.properties[target].championships > 0,
    'Board choice places the Festival',
  );
  assert.equal(after.properties[target].championships, 1, 'One Festival is placed');
  assert.equal(after.properties[target].championshipTurns, initial.config.championshipDuration);
  assert.equal(
    after.players[0].cash,
    initial.players[0].cash - initial.config.championshipFee,
    'Festival fee charged exactly once',
  );
  await capture(page, name, 'festival-placed');
  return {
    target,
    charged: initial.config.championshipFee,
    directBoardSelection: true,
    input: mobile ? 'tap' : 'keyboard Enter',
    boardAccess: access,
    sidePreviewInspected: !mobile,
  };
}

async function island(page, fixture, profile, name) {
  const { language, width } = profile;
  const card = page.getByRole('dialog', { name: text('Île perdue', language), exact: true });
  await card.waitFor();
  assert.equal(
    await page.locator('.action-card-dialog[open]').count(),
    1,
    'Only one island card is open',
  );
  assert.equal(
    await page.locator('.game-sidebar .action-card .actions button:visible').count(),
    0,
    'No duplicate island controls behind the card',
  );
  const initial = await state(page);
  await geometry(page);
  await capture(page, name, 'island-card-only');
  const leave = card.getByRole('button', {
    name: language === 'fr' ? /Quitter l’île/ : /Leave the island/,
  });
  await press(leave, width < 1000);
  const after = await changed(
    page,
    (next) => next.players[0].islandTurns === null,
    'Island payment releases the player',
  );
  assert.equal(
    after.players[0].cash,
    initial.players[0].cash - initial.config.islandFee,
    'Island payment applied exactly once',
  );
  await capture(page, name, 'island-left');
  return { fee: initial.config.islandFee, singleDecisionSurface: true };
}

async function travel(page, fixture, profile, name) {
  const { language, width } = profile;
  const initial = await state(page);
  if (width >= 1000) await inspectSidePreview(page, initial, language, name);
  assert.equal(
    await page.locator('.action-card-dialog[open]').count(),
    0,
    'Travel has no blocking destination card',
  );
  assert.equal(
    await page.locator('.mobile-tile-list:visible').count(),
    0,
    'Travel has no destination list',
  );
  assert.equal(
    await page.locator('.travel-destination:visible').count(),
    0,
    'Travel has no destination-list entry button',
  );
  const targets = getLegalActions(initial).filter((action) => action.type === 'travel');
  const access = await boardAccess(page, targets);
  assert.equal(
    await page.locator('.board-hit-polygons .selectable').count(),
    targets.length,
    'All legal travel destinations are highlighted',
  );
  const decline = page.getByRole('button', {
    name: new RegExp(text('Rester et lancer les dés', language)),
  });
  assert.equal(await decline.count(), 1, 'The player can decline travelling');
  const hint = await guidance(page);
  assert(
    hint.includes(String(initial.config.travelFee)),
    'Travel price is visible before selecting',
  );
  await controlVisible(decline, 'Decline travel');
  const target = targets.find(
    (action) =>
      action.tile > initial.players[0].position &&
      initial.config.board[action.tile].type === 'city' &&
      !initial.properties[action.tile]?.ownerId,
  );
  assert(target, 'The fixture has a free forward city without rent or a Start bonus');
  await geometry(page);
  await capture(page, name, 'direct-travel-choice');
  if (width < 1000) {
    const point = access.find((entry) => entry.id === target.tile).point;
    await page.touchscreen.tap(point.x, point.y);
  } else {
    await boardTile(page, target.tile).focus();
    await page.keyboard.press('Enter');
  }
  const after = await changed(
    page,
    (next) => next.players[0].position === target.tile && !next.players[0].travelPending,
    'Direct board travel updates the player destination',
  );
  assert.equal(
    after.players[0].cash,
    initial.players[0].cash - initial.config.travelFee,
    'Travel fee is charged exactly once',
  );
  assert.notEqual(after.phase, 'travel', 'Travel selection completes');
  await capture(page, name, 'travel-arrived');
  return {
    target: target.tile,
    charged: initial.config.travelFee,
    directBoardSelection: true,
    input: width < 1000 ? 'tap' : 'keyboard Enter',
    boardAccess: access,
    sidePreviewInspected: width >= 1000,
  };
}

async function run(kind, profile, variant) {
  const name = `${kind}${variant ? '-' + variant : ''}-${profile.language}-${profile.width}x${profile.height}`;
  if (requested && !name.includes(requested)) return;
  if (requestedPattern && !requestedPattern.test(name)) return;
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.width < 1000,
    hasTouch: profile.width < 1000,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => results.errors.push({ name, message: error.message }));
  const fixture = createActionFixture(kind);
  if (variant === 'no-funds') fixture.save.state.players[0].cash = 0;
  if (variant === 'no-properties')
    for (const property of Object.values(fixture.save.state.properties))
      if (property.ownerId === 'p1') {
        property.ownerId = null;
        property.level = 0;
        property.championships = 0;
        delete property.championshipTurns;
      }
  assert.deepEqual(validateState(fixture.save.state), [], 'Fallback save remains valid');
  try {
    await openFixture(page, fixture, profile.language);
    const detail =
      kind === 'debt'
        ? await debt(page, fixture, profile, name)
        : kind === 'festival'
          ? await festival(page, fixture, profile, name, variant)
          : kind === 'travel'
            ? await travel(page, fixture, profile, name)
            : await island(page, fixture, profile, name);
    assert.equal(
      results.errors.filter((error) => error.name === name).length,
      0,
      'No page exception',
    );
    results.checks.push({ name, passed: true, ...detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.failures.push({ name, message: error.message, stack: error.stack });
    await capture(page, name, 'failure').catch(() => {});
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.close();
    await write();
  }
}
try {
  for (const profile of profiles) for (const kind of scenarios) await run(kind, profile);
  for (const kind of ['festival', 'travel'])
    await run(kind, { language: 'fr', width: 320, height: 740 });
  await run('festival', profiles[1], 'no-funds');
  await run('festival', profiles[2], 'no-properties');
  assert.deepEqual(results.failures, [], 'Every board decision acceptance case passes');
  assert.deepEqual(results.errors, [], 'No page errors');
} finally {
  results.finishedAt = new Date().toISOString();
  await write();
  await browser.close();
  app.close();
}
