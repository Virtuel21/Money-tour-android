/** Real-browser delayed invitations over the app's public Nostr signaling.
 * LOBBY_QA_URL reuses a local/public deployment; otherwise Vite starts on 4186.
 * LOBBY_QA_DELAY_MS defaults to 65000; LOBBY_QA_OUT selects evidence output.
 * Chromium contexts on one computer do not validate physical phones or mobile networks.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { qaServer } from './qa-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const delayMs = Number(process.env.LOBBY_QA_DELAY_MS ?? 65000);
assert(Number.isFinite(delayMs) && delayMs >= 0, 'LOBBY_QA_DELAY_MS must be nonnegative');
const out = path.resolve(process.env.LOBBY_QA_OUT ?? 'artifacts/lobby-delay');
await mkdir(out, { recursive: true });
const result = {
  startedAt: new Date().toISOString(),
  delayMs,
  transport: 'Trystero default public Nostr signaling and real WebRTC; no TURN settings',
  scope: 'Two fresh Chromium contexts on one computer; no physical phone or 4G/5G coverage',
  checks: [],
  screenshots: [],
  pageErrors: [],
  consoleErrors: [],
  signaling: [],
  status: 'running',
};
const save = () => writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
const check = (text) => {
  result.checks.push(text);
  console.log(text);
};
let app, browser, host, guest;
async function capture(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(out, filename), timeout: 15000 });
  result.screenshots.push(filename);
}
async function makePage(role) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addInitScript(() => {
    if (location.origin !== 'null') localStorage.setItem('money-tour.language.v1', 'fr');
    window.__lobbyQaConnections = [];
    const OriginalPC = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends OriginalPC {
      constructor(...args) {
        super(...args);
        const details = { state: this.connectionState, ice: this.iceConnectionState, types: [] };
        window.__lobbyQaConnections.push(details);
        this.addEventListener('connectionstatechange', () => {
          details.state = this.connectionState;
        });
        this.addEventListener('iceconnectionstatechange', () => {
          details.ice = this.iceConnectionState;
        });
        this.addEventListener('icecandidate', ({ candidate }) => {
          if (candidate?.type && !details.types.includes(candidate.type))
            details.types.push(candidate.type);
        });
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (error) => result.pageErrors.push({ role, message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error' && result.consoleErrors.length < 60)
      result.consoleErrors.push({ role, message: message.text().slice(0, 500) });
  });
  page.on('websocket', (socket) => {
    const address = new URL(socket.url());
    const entry = {
      role,
      url: `${address.origin}${address.pathname}`,
      sent: 0,
      received: 0,
      errors: [],
      closed: false,
    };
    result.signaling.push(entry);
    socket.on('framesent', () => entry.sent++);
    socket.on('framereceived', () => entry.received++);
    socket.on('socketerror', (error) => entry.errors.push(String(error).slice(0, 500)));
    socket.on('close', () => (entry.closed = true));
  });
  return page;
}
async function roomMembers(page) {
  await page.waitForFunction(
    () => {
      const names = [...document.querySelectorAll('.lobby-members strong')].map((element) =>
        element.textContent.trim().replace(/ \(vous\)$/, ''),
      );
      return names.includes('HoteQA') && names.includes('InviteQA');
    },
    undefined,
    { timeout: 90000 },
  );
  return page.locator('.lobby-members strong').allTextContents();
}
async function diagnostics(page) {
  return page.evaluate(() => {
    const resume = JSON.parse(localStorage.getItem('money-tour.online-resume.v1') ?? 'null');
    const cached = resume
      ? JSON.parse(localStorage.getItem(`money-tour.session.${resume.code}`) ?? 'null')
      : null;
    const save = cached?.save;
    return {
      dialogOpen: !!document.querySelector('.online-modal[open]'),
      status: [...document.querySelectorAll('.network-status')].map(
        (element) => element.textContent,
      ),
      members: [...document.querySelectorAll('.lobby-members strong')].map((element) =>
        element.textContent.trim(),
      ),
      errors: [...document.querySelectorAll('.network-error')].map(
        (element) => element.textContent,
      ),
      incidentText: document.querySelector('.online-modal details.advanced ul')?.textContent ?? '',
      turnPreferencesPresent: localStorage.getItem('money-tour.turn-settings.v1') !== null,
      transportConnections: window.__lobbyQaConnections,
      snapshot: save
        ? {
            host: save.host,
            epoch: save.epoch,
            members: save.members.map((member) => ({ id: member.id, name: member.name })),
            frames: save.frames.length,
            hash: save.frames.at(-1)?.result ?? null,
          }
        : null,
    };
  });
}
try {
  app = await qaServer(process.env.LOBBY_QA_URL, 4186);
  result.url = app.url;
  browser = await chromium.launch({ headless: true });
  result.browser = browser.version();
  host = await makePage('host');
  await host.goto(app.url);
  await host.getByLabel('Nom du joueur 1', { exact: true }).fill('HoteQA');
  await host.locator('.setup-options select').first().selectOption('2');
  await host.getByRole('button', { name: /Créer un salon en ligne/ }).click();
  const invitation = host.getByLabel('Lien d’invitation', { exact: true });
  await invitation.waitFor();
  const cancelledLink = await invitation.inputValue();
  assert.match(new URL(cancelledLink).hash, /^#room=[a-f\d]{32}$/);
  assert.equal(await host.getByRole('button', { name: 'Copier le code du salon' }).count(), 0);
  assert.equal(await host.locator('.invite-code code').count(), 0);
  assert.equal(await host.getByText('Mode réseau : connexion directe', { exact: true }).count(), 1);
  check(
    'Host created a direct room from the home CTA; invitation exposes a link without a room-code control',
  );
  await capture(host, 'host-created');
  await host.getByRole('button', { name: 'Fermer le salon', exact: true }).click();
  await host.locator('.online-modal[open]').waitFor({ state: 'hidden' });
  assert.equal(new URL(host.url()).hash, '');
  assert.equal(
    await host.evaluate(() => localStorage.getItem('money-tour.online-resume.v1')),
    null,
  );
  assert.equal(
    await host.getByRole('button', { name: 'Créer un salon en ligne', exact: true }).isEnabled(),
    true,
  );
  assert.equal(
    await host.getByRole('button', { name: 'Jouer sur cet appareil', exact: true }).isEnabled(),
    true,
  );
  check(
    'Closing pregame creation cancelled its room, cleared recovery and URL, and restored both start modes',
  );
  await capture(host, 'host-dialog-closed');
  await host.getByRole('button', { name: 'Créer un salon en ligne', exact: true }).click();
  await invitation.waitFor();
  const link = await invitation.inputValue();
  assert.match(new URL(link).hash, /^#room=[a-f\d]{32}$/);
  assert.notEqual(link, cancelledLink);
  check('The host created a fresh room with a different invitation after cancellation');
  const waitStarted = Date.now();
  console.log(`Host is waiting alone with its room dialog open for ${delayMs} ms.`);
  await save();
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  result.actualIdleMs = Date.now() - waitStarted;
  assert.equal(await invitation.inputValue(), link);
  assert.equal(
    await host.getByLabel('Votre nom dans le salon', { exact: true }).inputValue(),
    'HoteQA',
  );
  check(`The fresh room and host name survived ${result.actualIdleMs} ms with the dialog open`);
  await capture(host, 'host-after-delay');
  guest = await makePage('guest');
  await guest.goto(link);
  await guest.getByLabel('Votre nom', { exact: true }).fill('InviteQA');
  assert.equal(await guest.getByLabel('Lien d’invitation', { exact: true }).count(), 0);
  await guest.getByRole('button', { name: 'Rejoindre le salon', exact: true }).click();
  await Promise.all([roomMembers(host), roomMembers(guest)]);
  check(
    'The late guest joined through the invitation link; both browsers display HoteQA and InviteQA',
  );
  await capture(host, 'host-two-members');
  await capture(guest, 'guest-two-members');
  await host.getByRole('button', { name: 'Lancer la partie', exact: true }).click();
  await Promise.all(
    [host, guest].map((page) =>
      page.getByRole('button', { name: 'Réglages de la partie', exact: true }).waitFor(),
    ),
  );
  await Promise.all(
    [host, guest].map((page) =>
      page.waitForFunction(() => {
        const resume = JSON.parse(localStorage.getItem('money-tour.online-resume.v1') ?? 'null');
        const saved = resume
          ? JSON.parse(localStorage.getItem(`money-tour.session.${resume.code}`) ?? 'null')
          : null;
        return saved?.save.frames.length > 0;
      }),
    ),
  );
  // Pause comparison at the immutable start frame; later heartbeat ticks can arrive between reads.
  const startFrames = await Promise.all(
    [host, guest].map((page) =>
      page.evaluate(() => {
        const resume = JSON.parse(localStorage.getItem('money-tour.online-resume.v1'));
        const saved = JSON.parse(localStorage.getItem(`money-tour.session.${resume.code}`));
        return saved.save.frames[0];
      }),
    ),
  );
  assert.deepEqual(startFrames[0], startFrames[1]);
  assert.equal(startFrames[0].command.type, 'start');
  assert.deepEqual(
    startFrames[0].command.options.players.map((player) => player.name),
    ['HoteQA', 'InviteQA'],
  );
  result.startHash = startFrames[0].result;
  result.startParticipants = startFrames[0].proof.context.participants.length;
  assert.equal(result.startParticipants, 2);
  check(
    'Both browsers started the same signed game frame with HoteQA and InviteQA as its two contributors',
  );
  await capture(host, 'host-game');
  await capture(guest, 'guest-game');
  assert.deepEqual(result.pageErrors, []);
  result.status = 'passed';
} catch (error) {
  result.status = 'failed';
  result.failure = error.stack ?? String(error);
  console.error(result.failure);
  for (const [page, name] of [
    [host, 'host-failure'],
    [guest, 'guest-failure'],
  ])
    if (page && !page.isClosed()) await capture(page, name).catch(() => {});
  process.exitCode = 1;
} finally {
  result.diagnostics = {};
  for (const [page, role] of [
    [host, 'host'],
    [guest, 'guest'],
  ])
    if (page && !page.isClosed())
      result.diagnostics[role] = await diagnostics(page).catch((error) => ({
        error: error.message,
      }));
  result.finishedAt = new Date().toISOString();
  await save();
  await browser?.close();
  app?.close();
  console.log(JSON.stringify({ status: result.status, checks: result.checks, out }, null, 2));
}
