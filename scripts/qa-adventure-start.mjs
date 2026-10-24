/** Real UI and WebRTC start barrier acceptance on one computer.
 * ADVENTURE_QA_URL targets an existing local/public build. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { qaServer } from './qa-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.ADVENTURE_QA_OUT ?? '../../outputs/recette-depart');
await mkdir(out, { recursive: true });
const app = await qaServer(process.env.ADVENTURE_QA_URL, 4197);
const browser = await chromium.launch({ headless: true });
const report = {
  url: app.url,
  browser: browser.version(),
  scope:
    'Chromium with real WebGL and two isolated WebRTC contexts on one computer; no physical phones or separate networks.',
  checks: [],
  screenshots: [],
  errors: [],
};
const contexts = [];
const check = (message) => {
  report.checks.push(message);
  console.log(message);
};
async function capture(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(out, filename), timeout: 15000 });
  report.screenshots.push(filename);
}
async function makePage() {
  const context = await browser.newContext({
    viewport: { width: 502, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  contexts.push(context);
  await context.addInitScript(() => {
    localStorage.setItem('money-tour.language.v1', 'fr');
    localStorage.setItem(
      'money-tour.audio',
      JSON.stringify({ music: false, effects: false, volume: 0 }),
    );
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  return page;
}
async function snapshot(page) {
  return page.evaluate(() => {
    const resume = JSON.parse(localStorage.getItem('money-tour.online-resume.v1') ?? 'null');
    const cached = resume
      ? JSON.parse(localStorage.getItem(`money-tour.session.${resume.code}`))
      : null;
    const frames = cached?.save.frames ?? [];
    return {
      frames: frames.map(({ command, result, adventureDeadline }) => ({
        command,
        result,
        adventureDeadline,
      })),
      ready: cached?.save.adventureReady,
      clock: document.querySelector('.game-tools .clock')?.textContent.trim(),
    };
  });
}
async function onlineGame(auto) {
  const host = await makePage();
  await host.goto(app.url);
  await host.getByLabel('Nom du joueur 1', { exact: true }).fill('HoteQA');
  await host.getByRole('button', { name: 'Créer un salon en ligne', exact: true }).click();
  const invitation = host.getByLabel('Lien d’invitation', { exact: true });
  await host.waitForFunction(() =>
    document.querySelector('input[readonly]')?.value.includes('#room='),
  );
  const link = await invitation.inputValue();
  const guest = await makePage();
  await guest.goto(link);
  await guest.getByLabel('Votre nom', { exact: true }).fill('InviteQA');
  await guest.getByRole('button', { name: 'Rejoindre le salon', exact: true }).click();
  await Promise.all(
    [host, guest].map((page) =>
      page.waitForFunction(
        () =>
          document.querySelector('.lobby-members')?.textContent.includes('HoteQA') &&
          document.querySelector('.lobby-members')?.textContent.includes('InviteQA'),
        undefined,
        { timeout: 90000 },
      ),
    ),
  );
  await host.getByRole('button', { name: 'Lancer la partie', exact: true }).click();
  await Promise.all([host, guest].map((page) => page.locator('.adventure-start[open]').waitFor()));
  const before = await Promise.all([host, guest].map(snapshot));
  assert.deepEqual(before[0].frames, before[1].frames);
  const first = before[0].frames[0];
  assert.equal(first.command.type, 'start');
  assert.equal(first.command.rulesVersion, 18);
  assert.equal(first.command.adventureStart, true);
  assert(first.adventureDeadline > Date.now(), 'The shared deadline is still pending');
  await host.getByRole('button', { name: 'Démarrer l’aventure', exact: true }).click();
  await host.getByRole('button', { name: 'Prêt · en attente des autres', exact: true }).waitFor();
  await guest.waitForFunction(() =>
    document.querySelector('.adventure-start-players')?.textContent.includes('Prêt'),
  );
  await host.waitForTimeout(2500);
  const held = await Promise.all([host, guest].map(snapshot));
  assert(held.every((entry, index) => entry.clock === before[index].clock));
  assert(
    held.every((entry) => entry.frames.length === 1),
    'No gameplay frames while one participant is not ready',
  );
  await capture(guest, auto ? 'multi-automatic-wait' : 'multi-ready-wait');
  if (auto) {
    await Promise.all(
      [host, guest].map((page) =>
        page.locator('.adventure-start').waitFor({ state: 'detached', timeout: 25000 }),
      ),
    );
    check('Multiplayer: one missing click starts both screens automatically after 20 seconds');
  } else {
    await guest.getByRole('button', { name: 'Démarrer l’aventure', exact: true }).click();
    await Promise.all(
      [host, guest].map((page) =>
        page.locator('.adventure-start').waitFor({ state: 'detached', timeout: 6000 }),
      ),
    );
    assert(Date.now() < first.adventureDeadline, 'All-ready releases before the timeout');
    check(
      'Multiplayer: both clocks stay frozen until every human clicks, then both screens start together',
    );
  }
  const after = await Promise.all([host, guest].map(snapshot));
  const releases = after.map((entry) =>
    entry.frames.find((frame) => frame.command.type === 'adventure_release'),
  );
  assert(releases.every(Boolean));
  assert.deepEqual(releases[0], releases[1]);
  if (auto) assert(releases[0].command.at >= first.adventureDeadline);
  else assert.equal(Object.keys(releases[0].command.ready).length, 2);
  await capture(host, auto ? 'multi-automatic-started' : 'multi-ready-started');
  await Promise.all([host.context().close(), guest.context().close()]);
}
try {
  if (!process.env.ADVENTURE_QA_CASES || process.env.ADVENTURE_QA_CASES.includes('solo')) {
    const local = await makePage();
    await local.goto(app.url);
    await local.getByRole('button', { name: 'Solo & bots', exact: true }).click();
    await local.getByRole('button', { name: 'Jouer sur cet appareil', exact: true }).click();
    await local.locator('.adventure-start[open]').waitFor();
    assert.equal(await local.locator('.adventure-start-rule').count(), 1);
    await capture(local, 'solo-introduction');
    for (const size of [
      { width: 320, height: 740 },
      { width: 844, height: 390 },
    ]) {
      await local.setViewportSize(size);
      const startButton = local.getByRole('button', { name: 'Démarrer l’aventure', exact: true });
      await startButton.scrollIntoViewIfNeeded();
      const box = await startButton.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= size.width);
      assert(box.y >= 0 && box.y + box.height <= size.height);
      assert(box.height >= 44, 'Start button remains a reachable touch target');
      await capture(local, `solo-introduction-${size.width}x${size.height}`);
    }
    const oldSave = await local.evaluate(() =>
      JSON.parse(localStorage.getItem('money-tour.local.v17')),
    );
    await local.waitForTimeout(1500);
    const heldSave = await local.evaluate(() =>
      JSON.parse(localStorage.getItem('money-tour.local.v17')),
    );
    assert.deepEqual(heldSave.state, oldSave.state, 'Solo clocks and random starter bot stay held');
    await local.getByRole('button', { name: 'Démarrer l’aventure', exact: true }).click();
    await local.locator('.adventure-start').waitFor({ state: 'detached' });
    assert.equal(
      await local.evaluate(
        () => JSON.parse(localStorage.getItem('money-tour.local.v17')).adventureStartDeadline,
      ),
      undefined,
    );
    check('Solo: one-sentence introduction holds clocks/bots, and the adventure starts on click');
    await local.context().close();
  }
  if (!process.env.ADVENTURE_QA_CASES || process.env.ADVENTURE_QA_CASES.includes('ready'))
    await onlineGame(false);
  if (!process.env.ADVENTURE_QA_CASES || process.env.ADVENTURE_QA_CASES.includes('auto'))
    await onlineGame(true);
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack ?? String(error);
  report.diagnostics = [];
  console.error(report.failure);
  for (const context of contexts)
    for (const page of context.pages()) {
      try {
        report.diagnostics.push(await snapshot(page));
        await capture(page, `failure-${report.screenshots.length}`);
      } catch {
        /* Closed or unavailable. */
      }
    }
  process.exitCode = 1;
} finally {
  await writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  await browser.close();
  app.close();
}
