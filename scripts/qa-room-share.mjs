/** Invitation sharing UI exercised in real Chromium with explicit Web Share/clipboard mocks.
 * These scenarios validate UI behavior and API payloads, not physical messaging apps.
 * ROOM_SHARE_QA_URL reuses a deployment; otherwise Vite starts on 4187.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { qaServer } from './qa-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.ROOM_SHARE_QA_OUT ?? 'artifacts/room-share');
await mkdir(out, { recursive: true });
const result = {
  startedAt: new Date().toISOString(),
  scope:
    'Real Chromium UI with mocked clipboard and Web Share APIs; no physical phone, operating-system share sheet, or messaging-app validation.',
  checks: [],
  screenshots: [],
  pageErrors: [],
  status: 'running',
};
const check = (message) => {
  result.checks.push(message);
  console.log(message);
};
const labels = {
  fr: {
    create: 'Créer un salon en ligne',
    invitation: 'Lien d’invitation',
    copy: 'Copier le lien d’invitation',
    copied: 'Lien copié ✓',
    share: 'Partager le lien',
    pending: 'Ouverture du partage…',
    shareError:
      'Le partage n’a pas pu être ouvert. Collez le lien copié dans votre application de messagerie.',
    copyError: 'Copiez le lien affiché ci-dessous.',
  },
  en: {
    create: 'Create an online room',
    invitation: 'Invitation link',
    copy: 'Copy invitation link',
    copied: 'Link copied ✓',
    share: 'Share link',
    pending: 'Opening share…',
    shareError: 'Unable to open sharing. Paste the copied link into your messaging app.',
    copyError: 'Copy the link shown below.',
  },
};
let app, browser;
const contexts = [];
async function capture(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(out, filename), timeout: 15000 });
  result.screenshots.push(filename);
}
async function room({ language = 'fr', width = 390, height = 844, api = true, canShare = true }) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  contexts.push(context);
  await context.addInitScript(
    ({ language, api, canShare }) => {
      if (location.origin !== 'null') localStorage.setItem('money-tour.language.v1', language);
      const state = {
        copyFails: false,
        writes: [],
        shareMode: 'success',
        shares: [],
        canShareCalls: [],
        resolveShare: null,
      };
      window.__roomShareQa = state;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          async writeText(text) {
            if (state.copyFails)
              throw new DOMException('Clipboard denied by QA', 'NotAllowedError');
            state.writes.push(text);
          },
        },
      });
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: api
          ? (data) => {
              state.canShareCalls.push(data);
              return canShare;
            }
          : undefined,
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: api
          ? async (data) => {
              state.shares.push({ data, userActivation: navigator.userActivation.isActive });
              if (state.shareMode === 'cancel')
                throw new DOMException('Share cancelled by QA', 'AbortError');
              if (state.shareMode === 'reject')
                throw new DOMException('Share unavailable in QA', 'NotAllowedError');
              if (state.shareMode === 'pending')
                await new Promise((resolve) => {
                  state.resolveShare = resolve;
                });
            }
          : undefined,
      });
    },
    { language, api, canShare },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  await page.goto(app.url);
  const text = labels[language];
  await page.getByRole('button', { name: text.create, exact: true }).click();
  const invitation = page.locator('.invite-code input[readonly]');
  await invitation.waitFor();
  const link = await invitation.inputValue();
  const parsed = new URL(link);
  assert.match(parsed.hash, /^#room=[a-f\d]{32}$/);
  assert.equal(parsed.origin, new URL(app.url).origin);
  assert.equal(await page.getByRole('button', { name: text.share, exact: true }).count(), 0);
  return { context, page, text, invitation, link, language, width, height };
}
async function copy(value) {
  await value.page.getByRole('button', { name: value.text.copy, exact: true }).click();
  await value.page.getByRole('button', { name: value.text.copied, exact: true }).waitFor();
  const writes = await value.page.evaluate(() => window.__roomShareQa.writes);
  assert.equal(writes.at(-1), value.link);
}
async function noOverflow(page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <= innerWidth + 2 &&
      [...document.querySelectorAll('dialog[open], dialog[open] .modal-body')].every(
        (element) => element.scrollWidth <= element.clientWidth + 2,
      ),
  );
}
try {
  app = await qaServer(process.env.ROOM_SHARE_QA_URL, 4187);
  result.url = app.url;
  browser = await chromium.launch({ headless: true });
  result.browser = browser.version();
  for (const [language, width, height] of [
    ['fr', 390, 844],
    ['en', 320, 740],
    ['fr', 844, 390],
  ]) {
    const value = await room({ language, width, height });
    const { page, text, invitation, link } = value;
    await copy(value);
    const share = page.getByRole('button', { name: text.share, exact: true });
    await share.waitFor();
    assert.equal(await page.evaluate(() => window.__roomShareQa.shares.length), 0);
    assert.equal(
      await share.evaluate((button) => button.previousElementSibling?.matches('input[readonly]')),
      true,
    );
    const inputBox = await invitation.boundingBox();
    const shareBox = await share.boundingBox();
    assert(inputBox && shareBox && shareBox.y >= inputBox.y + inputBox.height);
    assert(shareBox.height >= 44, 'Share control must have a touch-friendly height');
    assert.equal(await noOverflow(page), true);
    await share.scrollIntoViewIfNeeded();
    await capture(page, `${language}-${width}x${height}-copied-share`);
    await share.click();
    await share.waitFor({ state: 'visible' });
    const calls = await page.evaluate(() => window.__roomShareQa.shares);
    assert.deepEqual(calls, [{ data: { title: 'Money Tour', url: link }, userActivation: true }]);
    assert.equal(await page.locator('.invite-share-error').count(), 0);
    check(
      `${language} ${width}x${height}: share appears below URL only after successful copy; complete #room URL; user-activated native API payload; 44px target; no horizontal overflow`,
    );
    await value.context.close();
  }

  const value = await room({});
  const { page, text } = value;
  await copy(value);
  const share = page.getByRole('button', { name: text.share, exact: true });
  await page.evaluate(() => (window.__roomShareQa.shareMode = 'cancel'));
  await share.click();
  await share.waitFor();
  assert.equal(await page.locator('.invite-share-error').count(), 0);
  assert.equal(await page.locator('.network-error').count(), 0);
  assert.equal(await value.invitation.inputValue(), value.link);
  check('Native share cancellation (AbortError) is neutral; copied invitation remains available');

  await page.evaluate(() => (window.__roomShareQa.shareMode = 'reject'));
  await share.click();
  await page.getByRole('alert').filter({ hasText: text.shareError }).waitFor();
  assert.equal(await page.getByRole('button', { name: text.copied, exact: true }).count(), 1);
  assert.equal(await value.invitation.inputValue(), value.link);
  await capture(page, 'fr-share-error-fallback');
  check(
    'Native share rejection offers pasting the already copied link; read-only invitation remains available',
  );

  await page.evaluate(() => (window.__roomShareQa.shareMode = 'pending'));
  const countBefore = await page.evaluate(() => window.__roomShareQa.shares.length);
  await share.click();
  const pending = page.getByRole('button', { name: text.pending, exact: true });
  await pending.waitFor();
  assert.equal(await pending.isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__roomShareQa.shares.length), countBefore + 1);
  assert.equal(await page.locator('.invite-share-error').count(), 0);
  await page.evaluate(() => window.__roomShareQa.resolveShare());
  await share.waitFor();
  assert.equal(await share.isEnabled(), true);
  check(
    'Pending share disables the control; successful retry clears prior error and restores the control',
  );
  await value.context.close();

  for (const [scenario, api, canShare] of [
    ['no-native-api', false, true],
    ['native-api-cannot-share', true, false],
  ]) {
    const fallback = await room({ language: 'en', width: 320, height: 740, api, canShare });
    await copy(fallback);
    assert.equal(
      await fallback.page.getByRole('button', { name: fallback.text.share, exact: true }).count(),
      0,
    );
    assert.equal(await fallback.invitation.inputValue(), fallback.link);
    assert.equal(await noOverflow(fallback.page), true);
    check(`${scenario}: invitation copy works without offering an unsupported native share action`);
    await capture(fallback.page, `en-${scenario}`);
    await fallback.context.close();
  }

  const failure = await room({});
  await failure.page.evaluate(() => (window.__roomShareQa.copyFails = true));
  await failure.page.getByRole('button', { name: failure.text.copy, exact: true }).click();
  await failure.page.getByRole('alert').filter({ hasText: failure.text.copyError }).waitFor();
  assert.equal(
    await failure.page.getByRole('button', { name: failure.text.copied, exact: true }).count(),
    0,
  );
  assert.equal(
    await failure.page.getByRole('button', { name: failure.text.share, exact: true }).count(),
    0,
  );
  assert.deepEqual(await failure.page.evaluate(() => window.__roomShareQa.writes), []);
  assert.equal(await failure.invitation.inputValue(), failure.link);
  await capture(failure.page, 'fr-copy-error-fallback');
  await failure.page.evaluate(() => (window.__roomShareQa.copyFails = false));
  await copy(failure);
  await failure.page.getByRole('button', { name: failure.text.share, exact: true }).waitFor();
  assert.equal(await failure.page.locator('.network-error').count(), 0);
  check(
    'Clipboard denial reports manual-copy fallback without false copied/share state; successful retry recovers',
  );
  await failure.context.close();
  assert.deepEqual(result.pageErrors, []);
  result.status = 'passed';
} catch (error) {
  result.status = 'failed';
  result.failure = error.stack ?? String(error);
  console.error(result.failure);
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(out, 'room-share-results.json'), JSON.stringify(result, null, 2));
  await Promise.allSettled(contexts.map((context) => context.close()));
  await browser?.close();
  app?.close();
  console.log(JSON.stringify({ status: result.status, checks: result.checks, out }, null, 2));
}
