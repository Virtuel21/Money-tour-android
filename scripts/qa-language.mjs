import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { qaServer } from './qa-server.mjs';

const out = path.resolve(process.env.LANGUAGE_QA_OUT ?? 'artifacts/language-qa');
await fs.mkdir(out, { recursive: true });
const server = await qaServer(
  process.env.LANGUAGE_QA_URL,
  Number(process.env.LANGUAGE_QA_PORT ?? 4181),
);
const dictionary = JSON.parse(await fs.readFile('apps/web/src/i18n/en.json', 'utf8'));
const french = Object.keys(dictionary)
  .filter((key) => !key.includes('{') && key.trim() !== dictionary[key].trim())
  .map((s) => s.replace(/\s+/g, ' ').trim());
const result = { screens: [], checks: [], errors: [], failures: [] };
const save = () => fs.writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
async function capture(page, name) {
  await page.locator('[data-label-kind="name"]').first().waitFor({ timeout: 45000 });
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
  const audit = await page.evaluate(
    ({ french }) => {
      const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
      const root = dialog ?? document.body;
      const texts = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement;
        if (!parent || !parent.checkVisibility() || parent.closest('script,style,pre,svg'))
          continue;
        const value = n.textContent.replace(/\s+/g, ' ').trim();
        if (value) texts.push(value);
      }
      const untranslated = [
        ...new Set(
          texts.filter(
            (s) => (french.includes(s) || /^Carte de /.test(s)) && !['Vous', 'vous'].includes(s),
          ),
        ),
      ];
      const clipped = [...root.querySelectorAll('button,h1,h2,h3,p,label,select,summary')]
        .filter(
          (e) =>
            e.checkVisibility() &&
            e.clientWidth > 2 &&
            e.scrollWidth > e.clientWidth + 3 &&
            ['hidden', 'clip'].includes(getComputedStyle(e).overflowX),
        )
        .map((e) => ({
          tag: e.tagName,
          text: e.textContent.trim().slice(0, 140),
          width: e.clientWidth,
          scroll: e.scrollWidth,
        }));
      const canvas = document.createElement('canvas').getContext('2d');
      if (canvas)
        for (const select of root.querySelectorAll('.setup-options select')) {
          const style = getComputedStyle(select);
          canvas.font = style.font;
          const label = select.selectedOptions[0]?.label ?? '';
          const needed =
            canvas.measureText(label).width +
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            18;
          if (needed > select.clientWidth + 2)
            clipped.push({
              tag: 'SELECT',
              text: label,
              width: select.clientWidth,
              scroll: Math.ceil(needed),
            });
        }
      return {
        width: innerWidth,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth + 2,
        untranslated,
        clipped,
        texts,
      };
    },
    { french },
  );
  result.screens.push({ name, ...audit });
  if (audit.overflow || audit.untranslated.length || audit.clipped.length)
    result.failures.push({
      name,
      overflow: audit.overflow,
      untranslated: audit.untranslated,
      clipped: audit.clipped,
    });
  await save();
  console.log(
    name,
    JSON.stringify({
      overflow: audit.overflow,
      untranslated: audit.untranslated,
      clipped: audit.clipped,
    }),
  );
}
async function close(page) {
  const dialog = page.locator('dialog[open]').last();
  const button = dialog.getByRole('button', { name: 'Close', exact: true });
  if (await button.count()) await button.first().click();
  else await page.keyboard.press('Escape');
}
async function setup(browser, viewport, locale = 'en-US', manual = true, country = 'US') {
  const context = await browser.newContext({ viewport, locale, reducedMotion: 'reduce' });
  context.on('page', (page) => page.on('pageerror', (error) => result.errors.push(String(error))));
  await context.route('https://get.geojs.io/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ country }) }),
  );
  if (manual)
    await context.addInitScript(() => {
      try {
        localStorage.setItem('money-tour.language.v1', 'en');
        localStorage.setItem(
          'money-tour.comfort',
          JSON.stringify({ pace: 'fast', largeText: false, boardZoom: 100 }),
        );
      } catch {
        /* about:blank has no origin */
      }
    });
  return context;
}
try {
  for (const browserName of (process.env.LANGUAGE_QA_BROWSERS ?? 'chromium').split(',')) {
    const browser = await { chromium, webkit }[browserName].launch({ headless: true });
    try {
      if (!process.env.LANGUAGE_QA_SCENARIOS_ONLY) {
        for (const [country, expected] of [
          ['FR', 'fr'],
          ['US', 'en'],
          ['CA', 'en'],
        ]) {
          const context = await setup(
            browser,
            { width: 1280, height: 900 },
            'fr-FR',
            false,
            country,
          );
          const page = await context.newPage();
          await page.goto(server.url);
          await page.waitForFunction((lang) => document.documentElement.lang === lang, expected);
          assert.equal(await page.locator('html').getAttribute('lang'), expected);
          result.checks.push({ browserName, country, expected, passed: true });
          await context.close();
        }
        const sizes = process.env.LANGUAGE_QA_SIZES?.split(',').map((s) =>
          s.split('x').map(Number),
        ) ?? [
          [320, 740],
          [390, 844],
          [844, 390],
          [768, 1024],
          [1440, 1000],
        ];
        for (const [width, height] of sizes) {
          const context = await setup(browser, { width, height });
          const page = await context.newPage();
          const prefix = `${browserName}-${width}x${height}`;
          await page.goto(server.url);
          await page.getByRole('button', { name: /Play on this device/ }).waitFor();
          await capture(page, prefix + '-home');
          await page.getByRole('button', { name: 'Settings', exact: true }).click();
          await capture(page, prefix + '-settings');
          await page.getByRole('button', { name: 'Français', exact: true }).last().click();
          assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
          await page.getByRole('button', { name: 'English', exact: true }).last().click();
          await close(page);
          assert.equal(await page.getByRole('button', { name: /How to play/ }).count(), 0);
          assert.deepEqual(await page.locator('.mode-tabs button').allTextContents(), [
            'With friends',
            'Online',
            'Solo & bots',
          ]);
          await page.getByRole('button', { name: 'Play on this device', exact: true }).click();
          await capture(page, prefix + '-local-setup');
          await close(page);
          await page.getByRole('button', { name: 'Online', exact: true }).click();
          await page.getByRole('button', { name: 'Find a game', exact: true }).click();
          const publicForm = page.locator('.online-modal[open]');
          assert.equal(await publicForm.getByLabel('Your name', { exact: true }).inputValue(), '');
          assert.equal(
            await publicForm.getByRole('button', { name: 'Find a game', exact: true }).isDisabled(),
            true,
          );
          await capture(page, prefix + '-public-search-form');
          await close(page);
          await page.getByRole('button', { name: 'Solo & bots', exact: true }).click();
          await capture(page, prefix + '-solo-setup');
          await page.getByRole('button', { name: 'With friends', exact: true }).click();
          await page.getByRole('button', { name: 'Join a room', exact: true }).click();
          await page.getByLabel('Your name', { exact: true }).fill('Player Test');
          await page.getByLabel('Invitation link', { exact: true }).fill('12');
          await page.getByRole('button', { name: 'Join room', exact: true }).click();
          await page.getByRole('alert').waitFor();
          await capture(page, prefix + '-room-error');
          await close(page);
          await page.goto(server.url + '/?scenario=menu-review');
          await page.locator('[data-label-kind="name"]').first().waitFor({ timeout: 45000 });
          await capture(page, prefix + '-game');
          for (const panel of ['settings', 'player-profile', 'action-log', 'property-details']) {
            if (panel === 'player-profile') {
              await page.locator('.player-panel.is-active .player-panel-heading').first().click();
              await page.locator('.player-details-dialog[open]').waitFor();
            } else if (panel === 'action-log') {
              const history = page.locator('.live-actions');
              if ((await history.getAttribute('open')) === null)
                await history.locator('summary').click();
              await page.getByRole('button', { name: 'All actions ↗', exact: true }).click();
            } else if (panel === 'property-details') {
              await page
                .locator('.board-hit-polygons')
                .getByRole('button', { name: 'View Lisbon', exact: true })
                .click();
            } else {
              await page.getByRole('button', { name: 'Game settings', exact: true }).click();
            }
            await page.locator('dialog[open]').last().waitFor();
            await capture(page, prefix + '-' + panel);
            if (panel === 'settings') {
              await page.getByRole('button', { name: 'Français', exact: true }).last().click();
              assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
              await page.getByRole('button', { name: 'English', exact: true }).last().click();
              if (width === 390) {
                await page.getByRole('checkbox', { name: /Larger text/ }).check();
                await capture(page, prefix + '-larger-text-settings');
                await page.getByRole('checkbox', { name: /Larger text/ }).uncheck();
              }
            }
            await close(page);
          }
          await context.close();
        }
      }
      const scenes = process.env.LANGUAGE_QA_SKIP_SCENES
        ? []
        : (process.env.LANGUAGE_QA_SCENES?.split(',') ?? [
            'purchase',
            'hotel-purchase',
            'resort-buyout',
            'hotel-buyout',
            'auction',
            'duel',
            'casino',
            'slots',
            'debt',
            'fraud',
            'alliance',
            'crisis',
            'island',
            'results',
            'card',
            'tax',
            'insurance',
            'squatter',
            'roaches',
          ]);
      const sceneSizes =
        browserName === 'webkit'
          ? [[390, 844]]
          : [
              [390, 844],
              [844, 390],
              [1440, 1000],
            ];
      for (const [width, height] of sceneSizes) {
        const context = await setup(browser, { width, height });
        const page = await context.newPage();
        for (const scene of scenes) {
          await page.goto(server.url + '/?scenario=' + scene);
          await page.locator('[data-label-kind="name"]').first().waitFor({ timeout: 45000 });
          if (scene === 'auction' && !(await page.locator('dialog[open]').count())) {
            await page.getByRole('button', { name: /^Bid on / }).click();
          }
          if (scene === 'duel' && !(await page.locator('dialog[open]').count())) {
            await page.getByRole('button', { name: 'View the duel', exact: true }).click();
          }
          if (
            ['resort-buyout', 'hotel-buyout'].includes(scene) &&
            !(await page.locator('dialog[open]').count())
          ) {
            await page.getByRole('button', { name: /^Buy out ·/ }).click();
          }
          if (scene === 'hotel-purchase') {
            await page.getByRole('button', { name: /^Hotel: rent/ }).click();
          }
          if (scene === 'auction') {
            await page.getByRole('button', { name: /prepare my bid/ }).click();
            const amount = page.getByRole('spinbutton', { name: 'Your secret bid', exact: true });
            await amount.fill('0');
            assert.equal(await amount.getAttribute('aria-invalid'), 'true');
            await capture(page, `${browserName}-${width}x${height}-${scene}-invalid`);
            await amount.fill('100');
          }
          if (scene === 'duel') {
            const amount = page.getByRole('spinbutton', { name: 'Stake per player', exact: true });
            await amount.fill('0');
            assert.equal(await amount.getAttribute('aria-invalid'), 'true');
            await capture(page, `${browserName}-${width}x${height}-${scene}-invalid`);
            await amount.fill('100');
          }
          if (['card', 'tax'].includes(scene)) {
            await page.getByRole('button', { name: /^Roll the dice/ }).click();
            await page
              .getByRole('button', {
                name: scene === 'card' ? "I've read it · continue" : 'Ouch, got it!',
                exact: true,
              })
              .waitFor({ timeout: 15000 });
          }
          await capture(page, `${browserName}-${width}x${height}-${scene}`);
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  result.errors.push(String(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await save();
  server.close();
}
if (result.failures.length || result.errors.length) process.exitCode = 1;
