/** Android browser functional acceptance. Uses real WebGL, touch input, ordinary UI and
 * validated production saves. This does not replace APK/emulator/device acceptance.
 * ANDROID_QA_URL targets an already-running app (e.g. a production preview).
 * ANDROID_QA_CASES is a comma-separated list; ANDROID_QA_SCREENS uses 360x640,851x393.
 * External requests are blocked for local scenarios: local play must need no service.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { tsImport } from 'tsx/esm/api';
import { qaServer } from './qa-server.mjs';
import { createActionFixture, actionFixtureNames } from './qa-action-fixtures.mjs';
import { createPlayerFixture } from './qa-player-fixtures.mjs';

const {
  validateState,
  getLegalActions,
  getPropertyValue,
  getPurchaseQuote,
  getConstructionQuote,
  getBuyoutQuote,
  reduceGame,
} = await tsImport('../packages/engine/src/index.ts', import.meta.url);
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.ANDROID_QA_OUT ?? 'artifacts/android-qa/functional');
const screens = (process.env.ANDROID_QA_SCREENS ?? '360x640,851x393')
  .split(',')
  .map((value) => value.split('x').map(Number));
const requested = process.env.ANDROID_QA_CASES?.split(',');
const app = await qaServer(process.env.ANDROID_QA_URL, 4204);
const systemChromium = await fs.access('/usr/bin/chromium').then(
  () => '/usr/bin/chromium',
  () => undefined,
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? systemChromium,
  args: [
    '--no-sandbox',
    '--enable-webgl',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const report = {
  startedAt: new Date().toISOString(),
  url: app.url,
  browser: browser.version(),
  environment: 'Desktop Chromium, emulated Android viewport and touchscreen, real software WebGL.',
  externalServicesBlocked: true,
  limitations: [
    'Browser tests do not certify native Android system integration or physical GPU performance.',
    'No physical-phone, multi-network WebRTC or TURN availability is represented by this run.',
  ],
  checks: [],
  screenshots: [],
  pageErrors: [],
  failures: [],
};
await fs.mkdir(out, { recursive: true });
const write = () => fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
async function capture(page, name, stage) {
  const filename = `${name}-${stage}.png`;
  await page.screenshot({ path: path.join(out, filename), animations: 'disabled', timeout: 20000 });
  report.screenshots.push(filename);
}
async function state(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.local.v17')).state);
}
async function changed(page, predicate, description) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const next = await state(page);
    if (predicate(next)) return next;
    await page.waitForTimeout(80);
  }
  assert.fail(description);
}
async function ready(page) {
  await page.locator('.board-canvas canvas').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector('.board-hit-polygons polygon')?.getAttribute('points')?.length > 10,
  );
  assert.equal(await page.locator('.board-fallback').count(), 0, 'The real WebGL board renders');
  await page.locator('.turn-banner').waitFor({ state: 'hidden', timeout: 20000 });
}
async function geometry(page) {
  const result = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > innerWidth + 2,
    dialogs: [...document.querySelectorAll('dialog[open]')].map((dialog) => {
      const box = dialog.getBoundingClientRect();
      return {
        title:
          document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent ??
          dialog.getAttribute('aria-label'),
        fits:
          box.left >= -1 &&
          box.top >= -1 &&
          box.right <= innerWidth + 1 &&
          box.bottom <= innerHeight + 1,
        overflowX: dialog.scrollWidth > dialog.clientWidth + 2,
      };
    }),
  }));
  assert.equal(result.overflowX, false, 'No page horizontal overflow');
  for (const dialog of result.dialogs) {
    assert(dialog.fits && !dialog.overflowX, `Dialog fits: ${dialog.title}`);
    assert(dialog.title, 'Every dialog is named');
  }
  return result;
}
async function tap(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.tap();
}
async function open(page, save) {
  if (save) assert.deepEqual(validateState(save.state), [], 'Fixture uses valid production rules');
  await page.context().addInitScript((save) => {
    if (sessionStorage.getItem('android-qa-initialized')) return;
    sessionStorage.setItem('android-qa-initialized', 'yes');
    localStorage.clear();
    localStorage.setItem('money-tour.language.v1', 'fr');
    localStorage.setItem(
      'money-tour.comfort',
      JSON.stringify({ pace: 'fast', boardZoom: 100, largeText: false }),
    );
    localStorage.setItem(
      'money-tour.audio',
      JSON.stringify({ music: false, effects: false, volume: 0.5 }),
    );
    if (save) localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
  }, save ?? null);
  await page.goto(app.url);
  if (save) {
    await tap(
      page.getByRole('button', {
        name: save.state.winner ? 'Revoir le dernier résultat' : /Reprendre ma partie$/,
      }),
    );
    await ready(page);
  } else {
    await page.getByRole('group', { name: 'Mode de jeu', exact: true }).waitFor();
  }
}
async function boardTap(page, tile) {
  await page.evaluate(() => {
    window.__androidQaBoardEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'click'])
      document.addEventListener(
        type,
        (event) =>
          window.__androidQaBoardEvents.push({
            type,
            target: event.target.getAttribute?.('aria-label') ?? event.target.tagName,
            x: event.clientX,
            y: event.clientY,
          }),
        { once: true, capture: true },
      );
  });
  const point = await page.locator('.board-hit-polygons').evaluate((svg, tile) => {
    const polygon = svg.querySelectorAll('polygon')[tile];
    const bounds = svg.getBoundingClientRect();
    const vertices = [...polygon.points];
    const center = {
      x: vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length,
      y: vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length,
    };
    const samples = [
      center,
      ...vertices.map((v) => ({
        x: center.x + (v.x - center.x) * 0.5,
        y: center.y + (v.y - center.y) * 0.5,
      })),
    ];
    return samples
      .map((p) => ({
        x: bounds.x + (p.x * bounds.width) / 100,
        y: bounds.y + (p.y * bounds.height) / 100,
      }))
      .find((p) => document.elementFromPoint(p.x, p.y) === polygon);
  }, tile);
  assert(point, `Board tile ${tile} has a reachable touch target`);
  await page.touchscreen.tap(point.x, point.y);
  const events = await page.evaluate(() => window.__androidQaBoardEvents);
  console.log(`BOARD TOUCH ${JSON.stringify({ tile, point, events })}`);
}

async function homeAndSettings(page, name) {
  await open(page);
  const modes = page.getByRole('group', { name: 'Mode de jeu', exact: true });
  assert.deepEqual(await modes.getByRole('button').allTextContents(), [
    'Entre amis',
    '2v2',
    'Solo & bots',
  ]);
  for (const mode of ['2v2', 'Solo & bots', 'Entre amis']) {
    await tap(modes.getByRole('button', { name: mode, exact: true }));
    if (mode === '2v2')
      assert.equal(await page.getByRole('combobox', { name: /^Voyageurs/ }).isDisabled(), true);
  }
  await page.locator('.duration-picker select').selectOption('custom');
  await page.getByLabel('Durée personnalisée en minutes').fill('0');
  assert.equal(
    await page.locator('.primary.launch').isDisabled(),
    true,
    'Invalid duration cannot start',
  );
  await page.getByLabel('Durée personnalisée en minutes').fill('5');
  assert.equal(await page.locator('.primary.launch').isDisabled(), false);
  await tap(page.getByRole('button', { name: 'Réglages', exact: true }));
  const settings = page.getByRole('dialog', { name: 'Votre confort de voyage', exact: true });
  await settings.waitFor();
  await geometry(page);
  await tap(settings.getByLabel('Textes agrandis', { exact: false }));
  await settings.getByLabel('Zoom du plateau', { exact: true }).fill('150');
  await capture(page, name, 'settings');
  await tap(settings.getByRole('button', { name: 'Terminé', exact: true }));
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.comfort')));
  assert.equal(prefs.largeText, true);
  assert.equal(prefs.boardZoom, 150);
  await page.reload();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.comfort'))),
    prefs,
    'Comfort preferences survive restart',
  );
  await geometry(page);
  return { modes: 3, durationValidation: true, settingsPersist: true };
}
async function newGame(page, name, mode = 'Solo & bots') {
  await open(page);
  await tap(page.getByRole('button', { name: mode, exact: true }));
  if (mode !== '2v2') await page.getByRole('combobox', { name: /^Voyageurs/ }).selectOption('2');
  await page.getByLabel('Nom du joueur 1', { exact: true }).fill('Android QA');
  await tap(page.getByRole('button', { name: /Jouer sur cet appareil/ }));
  const adventure = page.getByRole('button', { name: 'Compris', exact: true });
  if (await adventure.isVisible({ timeout: 3000 }).catch(() => false)) await tap(adventure);
  await ready(page);
  if (await adventure.isVisible().catch(() => false)) await tap(adventure);
  const initial = await state(page);
  assert.equal(initial.mode, mode === '2v2' ? 'teams' : 'free-for-all');
  assert.equal(initial.players.length, mode === '2v2' ? 4 : 2);
  await capture(page, name, 'started');
  await tap(page.getByRole('button', { name: 'Quitter la partie', exact: true }));
  await page
    .getByRole('dialog', { name: 'Voulez-vous quitter la partie ?', exact: true })
    .waitFor();
  await tap(page.getByRole('button', { name: 'Accueil et sauvegarde', exact: true }));
  await page.reload();
  await tap(page.getByRole('button', { name: /Reprendre ma partie$/ }));
  await ready(page);
  const resumed = await state(page);
  assert.deepEqual(
    resumed.players.map((p) => p.id),
    initial.players.map((p) => p.id),
  );
  assert.equal(resumed.mode, initial.mode);
  await capture(page, name, 'resumed');
  return {
    newGame: true,
    mode: initial.mode,
    players: initial.players.length,
    restartResume: true,
  };
}
async function tutorial(page, name) {
  await open(page);
  await tap(page.getByRole('button', { name: /Comment jouer/ }));
  await tap(page.getByRole('button', { name: 'Démarrer le tutoriel interactif', exact: true }));
  await page.getByRole('dialog', { name: 'Partie guidée', exact: true }).waitFor();
  await geometry(page);
  await tap(page.getByRole('button', { name: 'Toutes les leçons (27)', exact: true }));
  const lessons = page.getByLabel('Choisir une leçon', { exact: true });
  assert.equal(await lessons.locator('option').count(), 27);
  await lessons.selectOption('1');
  await tap(
    page.locator('.guided-tutorial').getByRole('button', { name: 'Lancer les dés', exact: true }),
  );
  await page.locator('.tutorial-task').filter({ hasText: /^✓/ }).waitFor({ timeout: 15000 });
  await capture(page, name, 'tutorial-roll');
  await tap(page.getByRole('button', { name: 'Quitter le tutoriel', exact: true }));
  assert.equal(
    await page.evaluate(() => localStorage.getItem('money-tour.local.v17')),
    null,
    'Tutorial never changes a saved game',
  );
  return { lessons: 27, realRoll: true, noSaveMutation: true };
}
async function purchase(page, name, variant) {
  const fixture = createActionFixture('purchase');
  fixture.save.state.players[0].laps = 1;
  if (variant === 'insufficient') fixture.save.state.players[0].cash = 1;
  await open(page, fixture.save);
  const initial = await state(page);
  const tile = initial.players[0].position;
  const dialog = page.locator('dialog.modal[open]');
  await dialog.waitFor();
  await geometry(page);
  assert.equal(
    await dialog.getByRole('button', { name: /Hôtel.*verrouillé/ }).isDisabled(),
    true,
    'Hotel locked before two completed laps',
  );
  if (variant === 'insufficient') {
    assert.equal(await dialog.locator('.purchase-cta').isDisabled(), true);
    await dialog.getByRole('status').filter({ hasText: 'Fonds insuffisants' }).waitFor();
    await capture(page, name, 'blocked-with-explanation');
    await tap(dialog.locator('.purchase-pass'));
    const next = await changed(page, (s) => s.phase !== 'property', 'Decline completes decision');
    assert.equal(next.players[0].cash, initial.players[0].cash);
    return { insufficientBlocked: true, passAvailable: true, noCharge: true };
  }
  await tap(dialog.getByRole('button', { name: /^2 maisons :/ }));
  const quote = getPurchaseQuote(initial, 2);
  await capture(page, name, 'two-houses');
  await tap(dialog.locator('.purchase-cta'));
  const next = await changed(page, (s) => s.properties[tile].ownerId === 'p1', 'Purchase is saved');
  assert.equal(next.properties[tile].level, 2);
  assert.equal(
    next.players[0].cash,
    initial.players[0].cash - quote.total,
    'Land and houses paid once',
  );
  return { bought: tile, level: 2, charged: quote.total };
}
async function action(page, name, kind) {
  const fixture = createActionFixture(kind);
  await open(page, fixture.save);
  const initial = await state(page);
  if (kind === 'festival' || kind === 'travel') {
    const type = kind === 'festival' ? 'place_championship' : 'travel';
    const targets = getLegalActions(initial).filter((a) => a.type === type);
    const choice =
      kind === 'festival'
        ? targets[0]
        : targets.find(
            (a) =>
              a.tile > initial.players[0].position &&
              initial.config.board[a.tile].type === 'city' &&
              !initial.properties[a.tile].ownerId,
          );
    assert(choice, 'Fixture has a legal target');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await capture(page, name, 'board-choice');
    await boardTap(page, choice.tile);
    const next = await changed(
      page,
      (s) =>
        kind === 'festival'
          ? s.properties[choice.tile].championships > 0
          : s.players[0].position === choice.tile && !s.players[0].travelPending,
      `${kind} touch resolves`,
    );
    assert.equal(
      next.players[0].cash,
      initial.players[0].cash -
        (kind === 'festival' ? initial.config.championshipFee : initial.config.travelFee),
    );
    return { target: choice.tile, directTouch: true, feeAppliedOnce: true };
  }
  if (kind === 'insurance')
    await tap(page.getByRole('button', { name: /Choisir un bien à assurer/ }));
  const card = page.locator('.action-card-dialog[open]');
  await card.waitFor();
  await geometry(page);
  await capture(page, name, 'decision');
  if (kind === 'duel') {
    await card.getByRole('spinbutton').fill('100');
    await tap(card.getByRole('button', { name: /Défier Max/ }));
    await changed(page, (s) => s.duel?.stage === 'accept', 'Duel offer recorded');
    await tap(card.getByRole('button', { name: /Accepter et miser/ }));
    await changed(page, (s) => s.duel?.stage === 'commit', 'Duel accepted');
    await tap(card.getByRole('button', { name: /^Pierre/ }));
    await changed(
      page,
      (s) => Object.keys(s.duel?.commitments ?? {}).length === 1,
      'First secret choice recorded',
    );
    await tap(card.getByRole('button', { name: /^Ciseaux/ }));
    const next = await changed(
      page,
      (s) => !s.duel,
      'Duel automatically reveals both hands and resolves',
    );
    assert.equal(next.players[0].cash, initial.players[0].cash + 100);
    assert.equal(next.players[1].cash, initial.players[1].cash - 100);
    return {
      offer: 100,
      accept: true,
      secretChoices: 2,
      automaticReveal: true,
      correctTransfer: true,
    };
  }
  if (kind === 'debt') {
    await tap(card.getByRole('button', { name: 'Réduire pour voir le plateau', exact: true }));
    await card.waitFor({ state: 'hidden' });
    await tap(page.getByRole('button', { name: /^Reprendre la vente/ }));
    let current = initial;
    let value = 0;
    const sold = [];
    while (current.phase === 'debt') {
      const sale = getLegalActions(current).find((a) => a.type === 'sell');
      assert(sale && sold.length < 8, 'Debt has a bounded legal settlement');
      value += Math.floor(getPropertyValue(current, sale.tile) * current.config.resaleRate);
      await tap(
        card
          .locator('.debt-card-choices button')
          .filter({ hasText: current.config.board[sale.tile].name })
          .first(),
      );
      current = await changed(
        page,
        (s) => s.properties[sale.tile].ownerId === null,
        'Selected property sold',
      );
      sold.push(sale.tile);
    }
    assert.equal(current.debt, null);
    assert.equal(current.players[0].cash, initial.players[0].cash + value - initial.debt.amount);
    return { minimizeRestore: true, sold, debt: initial.debt.amount, settledOnce: true };
  }
  const choice = {
    insurance: () => card.locator('.action-card-content button').first(),
    attack: () => card.locator('.action-card-content button').first(),
    casino: () => card.getByRole('button', { name: /Choisir rouge/ }),
    slots: () => card.getByRole('button', { name: /Lancer les rouleaux/ }),
    island: () => card.getByRole('button', { name: /Quitter l’île/ }),
    alliance: () => card.getByRole('button', { name: /Choisir Max/ }),
    rent: () => card.getByRole('button', { name: /Squatteur/ }),
  }[kind];
  assert(choice, `Action implemented: ${kind}`);
  await tap(choice());
  await changed(
    page,
    (s) => {
      switch (kind) {
        case 'insurance':
          return s.players[0].insurance?.tile === fixture.owned;
        case 'attack':
          return !s.pendingAttack && s.phase !== 'attack';
        case 'casino':
        case 'slots':
          return !s.casino && s.phase !== 'casino';
        case 'island':
          return s.players[0].islandTurns === null;
        case 'alliance':
          return s.alliance?.targetId === 'p2';
        case 'rent':
          return !s.pendingRent && !s.players[0].heldCards?.length;
        default:
          return false;
      }
    },
    `${kind} ordinary touch action changes saved state`,
  );
  return { realTouch: true, actionSaved: true };
}
async function auction(page, name) {
  const fixture = createPlayerFixture('two');
  const s = fixture.save.state;
  const free = s.config.board.find((t) => t.type === 'city' && !s.properties[t.id].ownerId);
  s.phase = 'auction';
  s.currentPlayer = 0;
  s.auction = {
    id: `android-qa-auction-${Date.now()}`,
    tile: free.id,
    kind: 'tender',
    resume: 'roll',
    participants: ['p1', 'p2'],
    stage: 'commit',
    commitments: {},
    bids: {},
    passed: [],
  };
  await open(page, fixture.save);
  let card = page.locator('dialog[open]:has(.auction-view)');
  await card.waitFor();
  await geometry(page);
  await tap(card.getByRole('button', { name: /Je suis Léa/ }));
  await card.getByLabel('Votre offre secrète', { exact: true }).fill('73');
  await capture(page, name, 'secret-offer');
  await tap(card.getByRole('button', { name: /Envoyer mon offre/ }));
  await changed(page, (s) => !!s.auction?.commitments.p1, 'Secret auction offer committed');
  card = page.locator('dialog[open]:has(.auction-view)');
  await tap(card.getByRole('button', { name: /Ne pas participer/ }));
  const next = await changed(
    page,
    (s) => !s.auction && s.properties[free.id].ownerId === 'p1',
    'Auction automatically reveals and awards property',
  );
  assert.equal(next.players[0].cash, s.players[0].cash - 73);
  return { bid: 73, otherPlayerPassed: true, automaticReveal: true, correctOwnerAndCharge: true };
}
async function propertyEconomy(page, name, kind) {
  const fixture = createActionFixture('purchase');
  const s = fixture.save.state;
  const position = s.players[0].position;
  s.players[0].laps = 2;
  if (kind === 'upgrade') s.properties[position] = { ownerId: 'p1', level: 3, championships: 0 };
  if (kind === 'buyout') s.properties[position] = { ownerId: 'p2', level: 1, championships: 0 };
  if (kind === 'fraud') {
    const card = s.config.cards.find((card) => card.effect === 'fraud').id;
    s.deck = s.deck.filter((id) => id !== card);
    s.discard = s.discard.filter((id) => id !== card);
    s.players[0].heldCards = [...(s.players[0].heldCards ?? []), card];
  }
  await open(page, fixture.save);
  if (kind === 'buyout') await tap(page.getByRole('button', { name: /^Racheter ·/ }));
  const dialog = page.locator('dialog.modal[open]');
  await dialog.waitFor();
  await geometry(page);
  const level = kind === 'upgrade' ? 4 : 2;
  const quote =
    kind === 'upgrade'
      ? getConstructionQuote(s, level)
      : kind === 'buyout'
        ? getBuyoutQuote(s, level)
        : getPurchaseQuote(s, level, true);
  assert(quote.canBuy);
  await tap(dialog.getByRole('button', { name: level === 4 ? /^Hôtel :/ : /^2 maisons :/ }));
  await capture(page, name, 'quote');
  await tap(dialog.locator(kind === 'fraud' ? '.purchase-fraud' : '.purchase-cta'));
  const next = await changed(
    page,
    (next) =>
      next.properties[position].ownerId === 'p1' && next.properties[position].level === level,
    `${kind} updates ownership and buildings`,
  );
  assert.equal(next.players[0].cash, s.players[0].cash - quote.total, `${kind}: exact quoted cost`);
  if (kind === 'buyout')
    assert.equal(
      next.players[1].cash,
      s.players[1].cash + quote.land,
      'Seller receives only existing property value',
    );
  if (kind === 'fraud') {
    assert(next.players[0].fraudLiability > 0, 'Fraud tax liability retained');
    assert.equal(next.players[0].heldCards.length, 0, 'Fraud card consumed once');
  }
  assert.notEqual(next.phase, 'property', 'One construction or purchase per visit');
  return { kind, level, charged: quote.total, exactQuote: true, singleVisitDecision: true };
}
async function profilesAndPause(page, name) {
  const fixture = createPlayerFixture('two');
  await open(page, fixture.save);
  await tap(page.getByRole('button', { name: 'Pause', exact: true }));
  await page.getByRole('button', { name: 'Reprendre', exact: true }).waitFor();
  const paused = await state(page);
  await page.waitForTimeout(1200);
  assert.equal((await state(page)).elapsedMs, paused.elapsedMs, 'Pause freezes game clock');
  await tap(page.getByRole('button', { name: 'Voir le profil de Léa', exact: true }));
  const profile = page.locator('.player-details-dialog[open]');
  await profile.waitFor();
  await geometry(page);
  assert.equal(
    await profile.locator('.player-details-rule').count(),
    1,
    'Special rule can be read in profile',
  );
  const objective = profile.getByRole('button', { name: /voir mon objectif secret/ });
  const hasObjective = (await objective.count()) > 0;
  if (hasObjective) {
    await tap(objective);
    await tap(profile.getByRole('button', { name: 'Masquer mon objectif', exact: true }));
  }
  const firstProperty = profile.locator('.mini-property').first();
  const propertyName = await firstProperty.locator('b').innerText();
  await tap(firstProperty);
  const inspection = page.getByRole('dialog', { name: propertyName, exact: true });
  await inspection.waitFor();
  await geometry(page);
  await capture(page, name, 'property-inspection');
  await tap(inspection.getByRole('button', { name: 'Retour au plateau', exact: true }));
  assert.deepEqual(
    (await state(page)).properties,
    paused.properties,
    'Inspection never changes owned assets',
  );
  await tap(page.getByRole('button', { name: 'Reprendre', exact: true }));
  await changed(page, (s) => s.elapsedMs > paused.elapsedMs, 'Resume restarts game clock');
  return {
    clockPausedResumed: true,
    playerProfile: true,
    secretObjectiveToggle: hasObjective,
    propertyInspectionReadOnly: true,
  };
}
async function history(page, name) {
  const fixture = createPlayerFixture('two');
  fixture.save.history = Array.from(
    { length: 80 },
    (_, i) => `Action publique de recette ${80 - i}`,
  );
  await open(page, fixture.save);
  await tap(page.getByRole('button', { name: 'Pause', exact: true }));
  await page.getByRole('button', { name: 'Reprendre', exact: true }).waitFor();
  const disclosure = page.locator('.live-actions summary');
  await tap(disclosure);
  assert.equal(await page.locator('.live-actions').getAttribute('open'), '');
  assert.equal(
    await page.locator('.live-actions ol li').count(),
    3,
    'HUD keeps the three most recent public actions',
  );
  const all = page.getByRole('button', { name: 'Toutes les actions ↗', exact: true });
  await tap(all);
  const journal = page.getByRole('dialog', { name: 'Journal des actions', exact: true });
  await journal.waitFor();
  await geometry(page);
  assert.equal(
    await journal.locator('.action-history li').count(),
    80,
    'Complete public history is available',
  );
  const scrolled = await journal.locator('.modal-body').evaluate((body) => {
    body.scrollTop = body.scrollHeight;
    return body.scrollTop > 0;
  });
  assert(scrolled, 'Long history scrolls inside its dialog');
  await capture(page, name, 'history-scrolled');
  await tap(journal.getByRole('button', { name: 'Fermer', exact: true }));
  await journal.waitFor({ state: 'hidden' });
  await tap(disclosure);
  assert.equal(
    await page.locator('.live-actions').getAttribute('open'),
    null,
    'History disclosure can collapse again',
  );
  return {
    disclosure: true,
    recentEntries: 3,
    allEntries: 80,
    innerScroll: true,
    closeAndCollapse: true,
  };
}
async function resultsAndRematch(page, name) {
  const fixture = createPlayerFixture('two');
  fixture.save.state = reduceGame(fixture.save.state, {
    type: 'tick',
    elapsedMs: fixture.save.state.durationMs,
  }).state;
  const s = fixture.save.state;
  await open(page, fixture.save);
  const card = page.getByRole('dialog', { name: 'Une fortune à célébrer !', exact: true });
  await card.waitFor();
  await geometry(page);
  assert.equal(await page.getByRole('region', { name: 'Bilan du voyage', exact: true }).count(), 1);
  await capture(page, name, 'results');
  await tap(card.getByRole('button', { name: 'Revanche avec les mêmes joueurs', exact: true }));
  const next = await changed(
    page,
    (s) => !s.winner && s.turn === 1,
    'Rematch creates a fresh game',
  );
  assert.deepEqual(
    next.players.map((p) => p.name),
    s.players.map((p) => p.name),
  );
  assert.equal(next.durationMs, s.durationMs);
  return { resultsReadable: true, rematch: true, samePlayersAndDuration: true };
}
async function invitationValidation(page, name) {
  await open(page);
  await tap(page.getByRole('button', { name: 'Rejoindre un salon', exact: true }));
  await page.getByLabel('Votre nom', { exact: true }).fill('Android QA');
  await page.getByLabel('Lien d’invitation', { exact: true }).fill('bad-link');
  await tap(page.getByRole('button', { name: 'Rejoindre le salon', exact: true }));
  await page
    .getByRole('alert')
    .filter({ hasText: 'Collez le lien d’invitation complet envoyé par votre ami.' })
    .waitFor();
  await geometry(page);
  await capture(page, name, 'invalid-invite');
  return {
    invalidInvitationExplained: true,
    noFalseJoin: true,
    onlineTransport: 'Not exercised: external services blocked',
  };
}

const cases = [
  ['home-settings', homeAndSettings],
  ['solo', (page, name) => newGame(page, name)],
  ['hotseat', (page, name) => newGame(page, name, 'Entre amis')],
  ['teams', (page, name) => newGame(page, name, '2v2')],
  ['tutorial', tutorial],
  ['purchase', purchase],
  ['insufficient', (page, name) => purchase(page, name, 'insufficient')],
  ...['upgrade', 'buyout', 'fraud'].map((kind) => [
    kind,
    (page, name) => propertyEconomy(page, name, kind),
  ]),
  ['profiles-pause', profilesAndPause],
  ['history', history],
  ...actionFixtureNames
    .filter((kind) => kind !== 'purchase')
    .map((kind) => [kind, (page, name) => action(page, name, kind)]),
  ['auction', auction],
  ['results-rematch', resultsAndRematch],
  ['invitation-validation', invitationValidation],
];
try {
  for (const [width, height] of screens) {
    for (const [kind, run] of cases) {
      if (requested && !requested.includes(kind)) continue;
      const name = `${kind}-fr-${width}x${height}`;
      console.log(`START ${name}`);
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        return url.hostname === new URL(app.url).hostname ||
          ['data:', 'blob:'].includes(url.protocol)
          ? route.continue()
          : route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => report.pageErrors.push({ name, message: error.message }));
      try {
        const details = await run(page, name);
        assert.equal(
          report.pageErrors.filter((error) => error.name === name).length,
          0,
          'No application exception',
        );
        await geometry(page);
        report.checks.push({ name, passed: true, ...details });
        console.log(`PASS ${name}`);
      } catch (error) {
        report.failures.push({
          name,
          message: error.message,
          stack: error.stack,
          state: await state(page).catch(() => null),
        });
        await capture(page, name, 'failure').catch(() => {});
        console.error(`FAIL ${name}: ${error.message}`);
      } finally {
        await context.close();
        await write();
      }
    }
  }
  assert.deepEqual(report.failures, [], 'All Android browser functional cases pass');
  assert.deepEqual(report.pageErrors, [], 'No browser application exceptions');
} finally {
  report.finishedAt = new Date().toISOString();
  await write();
  await browser.close();
  app.close();
}
