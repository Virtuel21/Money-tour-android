/** Production-save acceptance: rival travel/buyout and one continuous duel card. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { tsImport } from 'tsx/esm/api';
import { createActionFixture } from './qa-action-fixtures.mjs';
import { qaServer } from './qa-server.mjs';

const { getBuyoutQuote, getRent, validateState } = await tsImport(
  '../packages/engine/src/index.ts',
  import.meta.url,
);
const out = path.resolve(process.env.TRAVEL_DUEL_QA_OUT ?? 'artifacts/travel-duel');
const screens = process.env.TRAVEL_DUEL_QA_SCREENS?.split(',').map((screen) =>
  screen.split('x').map(Number),
) ?? [
  [1280, 900],
  [390, 844],
];
const app = await qaServer(process.env.TRAVEL_DUEL_QA_URL, 4196);
const browser = await chromium.launch({ headless: true });
const results = { url: app.url, checks: [], failures: [], errors: [] };
await fs.mkdir(out, { recursive: true });

const saved = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.local.v17')).state);
async function until(fn, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(message);
}
async function open(page, save) {
  assert.deepEqual(validateState(save.state), []);
  await page.goto(app.url);
  await page.evaluate((value) => {
    localStorage.clear();
    localStorage.setItem('money-tour.local.v17', JSON.stringify(value));
    localStorage.setItem('money-tour.language.v1', 'fr');
    localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, sound: false }));
  }, save);
  await page.reload();
  await page.getByRole('button', { name: /Reprendre ma partie$/ }).click({ timeout: 45000 });
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(out, `${name}.png`), animations: 'allow' });
}
async function sameCard(page, original, stage) {
  assert.equal(await page.locator('.action-card-dialog[open]').count(), 1, stage);
  assert(
    await page
      .locator('.action-card-dialog[open]')
      .evaluate(
        (element, first) =>
          element === first.card && element.querySelector('.drawn-card-motion') === first.motion,
        original,
      ),
    stage,
  );
  assert.deepEqual(await page.evaluate(() => window.__duelMotion), ['drawn-card-arrive'], stage);
}

try {
  for (const [width, height] of screens) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__duelMotion = [];
      document.addEventListener('animationstart', (event) => {
        if (
          ['drawn-card-arrive', 'drawn-card-depart'].includes(event.animationName) &&
          event.target.closest('.action-card-dialog')
        )
          window.__duelMotion.push(event.animationName);
      });
    });
    const label = `${width}x${height}`;
    page.on('pageerror', (error) => results.errors.push({ label, message: error.message }));
    try {
      const fixture = createActionFixture('travel');
      const initial = fixture.save.state;
      initial.players[0].cash = 5000;
      const destination = fixture.enemy;
      const rent = getRent(initial, destination);
      const buyer = initial.players[0].cash,
        seller = initial.players[1].cash;
      await open(page, fixture.save);
      await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 45000 });
      await page.locator('.turn-banner').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('dialog[open]').count(), 0);
      const target = page.locator('.board-hit-polygons polygon').nth(destination);
      await target.waitFor();
      assert.match(await target.getAttribute('class'), /selectable/);
      await target.press('Enter');
      await until(
        async () => (await saved(page)).players[0].position === destination,
        'Rival travel applied',
      );
      await until(
        async () =>
          await page
            .getByRole('button', { name: /^Racheter ·/ })
            .isEnabled()
            .catch(() => false),
        'Rival buyout becomes available after movement/rent',
      );
      const landed = await saved(page);
      const quote = getBuyoutQuote(landed);
      assert(quote.canBuy);
      assert.equal(landed.players[0].cash, buyer - initial.config.travelFee - rent);
      assert.equal(landed.players[1].cash, seller + rent);
      await page.getByRole('button', { name: /^Racheter ·/ }).click();
      await capture(page, `travel-rival-buyout-${label}`);
      await page.locator('.purchase-cta').click();
      await until(
        async () => (await saved(page)).properties[destination].ownerId === 'p1',
        'Buyout completes',
      );
      const bought = await saved(page);
      assert.equal(bought.players[0].cash, buyer - initial.config.travelFee - rent - quote.total);
      assert.equal(bought.players[1].cash, seller + rent + quote.land);
      results.checks.push({
        label,
        scenario: 'rival-travel-buyout',
        destination,
        rent,
        total: quote.total,
        buyer: bought.players[0].cash,
        seller: bought.players[1].cash,
      });

      for (const mode of ['complete', 'decline']) {
        const duel = createActionFixture('duel');
        await open(page, duel.save);
        const dialog = page.locator('.action-card-dialog[open]');
        await dialog.waitFor({ state: 'visible' });
        const original = await dialog.evaluateHandle((element) => ({
          card: element,
          motion: element.querySelector('.drawn-card-motion'),
        }));
        await dialog.getByRole('spinbutton').fill('50');
        await dialog.getByRole('button', { name: /Défier Max/ }).click();
        await until(
          async () => (await saved(page)).duel?.stage === 'accept',
          'Duel offer accepted by engine',
        );
        await sameCard(page, original, 'offer to invitation');
        if (mode === 'decline') {
          await dialog.getByRole('button', { name: /Refuser le duel/ }).click();
          await dialog.waitFor({ state: 'detached' });
          await until(async () => !(await saved(page)).duel, 'Duel declined');
        } else {
          await dialog.getByRole('button', { name: /Accepter et miser/ }).click();
          await until(
            async () => (await saved(page)).duel?.stage === 'commit',
            'Both duel stakes debited',
          );
          await sameCard(page, original, 'stakes retain card');
          await dialog.getByRole('button', { name: /Pierre/ }).waitFor({ state: 'visible' });
          await dialog.getByRole('button', { name: /Pierre/ }).click();
          await dialog.getByRole('button', { name: /Pierre/ }).click();
          await until(
            async () => (await saved(page)).duel?.round === 2,
            'Tie advances the secret round',
          );
          await sameCard(page, original, 'tie retains card');
          await dialog.getByRole('button', { name: 'Manche suivante' }).click();
          await dialog.getByRole('button', { name: /Pierre/ }).click();
          await dialog.getByRole('button', { name: /Ciseaux/ }).click();
          await until(async () => !(await saved(page)).duel, 'Duel resolves');
          await sameCard(page, original, 'winner retains card');
          await capture(page, `duel-result-${label}`);
          await dialog.getByRole('button', { name: 'Continuer', exact: true }).click();
          await dialog.waitFor({ state: 'detached' });
        }
        await until(
          async () => (await page.evaluate(() => window.__duelMotion)).length === 2,
          'Duel has one entry and one departure',
        );
        const motions = await page.evaluate(() => window.__duelMotion);
        assert.deepEqual(motions, ['drawn-card-arrive', 'drawn-card-depart']);
        assert.equal(await page.locator('.action-card-dialog[open]').count(), 0);
        results.checks.push({ label, scenario: `duel-${mode}`, motions });
        await original.dispose();
      }
    } catch (error) {
      results.failures.push({ label, message: error.stack });
      await capture(page, `failure-${label}`).catch(() => undefined);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  app.close();
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n');
}
console.log(JSON.stringify(results, null, 2));
if (results.failures.length || results.errors.length) process.exitCode = 1;
