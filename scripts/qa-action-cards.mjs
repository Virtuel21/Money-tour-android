/** Real application acceptance using valid current saves, suitable for dev and public Pages.
 * ACTION_QA_URL / ACTION_QA_OUT reuse a deployment and choose the evidence destination.
 * ACTION_QA_NAMES / ACTION_QA_LANGUAGES / ACTION_QA_SCREENS can select a smaller smoke run.
 * ACTION_QA_PROFILE=release selects 42 representative cases; public selects 21.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { qaServer } from './qa-server.mjs';
import {
  actionFixtureNames,
  actionStateSignature,
  createActionFixture,
} from './qa-action-fixtures.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.ACTION_QA_OUT ?? 'artifacts/action-cards');
const names = process.env.ACTION_QA_NAMES?.split(',') ?? actionFixtureNames;
const languages = process.env.ACTION_QA_LANGUAGES?.split(',') ?? ['fr', 'en'];
const screens = process.env.ACTION_QA_SCREENS?.split(',').map((screen) =>
  screen.split('x').map(Number),
) ?? [
  [1280, 900],
  [390, 844],
  [320, 740],
  [844, 390],
];
const fixtures = names.map(createActionFixture);
const results = {
  startedAt: new Date().toISOString(),
  url: '',
  checks: [],
  frames: [],
  accessibility: [],
  errors: [],
  failures: [],
};
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.ACTION_QA_URL, 4187);
results.url = app.url;
const browser = await chromium.launch({ headless: true });
let saving = Promise.resolve();
const saveResults = () => {
  const contents = JSON.stringify(results, null, 2) + '\n';
  saving = saving.then(() => fs.writeFile(path.join(out, 'results.json'), contents));
  return saving;
};
const cardSelector = '.action-card-dialog';

async function capture(page, name, stage) {
  const filename = `${name}-${stage}.png`;
  await page.screenshot({ path: path.join(out, filename), animations: 'allow' });
  results.frames.push({ name, stage, filename });
}

async function savedState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.local.v17')).state);
}

async function openFixture(page, fixture, language, largeText) {
  // The regular loader validates this save, and the regular resume button opens the game.
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
  const resume = page.getByRole('button', {
    name: language === 'fr' ? /Reprendre ma partie$/ : /Resume my game$/,
  });
  await resume.waitFor({ state: 'visible', timeout: 45000 });
  await resume.click();
  assert.equal((await savedState(page)).phase, fixture.expectedPhase);
  if (fixture.name === 'insurance') {
    await page
      .getByRole('button', {
        name: language === 'fr' ? /Choisir un bien à assurer/ : /Choose a property to insure/,
      })
      .click();
  }
  if (fixture.name === 'travel') {
    await page
      .getByRole('button', {
        name: language === 'fr' ? /Choisir ma destination/ : /Choose my destination/,
      })
      .click();
  }
}

async function finishEntrance(dialog) {
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => {
          const timing = animation.effect?.getComputedTiming();
          return timing && timing.iterations !== Infinity;
        })
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

async function auditCard(page) {
  return new AxeBuilder({ page })
    .include(cardSelector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
}

async function geometry(dialog) {
  const details = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const body = element.querySelector('.action-card-content');
    const footer = element.querySelector('.action-card-footer');
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const buttons = [...element.querySelectorAll('button')].filter((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.width && bounds.height;
    });
    const visible = buttons.filter((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight;
    });
    return {
      fits:
        box.left >= -1 &&
        box.top >= -1 &&
        box.right <= innerWidth + 1 &&
        box.bottom <= innerHeight + 1,
      noHorizontalOverflow:
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        body.scrollWidth <= body.clientWidth + 1,
      bodyHeight: body.clientHeight,
      bodyScrolls: body.scrollHeight > body.clientHeight + 1,
      ctaVisible: visible.length > 0,
      footer: footer ? rect(footer) : null,
      smallTargets: buttons
        .filter((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.width < 43 || bounds.height < 43;
        })
        .map((button) => ({ name: button.textContent.trim(), ...rect(button) })),
      labelled: !!document.getElementById(element.getAttribute('aria-labelledby'))?.textContent,
    };
  });
  assert(details.fits, 'Card must fit the viewport');
  assert(details.noHorizontalOverflow, 'Card must not overflow horizontally');
  assert(details.ctaVisible, 'At least one action must remain visible without scrolling');
  assert(details.bodyHeight >= 70, `Insufficient readable card body: ${details.bodyHeight}`);
  assert(details.labelled, 'Card must have an accessible title');
  assert.deepEqual(details.smallTargets, [], 'Actions must have 44px touch targets');
  if (details.footer)
    assert(
      details.footer.top >= 0 &&
        details.footer.bottom <= (await dialog.page().viewportSize()).height,
      'The card footer must remain visible',
    );
  if (details.bodyScrolls) {
    const scrolls = await dialog.locator('.action-card-content').evaluate((body) => {
      body.scrollTop = body.scrollHeight;
      const moved = body.scrollTop > 0;
      body.scrollTop = 0;
      return moved;
    });
    assert(scrolls, 'Long card content must scroll');
  }
  return details;
}

async function pickAction(dialog, fixture, language) {
  const fr = language === 'fr';
  switch (fixture.name) {
    case 'duel':
      await dialog.getByRole('spinbutton').fill('100');
      return dialog.getByRole('button', { name: fr ? /Défier Max/ : /Challenge Max/ });
    case 'festival':
    case 'insurance':
    case 'attack':
    case 'debt':
      return dialog.locator('.action-card-content button').first();
    case 'casino':
      return dialog.getByRole('button', { name: fr ? /Choisir rouge/ : /Choose red/ });
    case 'slots':
      return dialog.getByRole('button', { name: fr ? /Lancer les rouleaux/ : /Spin the reels/ });
    case 'travel':
      return dialog.locator('.action-card-content button').first();
    case 'island':
      return dialog.getByRole('button', { name: fr ? /Quitter l’île/ : /Leave the island/ });
    case 'alliance':
      return dialog.getByRole('button', { name: fr ? /Choisir Max/ : /Choose Max/ });
    case 'rent':
      return dialog.getByRole('button', { name: fr ? /Squatteur/ : /Squatter/ });
    default:
      throw new Error(`No interaction for ${fixture.name}`);
  }
}

async function assertAfterAction(page, fixture) {
  const matches = (state) => {
    switch (fixture.name) {
      case 'duel':
        return (
          state.duel?.stage === 'accept' &&
          state.duel.targetId === 'p2' &&
          state.duel.amount === 100
        );
      case 'festival':
        return Object.values(state.properties).some(
          (property) => property.ownerId === 'p1' && property.championships > 0,
        );
      case 'insurance':
        return state.players[0].insurance?.tile === fixture.owned;
      case 'casino':
      case 'slots':
        return !state.casino && state.phase !== 'casino';
      case 'travel':
        return state.phase !== 'travel' && !state.players[0].travelPending;
      case 'island':
        return state.players[0].islandTurns === null;
      case 'alliance':
        return state.alliance?.targetId === 'p2';
      case 'rent':
        return !state.pendingRent && !state.players[0].heldCards?.length;
      case 'attack':
        return !state.pendingAttack && state.phase !== 'attack';
      case 'debt':
        return state.properties[fixture.owned]?.ownerId === null;
      default:
        return false;
    }
  };
  const deadline = Date.now() + 10000;
  do {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (matches(await savedState(page))) return;
  } while (Date.now() < deadline);
  assert.fail(`${fixture.name}: expected saved engine result after the action`);
}

async function runCase(fixture, language, width, height, reducedMotion = false, largeText = false) {
  const name = `${fixture.name}-${language}-${width}x${height}${reducedMotion ? '-reduced-large' : ''}`;
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => results.errors.push({ name, message: error.message }));
  try {
    await openFixture(page, fixture, language, largeText);
    if (fixture.name === 'purchase') {
      const purchase = page.locator('dialog.modal[open]');
      await purchase.waitFor({ state: 'visible' });
      assert.equal(await page.locator(cardSelector).count(), 0);
      assert.equal(await purchase.locator('.purchase-simple').count(), 1);
      await capture(page, name, 'purchase-modal');
      results.checks.push({ name, propertyPurchaseRemainsModal: true });
      return;
    }
    const dialog = page.locator(`${cardSelector}[open]`);
    await dialog.waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await page.locator('dialog[open]').count(), 1, 'Only one modal may be open');
    const entrance = await dialog.locator('.drawn-card-motion').evaluate((element) => {
      const style = getComputedStyle(element);
      return { name: style.animationName, seconds: parseFloat(style.animationDuration) };
    });
    if (reducedMotion) assert.equal(entrance.name, 'none', 'Reduced motion disables the arrival');
    else assert(entrance.seconds >= 1.5, 'The physical card arrival lasts at least 1500ms');
    if (!reducedMotion && width === 390 && language === 'fr') {
      await dialog.evaluate((element) => {
        const animation = element.getAnimations({ subtree: true }).find((item) => {
          return item.animationName?.includes('arrive');
        });
        if (animation) {
          animation.pause();
          animation.currentTime = 450;
        }
      });
      await capture(page, name, 'back');
      await dialog.evaluate((element) => {
        for (const animation of element.getAnimations({ subtree: true }))
          if (animation.playState === 'paused') animation.play();
      });
    }
    await finishEntrance(dialog);
    const bounds = await geometry(dialog);
    await capture(page, name, 'front');
    await page.keyboard.press('Tab');
    assert(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
      'Tab focus must remain inside the card',
    );
    await page.keyboard.press('Shift+Tab');
    assert(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
      'Reverse Tab focus must remain inside the card',
    );
    if (process.env.ACTION_QA_AXE !== '0') {
      const audit = await auditCard(page);
      const violations = audit.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target),
      }));
      results.accessibility.push({ name, violations });
      assert.deepEqual(violations, [], 'Automated accessibility audit');
      if (process.env.ACTION_QA_AUDIT_ONLY === '1') {
        results.checks.push({ name, auditOnly: true, ...bounds });
        return;
      }
      // Start a fresh decision after the audit; CPU-heavy analysis must not spend
      // the player's action timeout before the actual integration interaction.
      await openFixture(page, fixture, language, largeText);
      await dialog.waitFor({ state: 'visible' });
      await finishEntrance(dialog);
    }
    const button = await pickAction(dialog, fixture, language);
    const casinoPlay = ['casino', 'slots'].includes(fixture.name);
    const continuousCard = casinoPlay || fixture.name === 'duel';
    const casinoIdentity = continuousCard
      ? await dialog.evaluateHandle((element) => ({
          card: element,
          motion: element.querySelector('.drawn-card-motion'),
          arrival: element
            .getAnimations({ subtree: true })
            .find((animation) => animation.animationName === 'drawn-card-arrive'),
        }))
      : null;
    const before = actionStateSignature(await savedState(page));
    await button.scrollIntoViewIfNeeded();
    if (!reducedMotion && !continuousCard)
      await button.evaluate((button) => {
        window.__actionQaDeparture = null;
        button.addEventListener(
          'click',
          () => {
            setTimeout(() => {
              const element = button.closest('.action-card-dialog');
              window.__actionQaDeparture = {
                state: JSON.parse(localStorage.getItem('money-tour.local.v17')).state,
                leaving: element?.classList.contains('is-leaving'),
                locked:
                  element &&
                  [...element.querySelectorAll('button,input,select')].every((control) =>
                    control.matches(':disabled'),
                  ),
                seconds:
                  element &&
                  parseFloat(
                    getComputedStyle(element.querySelector('.drawn-card-motion')).animationDuration,
                  ),
              };
            }, 180);
          },
          { once: true },
        );
      });
    await button.click();
    if (!reducedMotion && !continuousCard) {
      // Snapshot at 180ms inside the browser, independent of protocol/host latency.
      const departure = await page.evaluate(async () => {
        while (!window.__actionQaDeparture) await new Promise((resolve) => setTimeout(resolve, 20));
        return window.__actionQaDeparture;
      });
      assert.equal(actionStateSignature(departure.state), before, 'Action waits for departure');
      assert.equal(departure.leaving, true);
      assert(departure.locked, 'Controls lock during departure to prevent double actions');
      assert(departure.seconds >= 0.8, 'The physical card departure lasts at least 800ms');
      if (width === 390 && language === 'fr') await capture(page, name, 'departure');
    }
    await assertAfterAction(page, fixture);
    if (fixture.name === 'duel') {
      const continuity = await dialog.evaluate(
        (element, original) => ({
          sameCard: element === original.card,
          sameMotion: element.querySelector('.drawn-card-motion') === original.motion,
          leaving: element.classList.contains('is-leaving'),
        }),
        casinoIdentity,
      );
      assert.deepEqual(continuity, { sameCard: true, sameMotion: true, leaving: false });
      await casinoIdentity.dispose();
    }
    if (casinoPlay) {
      const resultCard = page.locator(`${cardSelector}:has(.casino-playing)`);
      await resultCard.waitFor({ state: 'visible', timeout: 10000 });
      const continuity = await resultCard.evaluate((element, original) => {
        const arrival = element
          .getAnimations({ subtree: true })
          .find((animation) => animation.animationName === 'drawn-card-arrive');
        return {
          sameCard: element === original.card,
          sameMotion: element.querySelector('.drawn-card-motion') === original.motion,
          sameArrival: arrival === original.arrival,
          leaving: element.classList.contains('is-leaving'),
        };
      }, casinoIdentity);
      assert.deepEqual(
        continuity,
        {
          sameCard: true,
          sameMotion: true,
          sameArrival: true,
          leaving: false,
        },
        'Playing the casino retains the card without repeating its arrival',
      );
      await geometry(resultCard);
      assert.equal(await page.locator('dialog[open]').count(), 1);
      if (width === 390 && language === 'fr') await capture(page, name, 'casino-result');
      await resultCard
        .getByRole('button', { name: language === 'fr' ? /Passer l’animation/ : /Skip animation/ })
        .evaluate((button) => button.click());
      await resultCard.waitFor({ state: 'detached', timeout: 5000 });
      await casinoIdentity.dispose();
    }
    results.checks.push({
      name,
      ...bounds,
      deferredAction: !reducedMotion && !continuousCard,
      ...(casinoPlay ? { continuousCasinoCard: true } : {}),
      afterAction: true,
      clock: 'real',
    });
  } catch (error) {
    results.failures.push({
      name,
      message: error.message,
      stack: error.stack,
      state: await savedState(page).catch(() => null),
    });
    await capture(page, name, 'failure').catch(() => undefined);
    if (process.env.ACTION_QA_FAIL_FAST === '1') throw error;
  } finally {
    await context.close();
    await saveResults();
  }
}

try {
  const cases = [];
  const profile = process.env.ACTION_QA_PROFILE;
  const keyNames = ['duel', 'festival', 'insurance', 'casino', 'travel', 'debt'];
  if (['release', 'public'].includes(profile)) {
    for (const fixture of fixtures) cases.push([fixture, 'fr', 390, 844]);
    for (const fixture of fixtures.filter(
      (entry) => profile === 'release' || keyNames.includes(entry.name),
    ))
      cases.push([fixture, 'en', 844, 390]);
    if (profile === 'release')
      for (const fixture of fixtures.filter((entry) => keyNames.includes(entry.name)))
        cases.push([fixture, 'fr', 1280, 900]);
  } else {
    for (const language of languages)
      for (const [width, height] of screens)
        for (const fixture of fixtures) cases.push([fixture, language, width, height]);
  }
  if (process.env.ACTION_QA_REDUCED !== '0')
    for (const fixture of fixtures.filter(
      (entry) => profile !== 'public' || ['duel', 'casino', 'debt'].includes(entry.name),
    ))
      cases.push([fixture, 'fr', 320, 740, true, true]);
  const concurrency = Math.max(1, Number(process.env.ACTION_QA_CONCURRENCY ?? 1));
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cases.length) await runCase(...cases.shift());
    }),
  );
  assert.deepEqual(results.errors, [], 'No application errors');
  assert.equal(
    results.failures.length,
    0,
    'Browser acceptance failures: ' +
      results.failures.map(({ name, message }) => `${name}: ${message}`).join('; '),
  );
  console.log(
    JSON.stringify({ checks: results.checks.length, screenshots: results.frames.length, out }),
  );
} finally {
  await saveResults();
  await browser.close();
  app.close();
}
