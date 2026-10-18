import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { qaServer } from './qa-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.TURN_QA_OUT ?? 'artifacts/turn-form');
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.TURN_QA_URL, 4183);
const browser = await chromium.launch({ headless: true });
const results = { url: app.url, checks: [], errors: [] };
try {
  for (const [language, width, height] of [
    ['fr', 1280, 900],
    ['fr', 390, 844],
    ['en', 320, 740],
    ['en', 844, 390],
  ]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.addInitScript((language) => {
      if (location.origin !== 'null') localStorage.setItem('money-tour.language.v1', language);
    }, language);
    const page = await ctx.newPage();
    page.on('pageerror', (error) => results.errors.push(error.message));
    await page.goto(app.url);
    const fr = language === 'fr';
    await page
      .getByRole('button', {
        name: fr ? 'Configurer le serveur TURN' : 'Configure TURN server',
        exact: true,
      })
      .click();
    await page.getByLabel(fr ? 'Votre nom' : 'Your name', { exact: true }).fill('Camille');
    await page
      .getByLabel(fr ? 'Adresse TURN' : 'TURN address', { exact: true })
      .fill('turn:relay.example:3478');
    await page
      .getByLabel(fr ? 'Nom d’utilisateur TURN' : 'TURN username', { exact: true })
      .fill('qa-user');
    const password = page.getByLabel(fr ? 'Mot de passe TURN' : 'TURN password', { exact: true });
    assert.equal(await password.getAttribute('type'), 'password');
    await password.fill('qa-only-not-a-real-secret');
    assert.equal(
      await page.evaluate(() => JSON.stringify(localStorage).includes('qa-only-not-a-real-secret')),
      false,
    );
    // Validation must block an incomplete configuration before creating a session.
    await password.fill('');
    await page
      .getByRole('button', {
        name: fr ? 'Créer le salon avec TURN' : 'Create room with TURN',
        exact: true,
      })
      .click();
    await page
      .getByRole('alert')
      .filter({ hasText: fr ? 'Renseignez l’identifiant' : 'Enter the TURN username' })
      .waitFor();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth + 2 ||
        [...document.querySelectorAll('dialog[open], dialog[open] .modal-body')].some(
          (e) => e.scrollWidth > e.clientWidth + 2,
        ),
    );
    assert.equal(overflow, false);
    await page.screenshot({ path: path.join(out, `${language}-${width}x${height}.png`) });
    results.checks.push(
      `${language} ${width}x${height}: three fields, password masking, no credential persistence, validation, no overflow`,
    );
    await ctx.close();
  }
  assert.deepEqual(results.errors, []);
  console.log(JSON.stringify(results));
} finally {
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  app.close();
}
