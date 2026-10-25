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
    assert.equal(await page.locator('[class*="debug"]').count(), 0);
    await page.keyboard.press('F2');
    assert.equal(await page.getByRole('dialog').count(), 0);
    const openSettings = () =>
      page
        .getByRole('button', {
          name: fr ? 'Configurer le serveur TURN' : 'Configure TURN server',
          exact: true,
        })
        .click();
    await openSettings();
    await page.getByLabel(fr ? 'Votre nom' : 'Your name', { exact: true }).fill('Camille');
    await page
      .getByLabel(fr ? 'Adresse TURN' : 'TURN address', { exact: true })
      .fill('turn:relay.example:3478');
    await page
      .getByLabel(fr ? 'Nom d’utilisateur TURN' : 'TURN username', { exact: true })
      .fill('qa-user');
    const url = page.getByLabel(fr ? 'Adresse TURN' : 'TURN address', { exact: true });
    const username = page.getByLabel(fr ? 'Nom d’utilisateur TURN' : 'TURN username', {
      exact: true,
    });
    const password = page.getByLabel(fr ? 'Mot de passe TURN' : 'TURN password', { exact: true });
    assert.equal(await password.getAttribute('type'), 'password');
    await password.fill('qa-only-not-a-real-secret');
    assert.equal(
      await page.evaluate(() => JSON.stringify(localStorage).includes('qa-only-not-a-real-secret')),
      true,
    );
    const relay = page.getByRole('checkbox', {
      name: fr
        ? 'Faire passer toutes les connexions par TURN'
        : 'Route all connections through TURN',
    });
    await relay.uncheck();
    await page
      .getByRole('button', { name: fr ? 'Fermer le salon' : 'Close room', exact: true })
      .click();
    await openSettings();
    assert.equal(await password.inputValue(), 'qa-only-not-a-real-secret');
    await page.reload();
    await openSettings();
    assert.equal(await url.inputValue(), 'turn:relay.example:3478');
    assert.equal(await username.inputValue(), 'qa-user');
    assert.equal(await password.inputValue(), 'qa-only-not-a-real-secret');
    assert.equal(await relay.isChecked(), false);
    await page.getByLabel(fr ? 'Votre nom' : 'Your name', { exact: true }).fill('Camille');
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
      `${language} ${width}x${height}: no debug entry/F2, password masking, automatic save, reopen/reload, relay preference, validation, no overflow`,
    );
    await page
      .getByRole('button', {
        name: fr ? 'Effacer les paramètres TURN enregistrés' : 'Clear saved TURN settings',
        exact: true,
      })
      .click();
    assert.equal(await password.inputValue(), '');
    assert.equal(await url.inputValue(), '');
    assert.equal(await username.inputValue(), '');
    assert.equal(
      await page.evaluate(() => localStorage.getItem('money-tour.turn-settings.v1')),
      null,
    );
    await page.reload();
    await openSettings();
    assert.equal(await url.inputValue(), '');
    assert.equal(await password.inputValue(), '');
    results.checks.push(`${language} ${width}x${height}: clearing survives reload`);
    await ctx.close();
  }
  // Reopen the same disk-backed browser profile after actually closing its process.
  const profile = path.join(out, `profile-${Date.now()}`);
  let persistent = await chromium.launchPersistentContext(profile, { headless: true });
  try {
    let page = persistent.pages()[0];
    await page.goto(app.url);
    await page.evaluate(() => localStorage.setItem('money-tour.language.v1', 'fr'));
    await page.reload();
    await page.getByRole('button', { name: 'Configurer le serveur TURN', exact: true }).click();
    await page.getByLabel('Adresse TURN', { exact: true }).fill('turn:profile.example:3478');
    await page.getByLabel('Nom d’utilisateur TURN', { exact: true }).fill('profile-user');
    await page.getByLabel('Mot de passe TURN', { exact: true }).fill('qa-profile-only');
    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, { headless: true });
    page = persistent.pages()[0];
    await page.goto(app.url);
    await page.getByRole('button', { name: 'Configurer le serveur TURN', exact: true }).click();
    assert.equal(
      await page.getByLabel('Adresse TURN', { exact: true }).inputValue(),
      'turn:profile.example:3478',
    );
    assert.equal(
      await page.getByLabel('Nom d’utilisateur TURN', { exact: true }).inputValue(),
      'profile-user',
    );
    assert.equal(
      await page.getByLabel('Mot de passe TURN', { exact: true }).inputValue(),
      'qa-profile-only',
    );
    results.checks.push(
      'Chromium process closed and restarted: all TURN fields restored from the same browser profile',
    );
    await page.getByRole('button', { name: 'Fermer le salon', exact: true }).click();
    await page.getByRole('button', { name: 'Entre amis', exact: true }).click();
    await page.getByRole('button', { name: /Jouer sur cet appareil/ }).click();
    await page.getByRole('button', { name: 'Lancer la partie', exact: true }).click();
    await page.getByRole('button', { name: 'Réglages de la partie', exact: true }).waitFor();
    await page.keyboard.press('F2');
    assert.equal(await page.locator('[class*="debug"]').count(), 0);
    await page.getByRole('button', { name: 'Réglages de la partie', exact: true }).click();
    assert.equal(await page.getByText(/debug|Outils de test/i).count(), 0);
    await page.getByRole('button', { name: 'Terminé', exact: true }).click();
    const seed = await page.evaluate(
      () => JSON.parse(localStorage.getItem('money-tour.local.v17')).seed,
    );
    await page.reload();
    await page.getByRole('button', { name: /Reprendre ma partie/ }).waitFor();
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.local.v17')).seed),
      seed,
    );
    results.checks.push(
      'Normal local game and save retained; no debug access in game settings or through F2',
    );
  } finally {
    await persistent.close();
  }
  assert.deepEqual(results.errors, []);
  console.log(JSON.stringify(results));
} finally {
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  app.close();
}
