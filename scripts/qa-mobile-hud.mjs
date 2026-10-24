/** Real WebGL acceptance for the compact HUD and passive insurance flow.
 * HUD_QA_URL targets a deployment; HUD_QA_OUT selects the evidence directory.
 * HUD_QA_BROWSER=webkit runs the same checks using WebKit (default: Chromium).
 * Browser viewport, touch and warning time are emulated; no physical phone is represented.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { tsImport } from 'tsx/esm/api';
import { qaServer } from './qa-server.mjs';

const {
  config,
  createGame,
  createRng,
  reduceGame,
  validateState,
  sameRules,
  victoryThreats,
  monopolyGroups,
} = await tsImport('../packages/engine/src/index.ts', import.meta.url);

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.HUD_QA_OUT ?? '../../outputs/recette-hud/local');
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.HUD_QA_URL, 4197);
const engine = process.env.HUD_QA_BROWSER ?? 'chromium';
assert(['chromium', 'webkit'].includes(engine), `Unsupported HUD_QA_BROWSER: ${engine}`);
const browser = await { chromium, webkit }[engine].launch({ headless: true });
const report = {
  startedAt: new Date().toISOString(),
  url: app.url,
  browser: browser.version(),
  environment: `Headless ${engine}, real WebGL; emulated touch viewports and warning timer.`,
  checks: [],
  screenshots: [],
  errors: [],
  failures: [],
};
const write = () => fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
async function capture(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(out, filename), animations: 'disabled' });
  report.screenshots.push(filename);
}
async function check(name, run) {
  try {
    const evidence = await run();
    report.checks.push({ name, passed: true, evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.failures.push({ name, message: error.message, stack: error.stack });
    console.log(`FAIL ${name}: ${error.message}`);
    throw error;
  } finally {
    await write();
  }
}
function fixture(name) {
  const seed = `mobile-hud-qa:${name}`;
  const state = createGame({
    config,
    seed,
    players: [
      { id: 'p1', name: 'Léa' },
      { id: 'p2', name: 'Sacha' },
    ],
  });
  const city = state.config.board.find((tile) => tile.type === 'city');
  for (const property of Object.values(state.properties)) {
    property.ownerId = null;
    property.level = 0;
    property.championships = 0;
  }
  state.festivals = [];
  state.adventure = {
    twist: 'capital',
    capitalTile: city.id,
    round: 1,
    tenderRound: 7,
    tenderDone: false,
  };
  state.firstPlayer = 0;
  state.currentPlayer = 1;
  state.turn = 2;
  state.phase = 'end';
  state.extraRoll = false;
  state.consecutiveDoubles = 0;
  for (const player of state.players) {
    player.position = 0;
    player.laps = 0;
    delete player.insurance;
    state.quests[player.id] = { kind: 'laps', progress: 0, completed: false };
  }
  if (name === 'warning') {
    const groups = monopolyGroups(state.config);
    for (const group of groups.slice(0, state.config.groupsToWin - 1))
      for (const tile of group) state.properties[tile.id].ownerId = 'p1';
    for (const tile of groups[state.config.groupsToWin - 1].slice(0, -1))
      state.properties[tile.id].ownerId = 'p1';
    assert.equal(victoryThreats(state).length, 1, 'A public ownership warning is staged');
  }
  if (name === 'insurance') {
    state.currentPlayer = 0;
    state.turn = 1;
    state.phase = 'roll';
    state.properties[city.id] = { ownerId: 'p1', level: 1, championships: 0 };
    const sample = reduceGame(
      state,
      { type: 'roll', playerId: 'p1' },
      createRng(`${seed}:${state.seq}`),
    );
    const distance = sample.events
      .find((event) => event.type === 'dice')
      .dice.reduce((total, die) => total + die, 0);
    const target = state.config.board.find((tile) => tile.type === 'insurance').id;
    state.players[0].position =
      (target - distance + state.config.board.length) % state.config.board.length;
  }
  assert.deepEqual(validateState(state), [], `${name}: valid current save`);
  assert(sameRules(state.config, config), `${name}: unchanged production rules`);
  return { version: 1, seed, state };
}
async function open(width, height, save, pauseWhileLoading = false) {
  const mobile = width < 1000;
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) =>
    report.errors.push({ viewport: `${width}x${height}`, message: error.message }),
  );
  // Installing before navigation also captures the original warning's timeout.
  await page.clock.install();
  await page.addInitScript((save) => {
    localStorage.clear();
    localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
    localStorage.setItem('money-tour.language.v1', 'fr');
    localStorage.setItem('money-tour.context-tips.v1', JSON.stringify(['turns', 'insurance']));
    localStorage.setItem(
      'money-tour.comfort',
      JSON.stringify({ largeText: false, pace: 'fast', boardZoom: 400 }),
    );
    localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, sound: false }));
  }, save);
  await page.goto(app.url);
  await page.getByRole('button', { name: /Reprendre ma partie$/ }).click({ timeout: 45000 });
  // Each ordinary clock tick changes seq, hence the seeded dice. Pause before
  // waiting for models/textures so slow asset loading cannot move the fixture's RNG.
  if (pauseWhileLoading) await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.locator('.board-canvas canvas').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector('.board-hit-polygons polygon')?.getAttribute('points')?.length > 10,
  );
  assert.equal(await page.locator('.board-fallback').count(), 0, 'The real board rendered');
  if (pauseWhileLoading)
    assert.equal(
      (await state(page)).seq,
      save.state.seq,
      'Asset loading leaves the staged RNG intact',
    );
  return { context, page };
}
async function toolbar(page) {
  assert.equal(await page.locator('.board-controls').count(), 0, 'Bottom navigation is removed');
  const controls = await page.locator('.game-tools button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return {
        label: button.getAttribute('aria-label') ?? button.textContent.trim(),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        onScreen:
          box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        exposed:
          document
            .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
            ?.closest('button') === button,
      };
    }),
  );
  assert.equal(controls.length, 4, 'Settings, view, pause and exit share the top bar');
  for (const control of controls) {
    assert(control.width >= 43.9 && control.height >= 43.9, `${control.label}: 44px target`);
    assert(control.onScreen && control.exposed, `${control.label}: visible and reachable`);
  }
  assert.equal(await page.locator('.game-tools .board-view-control').count(), 1);
  const sidebar = await page.locator('.game-sidebar').boundingBox();
  assert(sidebar.width <= 1121, 'Actions retain their ultrawide maximum width');
  return { controls, actionWidth: sidebar.width };
}
async function fullBleed(page) {
  const geometry = await page.evaluate(() => {
    const selectors = [
      '.board-shell',
      '.board-canvas',
      '.board-canvas canvas',
      '.board-hit-polygons',
    ];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      overflow:
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight,
      boxes: Object.fromEntries(
        selectors.map((selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return [selector, { x: box.x, y: box.y, width: box.width, height: box.height }];
        }),
      ),
    };
  });
  for (const [selector, box] of Object.entries(geometry.boxes)) {
    assert(box.x <= 0 && box.y <= 0, `${selector}: covers the top and left edges`);
    assert(box.x + box.width >= geometry.viewport.width, `${selector}: covers the right edge`);
    assert(box.y + box.height >= geometry.viewport.height, `${selector}: covers the bottom edge`);
  }
  assert.equal(geometry.overflow, false, 'No page overflow');
  return geometry;
}
async function state(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.local.v17')).state);
}

try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [3440, 1440],
  ]) {
    const mobile = width < 1000;
    const name = `hud-${width}x${height}`;
    const { context, page } = await open(width, height, fixture('first-round'));
    try {
      await check(name, async () => {
        const controls = await toolbar(page);
        assert.equal(await page.locator('.adventure-banner').count(), 1);
        assert.match(await page.locator('.adventure-banner').innerText(), /Capitale mystère/);
        const before = mobile ? await fullBleed(page) : null;
        await page.locator('.turn-banner').waitFor({ state: 'hidden' });
        await capture(page, `${name}-first-round`);
        await page.getByRole('button', { name: /Fin du tour/ }).click();
        await page.waitForFunction(
          () =>
            JSON.parse(localStorage.getItem('money-tour.local.v17')).state.adventure.round === 2,
        );
        if (mobile) await page.locator('.adventure-banner').waitFor({ state: 'hidden' });
        else assert.equal(await page.locator('.adventure-banner').count(), 1);
        // Following at 400% exercises the existing full-screen canvas after the HUD reflows.
        if (mobile) {
          await page.getByRole('button', { name: 'Suivre mon pion', exact: true }).tap();
          await page.getByRole('button', { name: 'Vue globale', exact: true }).waitFor();
          await page.waitForTimeout(700);
          await fullBleed(page);
          await toolbar(page);
        }
        await page.locator('.turn-banner').waitFor({ state: 'hidden' });
        await capture(page, `${name}-second-round`);
        return {
          ...controls,
          mobileRuleHiddenAfterAllPlayed: mobile,
          desktopRuleRetained: !mobile,
          firstRound: 1,
          nextRound: (await state(page)).adventure.round,
          fullBleed: before,
        };
      });
    } finally {
      await context.close();
    }
  }

  const warning = await open(390, 844, fixture('warning'));
  try {
    await check('public-warning-auto-hides-after-30-seconds', async () => {
      await warning.page.locator('.victory-watch').waitFor();
      assert.match(await warning.page.locator('.victory-watch').innerText(), /Léa.*victoire/);
      await warning.page.getByRole('button', { name: 'Pause', exact: true }).tap();
      await capture(warning.page, 'warning-visible');
      await warning.page.clock.fastForward(30000);
      await warning.page.locator('.victory-watch').waitFor({ state: 'hidden' });
      await capture(warning.page, 'warning-after-30-seconds');
      return { warningInitiallyVisible: true, browserTimeAdvancedMs: 30000, warningGone: true };
    });
  } finally {
    await warning.context.close();
  }

  const insuranceSave = fixture('insurance');
  const insurance = await open(390, 844, insuranceSave, true);
  try {
    await check(
      'insurance-arrival-placement-and-next-roll-do-not-need-acknowledgement',
      async () => {
        const page = insurance.page;
        await page.getByRole('button', { name: 'Reprendre', exact: true }).tap();
        const beforeRoll = await state(page);
        assert.equal(beforeRoll.seq, insuranceSave.state.seq, 'The first roll uses the staged RNG');
        await page.getByRole('button', { name: /Lancer les dés/ }).click();
        const arrived = await state(page);
        const insuranceTile = arrived.config.board.find((tile) => tile.type === 'insurance').id;
        assert.equal(
          arrived.players[0].position,
          insuranceTile,
          'The real roll lands on insurance',
        );
        await page.locator('.passive-insurance-notice').waitFor();
        assert.match(
          await page.locator('.passive-insurance-notice').innerText(),
          /jeton assurance/,
        );
        assert.equal(await page.locator('.action-card-dialog[open]').count(), 0);
        const picker = page.getByRole('button', { name: /Choisir un bien à assurer/ });
        assert.equal(await picker.isEnabled(), true);
        await picker.tap();
        const dialog = page.locator('.action-card-dialog[open]');
        await dialog.waitFor();
        await dialog.locator('.mobile-tile-list button').first().tap();
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForFunction(
          () =>
            typeof JSON.parse(localStorage.getItem('money-tour.local.v17')).state.players[0]
              .insurance?.tile === 'number',
        );
        assert.match(
          await page.locator('.passive-insurance-notice').innerText(),
          /maintenant assurée/,
        );
        assert.equal(
          await page.locator('.passive-insurance-notice button').count(),
          1,
          'Only an optional close action',
        );
        await capture(page, 'insurance-confirmation-nonblocking');
        const next = page.getByRole('button', { name: /Fin du tour|Continuer · double/ });
        assert.equal(await next.isEnabled(), true);
        await next.tap();
        const roll = page.getByRole('button', { name: /Lancer les dés/ });
        await roll.waitFor();
        const rollsBefore = await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('money-tour.local.v17')).history.filter((message) =>
              message.includes('lance les dés'),
            ).length,
        );
        await roll.tap();
        await page.waitForFunction(
          (count) =>
            JSON.parse(localStorage.getItem('money-tour.local.v17')).history.filter((message) =>
              message.includes('lance les dés'),
            ).length ===
            count + 1,
          rollsBefore,
        );
        assert.equal(await page.locator('.passive-insurance-notice').isVisible(), true);
        await capture(page, 'insurance-next-roll-while-information-visible');
        return {
          insuranceArrivalIsPassive: true,
          stagedSeq: insuranceSave.state.seq,
          beforeRollSeq: beforeRoll.seq,
          insuranceTile,
          confirmedProperty: (await state(page)).players[0].insurance.tile,
          confirmationStillVisibleDuringNextRoll: true,
          noAcknowledgementRequired: true,
        };
      },
    );
  } finally {
    await insurance.context.close();
  }
  assert.deepEqual(report.errors, [], 'No browser runtime errors');
} catch (error) {
  if (!report.failures.length) report.failures.push({ message: error.message, stack: error.stack });
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await write();
  await browser.close();
  app.close();
}
