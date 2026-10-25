/** Real directory + Nostr/WebRTC acceptance. No network mocking or physical-phone claim. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { execute } from '../apps/web/src/network/session.ts';
import { drawSeed, hash } from '../apps/web/src/network/crypto.ts';
import { qaServer } from './qa-server.mjs';

const out = path.resolve(process.env.PUBLIC_QA_OUT ?? 'artifacts/public-games');
await mkdir(out, { recursive: true });
const server = await qaServer(process.env.PUBLIC_QA_URL, 4189);
const result = {
  url: server.url,
  checks: [],
  errors: [],
  transport:
    'Hosted HTTPS directory, public Nostr signaling, real WebRTC between isolated Chromium contexts',
  limitations: 'One Windows computer; no physical Android or Wi-Fi/4G/5G test',
};
const browser = await chromium.launch();
const pages = [];
async function page(role) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    localStorage.setItem('money-tour.language.v1', 'fr');
    window.__publicQaConnections = [];
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(...args) {
        super(...args);
        const connection = { state: this.connectionState, ice: this.iceConnectionState };
        window.__publicQaConnections.push(connection);
        this.addEventListener('connectionstatechange', () => {
          connection.state = this.connectionState;
        });
        this.addEventListener('iceconnectionstatechange', () => {
          connection.ice = this.iceConnectionState;
        });
      }
    };
  });
  const p = await context.newPage();
  pages.push(p);
  p.setDefaultTimeout(45000);
  p.on('pageerror', (error) => result.errors.push({ role, message: error.message }));
  await p.goto(server.url);
  return p;
}
async function find(p, name) {
  await p.getByRole('button', { name: 'En ligne', exact: true }).click();
  await p.getByRole('button', { name: 'Trouver une partie', exact: true }).click();
  const dialog = p.locator('.online-modal[open]');
  await dialog.getByLabel('Votre nom', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Trouver une partie', exact: true }).click();
}
async function stored(p) {
  return p.evaluate(() => {
    const resume = JSON.parse(localStorage.getItem('money-tour.online-resume.v1') ?? 'null');
    const saved = resume
      ? JSON.parse(localStorage.getItem(`money-tour.session.${resume.code}`) ?? 'null')?.save
      : null;
    return {
      code: resume?.code,
      frames: saved?.frames ?? [],
      members: saved?.members ?? [],
      host: saved?.host,
    };
  });
}
async function stateAt(frames) {
  let state = null;
  for (const frame of frames)
    state = execute(
      state,
      frame.command,
      frame.proof ? await drawSeed(frame.proof) : undefined,
    ).state;
  if (frames.length) assert.equal(await hash(state), frames.at(-1).result, 'history state hash');
  return state;
}
async function waitStored(p, kind) {
  await p.waitForFunction(
    (kind) => {
      const resume = JSON.parse(localStorage.getItem('money-tour.online-resume.v1') ?? 'null');
      const saved = resume
        ? JSON.parse(localStorage.getItem(`money-tour.session.${resume.code}`) ?? 'null')?.save
        : null;
      return saved?.frames?.some((frame) => frame.command.type === kind);
    },
    kind,
    { timeout: 60000 },
  );
}
try {
  const host = await page('host');
  await find(host, 'AlexRecette');
  await waitStored(host, 'start');
  const initial = await stored(host);
  const initialState = await stateAt(initial.frames);
  assert.equal(initialState.publicGame, true);
  assert.equal(initialState.players.length, 4);
  assert.equal(initialState.players.filter((player) => player.bot).length, 3);
  assert(initialState.players.every((player) => !/bot/i.test(player.name)));
  assert.equal(initialState.durationMs, 1200000);
  await host.screenshot({ path: path.join(out, 'fallback-public.png') });
  result.checks.push(
    'No match creates an advertised public game with four seats, three naturally named AI players and a twenty-minute duration',
  );

  // Allow the host's first playing advertisement to replace its pre-start lobby announcement.
  await host.waitForTimeout(1600);
  const guest = await page('guest');
  await find(guest, 'MilaRecette');
  await guest.waitForFunction(
    () => window.__publicQaConnections.some((connection) => connection.state === 'connected'),
    undefined,
    { timeout: 45000 },
  );
  // Exercise the automatic introduction release. Clicking its disappearing readiness
  // control races the twenty-second timer and is covered separately by app tests.
  await waitStored(guest, 'join_seat');
  let hostSave, guestSave;
  for (let attempt = 0; attempt < 40; attempt++) {
    [hostSave, guestSave] = await Promise.all([stored(host), stored(guest)]);
    if (hostSave.frames.at(-1)?.result === guestSave.frames.at(-1)?.result) break;
    await host.waitForTimeout(100);
  }
  assert.equal(hostSave.code, initial.code, 'host keeps its public room');
  assert.equal(guestSave.code, initial.code, 'finder joins the existing public game');
  assert.equal(hostSave.frames.at(-1)?.result, guestSave.frames.at(-1)?.result, 'peers converge');
  const admissionIndex = guestSave.frames.findIndex((frame) => frame.command.type === 'join_seat');
  assert(admissionIndex > 0);
  const admission = guestSave.frames[admissionIndex].command;
  const before = await stateAt(guestSave.frames.slice(0, admissionIndex));
  const after = await stateAt(guestSave.frames.slice(0, admissionIndex + 1));
  const oldSeat = before.players.find((player) => player.id === admission.member.seatId);
  const newSeat = after.players.find((player) => player.id === admission.member.seatId);
  assert.deepEqual(newSeat, { ...oldSeat, name: 'MilaRecette', bot: false });
  assert.deepEqual(after.properties, before.properties);
  assert.equal(after.publicSeats[admission.member.seatId], admission.member.id);
  await guest.locator('.player-profiles').waitFor();
  assert(
    (await guest.locator('.player-seat-label').allTextContents()).every((text) => text !== 'BOT'),
  );
  const connections = await Promise.all(
    pages.map((p) =>
      p.evaluate(
        () =>
          window.__publicQaConnections.filter((connection) => connection.state === 'connected')
            .length,
      ),
    ),
  );
  assert(
    connections.every((count) => count > 0),
    'actual WebRTC connection',
  );
  result.checks.push(
    'A second finder takes an original AI seat in the existing game over actual WebRTC',
  );
  result.checks.push(
    'Signed histories converge and preserve seat identity, cash, position and properties at admission',
  );
  let sharedDraw = false;
  for (let attempt = 0; attempt < 120 && !sharedDraw; attempt++) {
    for (const participant of pages) {
      const roll = participant.getByRole('button', { name: /^Lancer les dés/ }).first();
      if ((await roll.count()) && (await roll.isEnabled())) {
        await roll.click({ timeout: 1500 }).catch(() => {});
      }
    }
    const saved = await stored(guest);
    sharedDraw = saved.frames
      .slice(admissionIndex + 1)
      .some((frame) => frame.proof?.context.participants.length >= 2);
    if (!sharedDraw) await guest.waitForTimeout(500);
  }
  assert(sharedDraw, 'the new controller participates in a signed shared random draw');
  result.checks.push(
    'A shared random draw accepts both authenticated human contributors after the seat transfer',
  );
  await guest.screenshot({ path: path.join(out, 'guest-admitted.png') });
  result.connectedPeers = connections;
  result.admittedSeat = admission.member.seatId;
  result.historyFrames = guestSave.frames.length;
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
} catch (error) {
  result.failure = String(error);
  for (let index = 0; index < pages.length; index++) {
    await pages[index].screenshot({ path: path.join(out, `failure-${index}.png`) }).catch(() => {});
    result[`page${index}`] = await pages[index]
      .evaluate(() => ({
        text: document.body.innerText.slice(-6000),
        connections: window.__publicQaConnections,
      }))
      .catch(() => null);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  await writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
}
console.log(
  JSON.stringify({
    success: !result.failure,
    checks: result.checks.length,
    errors: result.errors.length,
    failure: result.failure,
    out,
  }),
);
