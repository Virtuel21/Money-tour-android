import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { qaServer } from './qa-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.SOCIAL_QA_OUT ?? 'artifacts/social-cards');
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.SOCIAL_QA_URL, 4185);
const browser = await chromium.launch({ headless: true });
const results = { url: app.url, checks: [], screenshots: [], errors: [], accessibility: [] };
const screens = [
  ['fr', 1280, 900],
  ['fr', 390, 844],
  ['en', 320, 740],
  ['en', 844, 390],
];
const scenario = (name) => {
  const url = new URL(app.url);
  url.searchParams.set('scenario', name);
  return url.href;
};
async function capture(page, name) {
  await page.screenshot({
    path: path.join(out, name + '.png'),
    animations: 'allow',
    fullPage: name.startsWith('home-'),
  });
  results.screenshots.push(name + '.png');
}
async function cardGeometry(page) {
  const geometry = await page.locator('.drawn-card-dialog').evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const button = dialog.querySelector('button').getBoundingClientRect();
    return {
      fits:
        rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      ctaFits:
        button.top >= 0 &&
        button.bottom <= innerHeight &&
        button.width >= 44 &&
        button.height >= 44,
      noHorizontalOverflow:
        dialog.querySelector('.drawn-card-content').scrollWidth <=
        dialog.querySelector('.drawn-card-content').clientWidth + 1,
    };
  });
  assert.deepEqual(geometry, { fits: true, ctaFits: true, noHorizontalOverflow: true });
  if (await page.locator('.drawn-card-tax').count()) {
    assert.equal(
      await page.locator('.drawn-card-tax').evaluate((dialog) => {
        const content = dialog.querySelector('.drawn-card-content').getBoundingClientRect();
        const amount = dialog.querySelector('.tax-amount').getBoundingClientRect();
        return amount.top >= content.top && amount.bottom <= content.bottom;
      }),
      true,
      'The amount due must be fully visible before scrolling',
    );
  }
}
try {
  for (const [language, width, height] of screens) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'no-preference',
    });
    await context.addInitScript(
      (language) => localStorage.setItem('money-tour.language.v1', language),
      language,
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => results.errors.push(error.message));
    await page.goto(app.url);
    await page
      .locator('[data-label-kind="name"]')
      .first()
      .waitFor({ state: 'attached', timeout: 45000 });
    const fr = language === 'fr';
    const tabs = page.locator('.mode-tabs button');
    assert.deepEqual(
      await tabs.allTextContents(),
      fr ? ['Entre amis', '2v2', 'Solo & bots'] : ['With friends', '2v2', 'Solo & bots'],
    );
    assert.equal(await tabs.nth(0).getAttribute('aria-pressed'), 'true');
    for (let index = 0; index < 3; index++) {
      await tabs.nth(index).click();
      const primary = page.locator('.setup > button.primary');
      assert.equal(await primary.count(), 1);
      assert.match(
        await primary.textContent(),
        index === 2
          ? fr
            ? /Jouer sur cet appareil/
            : /Play on this device/
          : fr
            ? /Créer un salon en ligne/
            : /Create an online room/,
      );
      const firstAction = await page.locator('.setup > button').first().textContent();
      assert.equal(firstAction, await primary.textContent());
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      await capture(page, `home-${language}-${width}x${height}-${index}`);
    }
    results.checks.push(
      `${language} ${width}x${height}: friends selected by default, ordered modes, online primary for friends/2v2, local primary for solo`,
    );

    for (const kind of ['card', 'tax']) {
      await page.goto(scenario(kind));
      await page.getByRole('button', { name: fr ? /Lancer les dés/ : /Roll the dice/ }).click();
      const dialog = page.locator('.drawn-card-dialog');
      await dialog.waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await page.locator('dialog[open]').count(), 1);
      assert.equal(
        await dialog.locator('img').evaluate(async (image) => {
          await image.decode();
          return image.naturalWidth > 0;
        }),
        true,
      );
      // Freeze actual CSS animation at its back-facing phase for deterministic visual evidence.
      await dialog.locator('.drawn-card-motion').evaluate((element) => {
        const animation = element.getAnimations()[0];
        animation.pause();
        animation.currentTime = 450;
      });
      if (width === 390) await capture(page, `${kind}-${language}-${width}x${height}-back`);
      await dialog
        .locator('.drawn-card-motion')
        .evaluate((element) => element.getAnimations()[0].finish());
      await cardGeometry(page);
      const audit = await new AxeBuilder({ page })
        .include('.drawn-card-dialog')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      results.accessibility.push({
        language,
        width,
        height,
        kind,
        violations: audit.violations.map(({ id, impact }) => ({ id, impact })),
      });
      assert.deepEqual(
        audit.violations.map((violation) => violation.id),
        [],
      );
      await capture(page, `${kind}-${language}-${width}x${height}`);
      const departure = await dialog.evaluate(async (element) => {
        const button = element.querySelector('button');
        button.click();
        await Promise.resolve();
        return { leaving: element.classList.contains('is-leaving'), disabled: button.disabled };
      });
      assert.deepEqual(departure, { leaving: true, disabled: true });
      await dialog.waitFor({ state: 'detached', timeout: 5000 });
      results.checks.push(
        `${language} ${width}x${height}: ${kind} real draw, physical back/front, image loaded, readable bounds, visible CTA, departure then dismissal, axe clean`,
      );
    }
    await context.close();
  }
  const context = await browser.newContext({
    viewport: { width: 320, height: 740 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    localStorage.setItem('money-tour.language.v1', 'fr');
    localStorage.setItem(
      'money-tour.comfort',
      JSON.stringify({ largeText: true, pace: 'normal', boardZoom: 100 }),
    );
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => results.errors.push(error.message));
  await page.goto(scenario('tax'));
  await page.getByRole('button', { name: /Lancer les dés/ }).click();
  const dialog = page.locator('.drawn-card-dialog');
  await dialog.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(
    await dialog
      .locator('.drawn-card-motion')
      .evaluate((element) => getComputedStyle(element).animationName),
    'none',
  );
  await cardGeometry(page);
  await capture(page, 'tax-fr-320x740-reduced-large');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  results.checks.push(
    '320x740: reduced motion, large text, visible CTA, Escape dismisses without a flight',
  );
  await context.close();
  assert.deepEqual(results.errors, []);
  console.log(JSON.stringify(results));
} finally {
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  app.close();
}
