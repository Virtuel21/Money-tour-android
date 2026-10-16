/** Browser acceptance for game management menus. Run pnpm qa:board:install, then pnpm qa:menus.
 * MENU_QA_URL reuses a dev server; MENU_QA_OUT/BROWSERS/SCREENS customize the evidence.
 * Axe checks are automated accessibility checks, not a full WCAG or screen-reader certification.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { qaServer } from './qa-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.env.MENU_QA_OUT ?? path.join(root, 'artifacts/menu-qa'));
const requested = (
  process.env.MENU_QA_BROWSERS ??
  (process.platform === 'win32' ? 'chromium,chrome,edge,firefox,webkit' : 'chromium,firefox,webkit')
).split(',');
const definitions = {
  chromium: [chromium, {}],
  chrome: [chromium, { channel: 'chrome' }],
  edge: [chromium, { channel: 'msedge' }],
  firefox: [firefox, { firefoxUserPrefs: { 'webgl.force-enabled': true } }],
  webkit: [webkit, {}],
};
const screens = process.env.MENU_QA_SCREENS?.split(',').map((s) => s.split('x').map(Number)) ?? [
  [320, 740],
  [390, 844],
  [844, 390],
  [768, 1024],
  [1440, 1000],
];
const result = {
  startedAt: new Date().toISOString(),
  browsers: {},
  frames: [],
  accessibility: [],
  checks: [],
  failures: [],
  pageErrors: [],
};
await mkdir(out, { recursive: true });
const server = await qaServer(process.env.MENU_QA_URL, 4177);
result.url = server.url;
const save = () =>
  writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
async function ready(page) {
  await page.waitForSelector('[data-label-kind="name"]', { timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('.turn-banner'));
}
function listen(context, browser) {
  context.on('page', (page) =>
    page.on('pageerror', (error) => result.pageErrors.push({ browser, error: error.message })),
  );
}
async function capture(page, browser, name, audit = false) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.waitForTimeout(120);
  const details = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('dialog[open]')],
      dialog = dialogs.at(-1);
    const bounds = (e) => {
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    const controls = dialog
      ? [...dialog.querySelectorAll('button,input,select,summary')].filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width && b.height && !e.disabled;
        })
      : [];
    const heading = dialog?.querySelector('.modal-heading h2')?.getBoundingClientRect();
    const clock = dialog?.querySelector('.modal-countdown .cta-clock')?.getBoundingClientRect();
    const body = dialog?.querySelector('.modal-body');
    return {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      clockOverlapsTitle: !!(
        clock &&
        heading &&
        clock.x < heading.right &&
        clock.right > heading.x &&
        clock.y < heading.bottom &&
        clock.bottom > heading.y
      ),
      bodyHeight: body?.clientHeight,
      rootTextSize: getComputedStyle(document.documentElement).fontSize,
      overflow: document.documentElement.scrollWidth > innerWidth,
      bodyOverflow:
        !!dialog?.querySelector('.modal-body') &&
        dialog.querySelector('.modal-body').scrollWidth >
          dialog.querySelector('.modal-body').clientWidth + 1,
      title: dialog
        ? document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent
        : null,
      close: dialog?.querySelector('.modal-heading button:last-child')
        ? bounds(dialog.querySelector('.modal-heading button:last-child'))
        : null,
      smallTargets: controls.flatMap((e) => {
        const target = e.type === 'checkbox' ? e.closest('label') : e;
        const b = bounds(target);
        return b.width < 44 || b.height < 44
          ? [{ name: e.getAttribute('aria-label') ?? e.textContent?.trim().slice(0, 50), ...b }]
          : [];
      }),
      textSize: dialog?.querySelector('.modal-body p')
        ? getComputedStyle(dialog.querySelector('.modal-body p')).fontSize
        : null,
    };
  });
  const filename = `${browser}-${name}-${details.width}x${details.height}.png`;
  await page.screenshot({ path: path.join(out, filename), fullPage: name === 'accueil' });
  result.frames.push({ browser, name, filename, ...details });
  assert(!details.overflow && !details.bodyOverflow, `${browser}/${name}: horizontal overflow`);
  assert(!details.clockOverlapsTitle, `${browser}/${name}: countdown obscures the title`);
  if (parseFloat(details.rootTextSize) >= 32 && details.bodyHeight !== undefined)
    assert(
      details.bodyHeight >= 80,
      `${browser}/${name}: too little reading space with enlarged text`,
    );
  assert.equal(
    details.smallTargets.length,
    0,
    `${browser}/${name}: small touch targets ${JSON.stringify(details.smallTargets)}`,
  );
  if (await page.locator('dialog[open]').count())
    assert(details.title, `${browser}/${name}: unnamed dialog`);
  if (details.close)
    assert(
      details.close.y >= 0 && details.close.y + details.close.height <= details.height + 1,
      `${browser}/${name}: close action is hidden`,
    );
  if (audit) {
    let axe = new AxeBuilder({ page }).withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21aa',
      'wcag22aa',
      'best-practice',
    ]);
    if (await page.locator('dialog[open]').count()) axe = axe.include('dialog[open]');
    else if (name.startsWith('decision-')) axe = axe.include('.action-card');
    const data = await axe.analyze();
    const violations = data.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({ target: n.target, html: n.html, summary: n.failureSummary })),
    }));
    result.accessibility.push({
      browser,
      name,
      width: details.width,
      height: details.height,
      violations,
      incomplete: data.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.length })),
      passes: data.passes.length,
    });
    assert.equal(
      violations.length,
      0,
      `${browser}/${name}: axe violations ${violations.map((v) => v.id).join(', ')}`,
    );
  }
}
async function open(page, label) {
  const button = page.getByRole('button', { name: label, exact: typeof label === 'string' });
  await button.click();
  await page.locator('dialog[open]').last().waitFor();
  return button;
}
async function close(page, opener) {
  const nativeSearch = await page.evaluate(
    () =>
      document.activeElement instanceof HTMLInputElement &&
      document.activeElement.type === 'search' &&
      !!document.activeElement.value,
  );
  await page.keyboard.press('Escape');
  if (nativeSearch && (await page.locator('dialog[open]').count()))
    await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  if (opener)
    assert(
      await opener.evaluate((e) => e === document.activeElement),
      'Focus did not return to the menu opener',
    );
}
async function keyboard(page, name) {
  for (const key of ['Tab', 'Shift+Tab'])
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press(key);
      const visible = await page
        .waitForFunction(
          () => {
            const active = document.activeElement,
              dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
            if (!dialog?.contains(active)) return false;
            const b = active.getBoundingClientRect(),
              body = dialog.querySelector('.modal-body');
            if (body?.contains(active)) {
              const a = body.getBoundingClientRect();
              return b.bottom > a.top && b.top < a.bottom && b.right > a.left && b.left < a.right;
            }
            return b.y >= 0 && b.bottom <= innerHeight;
          },
          undefined,
          { timeout: 1200 },
        )
        .then(
          () => true,
          () => false,
        );
      assert(visible, `${name}: keyboard focus escaped or was hidden`);
    }
}
async function menus(browser, name, width, height, large = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: width === 390 ? 2 : 1,
    reducedMotion: 'reduce',
    hasTouch: name !== 'firefox',
  });
  listen(context, name);
  try {
    const audit = width === 390 || large;
    const home = await context.newPage();
    await home.goto(server.url + '/');
    await home.getByRole('button', { name: /Jouer sur cet appareil/ }).waitFor();
    if (large) await home.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await capture(home, name, large ? 'accueil-200' : 'accueil', audit && !large);
    for (const [key, label] of [
      ['reglages', 'Réglages'],
      ['regles', /Comment jouer/],
      ['salon', 'Rejoindre un salon'],
    ]) {
      if (large && key !== 'reglages') continue;
      const opener = await open(home, label);
      await capture(home, name, key + (large ? '-200' : ''), audit);
      if (key === 'reglages') {
        await home
          .locator('dialog[open] .modal-body')
          .evaluate((e) => (e.scrollTop = e.scrollHeight));
        await capture(home, name, key + '-bas' + (large ? '-200' : ''));
        await keyboard(home, name + '/settings');
      }
      if (key === 'salon') {
        assert(
          !(await home
            .getByLabel('Votre nom', { exact: true })
            .evaluate((e) => e === document.activeElement)),
          'Salon opens the phone keyboard without an explicit choice',
        );
        await home.getByLabel('Votre nom', { exact: true }).fill('Voyageur test');
        await home.getByLabel('Code du salon', { exact: true }).fill('12');
        await home.getByRole('button', { name: 'Rejoindre le salon', exact: true }).click();
        await home.getByRole('alert').waitFor();
        await capture(home, name, 'salon-erreur', audit);
      }
      await close(home, opener);
    }
    await home.close();
    const page = await context.newPage();
    await page.goto(server.url + '/?scenario=menu-review');
    await ready(page);
    if (width < 1000) {
      const targets = await page.locator('.board-controls > button').evaluateAll((elements) =>
        elements.map((e) => ({
          name: e.getAttribute('aria-label') ?? e.textContent,
          width: e.getBoundingClientRect().width,
          height: e.getBoundingClientRect().height,
        })),
      );
      assert(
        targets.every((t) => t.width >= 44 && t.height >= 48),
        `${name}: management navigation touch targets ${JSON.stringify(targets)}`,
      );
      await capture(page, name, 'navigation');
    }
    if (large) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    for (const [key, label] of [
      ['strategie', /Ma stratégie/],
      ['journal', 'Journal des actions'],
      ['escales', 'Explorer les cases'],
      ...(width < 1000 ? [['carnet', 'Mon carnet']] : []),
      ['reglages-partie', 'Réglages de la partie'],
      ['quitter', 'Quitter la partie'],
    ]) {
      if (large && !['escales', 'carnet', 'reglages-partie'].includes(key)) continue;
      const opener = await open(page, label);
      await capture(page, name, key + (large ? '-200' : ''), audit);
      if (key === 'journal') {
        assert.equal(await page.locator('.action-history li').count(), 80);
        await page
          .locator('dialog[open] .modal-body')
          .evaluate((e) => (e.scrollTop = e.scrollHeight));
        await capture(page, name, 'journal-bas');
      }
      if (key === 'escales' && width < 1000) {
        await page.getByRole('searchbox', { name: 'Rechercher une escale' }).fill('edimbourg');
        await page.locator('.mobile-tile-list button').first().click();
        await capture(page, name, 'fiche-escale' + (large ? '-200' : ''), audit);
        await page.getByRole('button', { name: 'Retour aux escales', exact: true }).click();
        await page.waitForFunction(() =>
          document.activeElement?.matches('.mobile-tile-list button'),
        );
        assert.equal(
          await page.getByRole('searchbox', { name: 'Rechercher une escale' }).inputValue(),
          'edimbourg',
        );
        await page.getByRole('searchbox', { name: 'Rechercher une escale' }).fill('aucuneville');
        await page.getByText('Aucune escale trouvée.', { exact: false }).waitFor();
        await capture(page, name, 'escales-vide' + (large ? '-200' : ''));
      }
      if (key === 'carnet' && !large) {
        await page.locator('.pocket-owners button').nth(1).click();
        const next = page.getByRole('button', { name: 'Rue suivante', exact: true });
        if (await next.count()) await next.click();
        const owner = await page.locator('.pocket-owners button[aria-pressed="true"]').innerText();
        const group = await page.locator('.pocket-cities h3').innerText();
        await page.locator('.pocket-cities button').first().click();
        await capture(page, name, 'fiche-carnet', audit);
        await page.getByRole('button', { name: 'Retour au carnet', exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.matches('.pocket-cities button'));
        assert.equal(
          await page.locator('.pocket-owners button[aria-pressed="true"]').innerText(),
          owner,
        );
        assert.equal(await page.locator('.pocket-cities h3').innerText(), group);
        for (const tab of ['Bonus', 'Objectif', 'Partie', 'Victoire']) {
          const button = page
            .locator('.mobile-pocket nav')
            .getByRole('button', { name: tab, exact: true });
          if (await button.count()) {
            await button.click();
            await capture(page, name, 'carnet-' + tab.toLowerCase(), audit);
          }
        }
      }
      if (key === 'reglages-partie' && !large) {
        await page.getByRole('checkbox', { name: /Textes agrandis/ }).check();
        await capture(page, name, 'textes-agrandis');
        await page.getByRole('button', { name: 'Terminé', exact: true }).click();
        await open(page, label);
        assert(await page.getByRole('checkbox', { name: /Textes agrandis/ }).isChecked());
        await page.getByRole('checkbox', { name: /Textes agrandis/ }).uncheck();
      }
      await close(page, opener);
    }
    result.checks.push({
      browser: name,
      width,
      height,
      largeText200: large,
      test: 'named dialogs, visible close, touch targets, focus return, navigation state, forms and scroll',
      pass: true,
    });
  } finally {
    await context.close();
  }
}
async function properties(browser, name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    hasTouch: name !== 'firefox',
  });
  listen(context, name);
  try {
    const page = await context.newPage();
    await page.goto(server.url + '/?scenario=menu-review');
    await ready(page);
    await open(page, 'Explorer les cases');
    await page.getByRole('searchbox', { name: 'Rechercher une escale' }).fill('Lisbonne');
    await page.locator('.mobile-tile-list button').first().click();
    assert.equal(
      await page
        .locator('dialog[open]')
        .last()
        .locator('.property-neighbours')
        .getAttribute('role'),
      'group',
    );
    await capture(page, name, 'fiche-escale', true);
    await page.getByRole('button', { name: 'Retour aux escales', exact: true }).click();
    await close(page);
    await open(page, 'Mon carnet');
    await page.locator('.pocket-owners button').nth(1).click();
    const next = page.getByRole('button', { name: 'Rue suivante', exact: true });
    if (await next.count()) await next.click();
    await page.locator('.pocket-cities button').first().click();
    await capture(page, name, 'fiche-carnet', true);
    result.checks.push({
      browser: name,
      test: 'property collection has a named group; stacked property dialogs rechecked after semantic correction',
      pass: true,
    });
  } finally {
    await context.close();
  }
}

async function decisions(browser, name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    hasTouch: name !== 'firefox',
  });
  listen(context, name);
  try {
    for (const scenario of [
      'purchase',
      'hotel-purchase',
      'resort-purchase',
      'auction',
      'duel',
      'debt',
      'travel',
    ]) {
      const page = await context.newPage();
      await page.goto(server.url + '/?scenario=' + scenario);
      await ready(page);
      if (scenario === 'auction')
        await page.locator('dialog[open] .auction-seals').waitFor({ timeout: 10000 });
      if (scenario === 'travel') await open(page, 'Choisir une case');
      if (scenario === 'hotel-purchase') {
        const hotel = page.getByRole('button', { name: /^Hôtel : loyer/ });
        await hotel.click();
        assert.equal(await hotel.getAttribute('aria-pressed'), 'true');
      }
      if (scenario === 'auction' || scenario === 'duel') {
        if (scenario === 'auction')
          await page.getByRole('button', { name: /préparer mon offre/ }).click();
        const field = page.getByRole('spinbutton', {
          name: scenario === 'auction' ? 'Votre offre secrète' : 'Mise par joueur',
        });
        if (await field.count()) {
          await field.fill('0');
          assert.equal(await field.getAttribute('aria-invalid'), 'true');
          await page.getByText('Saisissez un montant entier', { exact: false }).waitFor();
          await capture(page, name, 'decision-' + scenario + '-montant-invalide', true);
          await field.fill('500');
          assert.equal(await field.getAttribute('aria-invalid'), 'false');
          assert(await field.evaluate((e) => e.validity.valid));
        }
      }
      for (const [width, height] of [
        [390, 844],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        await capture(page, name, 'decision-' + scenario, width === 390);
      }
      await page.close();
    }
  } finally {
    await context.close();
  }
}
async function preferences(browser, name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    hasTouch: name !== 'firefox',
  });
  listen(context, name);
  try {
    const page = await context.newPage();
    await page.goto(server.url + '/?scenario=menu-review');
    await ready(page);
    await open(page, 'Réglages de la partie');
    await capture(page, name, 'systeme-sombre', true);
    await close(page);
    await open(page, 'Explorer les cases');
    await page.getByRole('searchbox', { name: 'Rechercher une escale' }).fill('Lisbonne');
    await page.setViewportSize({ width: 390, height: 460 });
    await capture(page, name, 'hauteur-clavier', true);
    result.checks.push({
      browser: name,
      test: 'dark system preference and reduced viewport while editing a search; virtual keyboard is simulated',
      pass: true,
    });
  } finally {
    await context.close();
  }
}
async function revisions(browser, name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    hasTouch: name !== 'firefox',
  });
  listen(context, name);
  try {
    const page = await context.newPage();
    await page.goto(server.url + '/?scenario=menu-review');
    await ready(page);
    for (const [width, height, large] of [
      [390, 844, false],
      [844, 390, false],
      [320, 740, true],
      [568, 320, true],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        (large) => (document.documentElement.style.fontSize = large ? '200%' : ''),
        large,
      );
      await open(page, 'Mon carnet');
      await page
        .locator('.mobile-pocket nav')
        .getByRole('button', { name: 'Partie', exact: true })
        .click();
      await capture(page, name, large ? 'carnet-partie-200' : 'carnet-partie-revision', true);
      await page.getByRole('button', { name: 'Ouvrir les réactions', exact: true }).click();
      const target = page.getByRole('combobox', { name: 'Destinataire', exact: true });
      await target.selectOption({ index: 1 });
      assert.notEqual(await target.inputValue(), 'p1');
      await capture(page, name, large ? 'reactions-200' : 'reactions', true);
      await close(page);
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.url + '/');
    await page.getByRole('button', { name: /Jouer sur cet appareil/ }).click();
    await ready(page);
    const key = 'money-tour.local.v17';
    const seed = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).seed, key);
    await page.goto(server.url + '/');
    await page.getByRole('button', { name: /Nouvelle partie sur cet appareil/ }).click();
    await capture(page, name, 'nouvelle-partie', true);
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    assert.equal(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).seed, key),
      seed,
    );
    await page.getByRole('button', { name: /Nouvelle partie sur cet appareil/ }).click();
    await page.getByRole('button', { name: 'Reprendre la partie conservée', exact: true }).click();
    await ready(page);
    assert.equal(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).seed, key),
      seed,
    );
    await page.goto(server.url + '/');
    await page.getByRole('button', { name: /Nouvelle partie sur cet appareil/ }).click();
    await page.setViewportSize({ width: 844, height: 390 });
    await capture(page, name, 'nouvelle-partie', true);
    await page.getByRole('button', { name: 'Remplacer et commencer', exact: true }).click();
    await ready(page);
    assert.notEqual(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).seed, key),
      seed,
    );
    result.checks.push({
      browser: name,
      test: 'reactions reachable through carnet without sending; recipient choice; saved game cancel, resume and explicit replacement',
      pass: true,
    });
  } finally {
    await context.close();
  }
}

try {
  for (const name of requested) {
    let browser;
    try {
      assert(definitions[name], `Unknown browser ${name}`);
      const [engine, options] = definitions[name];
      browser = await engine.launch(options);
      result.browsers[name] = browser.version();
      const sizes = process.env.MENU_QA_SCREENS
        ? screens
        : ['chrome', 'edge'].includes(name)
          ? [
              [390, 844],
              [844, 390],
            ]
          : screens;
      if (process.env.MENU_QA_PROPERTIES_ONLY) {
        await properties(browser, name);
      } else {
        if (!process.env.MENU_QA_REVISIONS_ONLY) {
          for (const [width, height] of sizes) {
            await menus(browser, name, width, height);
            console.log(`${name}: menus ${width}x${height} passed`);
            await save();
          }
          await menus(browser, name, 320, 740, true);
          await menus(browser, name, 568, 320, true);
        }
        if (!process.env.MENU_QA_REFLOW_ONLY) {
          await decisions(browser, name);
          await preferences(browser, name);
          await revisions(browser, name);
        }
        console.log(`${name}: large text and decision panels passed`);
      }
    } catch (error) {
      result.failures.push({ browser: name, error: String(error) });
      console.error(name, String(error));
    } finally {
      await browser?.close();
      await save();
    }
  }
} finally {
  server.close();
  result.finishedAt = new Date().toISOString();
  result.success = result.failures.length === 0 && result.pageErrors.length === 0;
  result.limitations =
    'Browser simulation on Windows; no physical Android/iPhone, Safari, VoiceOver or TalkBack validation.';
  await save();
}
console.log(
  JSON.stringify({
    success: result.success,
    frames: result.frames.length,
    axe: result.accessibility.length,
    checks: result.checks.length,
    failures: result.failures,
    pageErrors: result.pageErrors.length,
    out,
  }),
);
if (!result.success) process.exitCode = 1;
