/** Real rent payment: observe both the payer's and the owner's mechanical counters.
 * CASH_QA_URL reuses a built preview or public deployment; CASH_QA_OUT stores evidence.
 * CASH_QA_CASES selects comma-separated named cases; CASH_QA_BROWSER=webkit is optional.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { tsImport } from 'tsx/esm/api';
import { qaServer } from './qa-server.mjs';
import { createActionFixture } from './qa-action-fixtures.mjs';

const { getLegalActions, reduceGame } = await tsImport(
  '../packages/engine/src/index.ts',
  import.meta.url,
);
const out = path.resolve(process.env.CASH_QA_OUT ?? '../../outputs/recette-compteurs');
const selected = process.env.CASH_QA_CASES?.split(',');
const matrix = [
  ['mobile-fr', 'fr', 390, 844, false],
  ['small-fr', 'fr', 320, 740, false],
  ['desktop-en', 'en', 1280, 900, false],
  ['mobile-en', 'en', 390, 844, false],
  ['small-reduced-en', 'en', 320, 740, true],
  ['desktop-reduced-fr', 'fr', 1280, 900, true],
].filter(([id]) => !selected || selected.includes(id));
assert(matrix.length, 'At least one known cash QA case is required');
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.CASH_QA_URL, 4197);
const browser = await (process.env.CASH_QA_BROWSER === 'webkit' ? webkit : chromium).launch({
  headless: true,
});
const results = {
  url: app.url,
  startedAt: new Date().toISOString(),
  browser: browser.version(),
  environment: 'Headless browser, emulated viewport and reduced motion; not a physical phone test.',
  cases: [],
  failures: [],
};
try {
  for (const [id, language, width, height, reduced] of matrix) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const fixture = createActionFixture('rent');
      const action = getLegalActions(fixture.save.state).find((entry) => entry.type === 'pay_rent');
      assert(action, 'A legal real rent payment exists');
      const expected = reduceGame(fixture.save.state, action);
      assert(!expected.error, expected.error);
      const payerId = action.playerId;
      const ownerId = fixture.save.state.pendingRent.creditorId;
      const amounts = [payerId, ownerId].map((playerId) => ({
        id: playerId,
        before: fixture.save.state.players.find((player) => player.id === playerId).cash,
        after: expected.state.players.find((player) => player.id === playerId).cash,
      }));
      assert(amounts[0].after < amounts[0].before, 'The visitor pays rent');
      assert(amounts[1].after > amounts[1].before, 'The owner receives rent');
      await page.addInitScript(
        ({ save, language }) => {
          localStorage.clear();
          localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
          localStorage.setItem('money-tour.language.v1', language);
          localStorage.setItem('money-tour.audio', JSON.stringify({ music: false, sound: false }));
          localStorage.setItem(
            'money-tour.comfort',
            JSON.stringify({ largeText: false, pace: 'normal', boardZoom: 100 }),
          );
        },
        { save: fixture.save, language },
      );
      await page.goto(app.url);
      await page
        .getByRole('button', {
          name: language === 'fr' ? /Reprendre ma partie$/ : /Resume my game$/,
        })
        .click({ timeout: 45_000 });
      await page.locator('.player-profiles').waitFor({ state: 'visible' });
      await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60_000 });
      const initial = await page
        .locator(`.player-panel[data-bank="${payerId}"] .player-panel-money-full .money-odometer`)
        .getAttribute('data-rolling');
      assert.equal(initial, 'false', 'Resuming a save does not count from zero');
      await page.evaluate(
        (ids) => {
          window.__cashCounterProbe = { stopped: false, samples: [] };
          const inspect = () => {
            const probe = window.__cashCounterProbe;
            for (const id of ids) {
              const panel = document.querySelector(`.player-panel[data-bank="${id}"]`);
              const full = panel.querySelector('.player-panel-money-full');
              const parent =
                full.getBoundingClientRect().width > 2
                  ? full
                  : panel.querySelector('.player-panel-money-compact');
              const counter = parent.querySelector('.money-odometer');
              const entry = {
                id,
                at: performance.now(),
                value: Number(counter.dataset.value),
                moving: counter.dataset.rolling === 'true',
                direction: counter.dataset.direction,
                text: counter.querySelector('.sr-only').textContent,
                transforms: [...counter.querySelectorAll('.money-odometer-tape')]
                  .map((node) => node.style.transform)
                  .join('|'),
              };
              probe.samples.push(entry);
            }
            if (!probe.stopped) requestAnimationFrame(inspect);
          };
          requestAnimationFrame(inspect);
        },
        amounts.map((entry) => entry.id),
      );
      await page
        .getByRole('button', { name: language === 'fr' ? /Payer le loyer/ : /Pay rent/ })
        .click();
      await page.waitForFunction(
        (amounts) =>
          amounts.every((amount) => {
            const samples = window.__cashCounterProbe.samples.filter(
              (entry) => entry.id === amount.id,
            );
            const latest = samples.at(-1);
            return (
              latest?.value === amount.after &&
              !latest.moving &&
              samples.some((entry) => entry.value === amount.after)
            );
          }),
        amounts,
        { timeout: 15_000 },
      );
      // One additional frame ensures a reduced-motion result cannot merely precede an animation.
      await page.waitForTimeout(100);
      const evidence = await page.evaluate(() => {
        window.__cashCounterProbe.stopped = true;
        const geometries = [
          ...document.querySelectorAll(
            '.player-panel .player-panel-money-full, .player-panel .player-panel-money-compact',
          ),
        ]
          .filter((node) => node.getBoundingClientRect().width > 2)
          .map((node) => {
            const rect = node.getBoundingClientRect();
            const counter = node.querySelector('.money-odometer');
            const visual = counter.querySelector('.money-odometer-visual').getBoundingClientRect();
            const semantic = counter.querySelector('.money-odometer-value');
            const semanticRect = semantic.getBoundingClientRect();
            const semanticStyle = getComputedStyle(semantic);
            const heading = node.closest('.player-panel-heading').getBoundingClientRect();
            return {
              left: visual.left,
              right: visual.right,
              top: visual.top,
              bottom: visual.bottom,
              container: { left: rect.left, right: rect.right },
              heading: {
                left: heading.left,
                right: heading.right,
                top: heading.top,
                bottom: heading.bottom,
              },
              counterWidth: counter.getBoundingClientRect().width,
              visualWidth: visual.width,
              visualRows: counter.querySelectorAll('.money-odometer-visual').length,
              semantic: {
                width: semanticRect.width,
                height: semanticRect.height,
                position: semanticStyle.position,
                clipPath: semanticStyle.clipPath,
                overflow: semanticStyle.overflow,
              },
              reels: [...counter.querySelectorAll('.money-odometer-slot')].map((slot) => {
                const rect = slot.getBoundingClientRect();
                const style = getComputedStyle(slot);
                return {
                  width: rect.width,
                  height: rect.height,
                  fontSize: parseFloat(style.fontSize),
                  overflow: style.overflow,
                };
              }),
            };
          });
        return {
          samples: window.__cashCounterProbe.samples,
          geometries,
          state: JSON.parse(localStorage.getItem('money-tour.local.v17')).state,
        };
      });
      const counters = amounts.map((amount) => {
        const samples = evidence.samples.filter((entry) => entry.id === amount.id);
        const changed = samples.filter((entry) => entry.value === amount.after);
        const moving = changed.filter((entry) => entry.moving);
        const poses = new Set(moving.map((entry) => entry.transforms));
        assert.equal(changed.at(-1).value, amount.after, `${amount.id}: exact final total`);
        assert.equal(changed.at(-1).moving, false, `${amount.id}: settles`);
        assert.equal(
          evidence.state.players.find((player) => player.id === amount.id).cash,
          amount.after,
          `${amount.id}: authoritative cash remains exact`,
        );
        assert.equal(
          changed.at(-1).text,
          new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
            maximumFractionDigits: 2,
          }).format(amount.after),
          `${amount.id}: accessible number matches the final total`,
        );
        if (reduced) assert.equal(moving.length, 0, `${amount.id}: reduced motion never rolls`);
        else {
          assert(moving.length >= 3, `${amount.id}: the real profile rolls across multiple frames`);
          assert(poses.size >= 3, `${amount.id}: multiple actual drum positions are displayed`);
          assert(
            moving.every(
              (entry) => entry.direction === (amount.after > amount.before ? 'gain' : 'loss'),
            ),
            `${amount.id}: correct roll direction`,
          );
        }
        return {
          ...amount,
          movingFrames: moving.length,
          distinctMovingPoses: poses.size,
          settledText: changed.at(-1).text,
        };
      });
      for (const box of evidence.geometries) {
        assert.equal(box.visualRows, 1, 'Exactly one visual cash row is rendered');
        assert.equal(
          box.semantic.position,
          'absolute',
          'The accessible total is removed from visual flow',
        );
        assert(
          box.semantic.width <= 1.1 && box.semantic.height <= 1.1,
          'Accessible cash text is visually hidden rather than repeated beside the reels',
        );
        assert.equal(box.semantic.clipPath, 'inset(50%)', 'Accessible cash text is clipped');
        assert.equal(
          box.semantic.overflow,
          'hidden',
          'Accessible cash text cannot escape its hidden box',
        );
        assert(
          Math.abs(box.counterWidth - box.visualWidth) <= 1,
          'Counter width contains only its single visual row',
        );
        for (const reel of box.reels) {
          assert.equal(reel.overflow, 'hidden', 'Every reel clips all offscreen digits');
          assert(
            reel.width <= reel.fontSize * 0.7 && reel.height <= reel.fontSize * 1.1,
            'Only one glyph fits in a mechanical reel',
          );
        }
        assert(
          box.left >= box.heading.left - 1 && box.right <= box.heading.right + 1,
          'Cash fits within the profile heading',
        );
        assert(
          box.top >= box.heading.top - 1 && box.bottom <= box.heading.bottom + 1,
          'Cash line fits vertically',
        );
      }
      assert.deepEqual(errors, [], 'No browser runtime errors');
      await page.screenshot({ path: path.join(out, `${id}-settled.png`), animations: 'allow' });
      results.cases.push({
        id,
        width,
        height,
        language,
        reduced,
        counters,
        geometry: evidence.geometries,
        errors,
      });
      process.stdout.write(`PASS ${id}: payer and owner counters\n`);
    } catch (error) {
      results.failures.push({ id, error: error.stack ?? String(error), errors });
      await page.screenshot({ path: path.join(out, `${id}-failure.png`) }).catch(() => undefined);
      process.stdout.write(`FAIL ${id}: ${error.message}\n`);
    } finally {
      await context.close();
      await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    }
  }
} finally {
  await browser.close();
  app.close();
}
assert.equal(results.failures.length, 0, `${results.failures.length} cash counter QA cases failed`);
