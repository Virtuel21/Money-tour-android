/** Production protocol acceptance over Nostr signaling and real WebRTC.
 * Two isolated desktop Chromium contexts import the real Session/Trystero modules.
 * No MemoryTransport, native bridge or game state mocks are used. Automatic game
 * clocks are disabled to compare immutable signed frames; UI/lifecycle acceptance
 * lives in the separate browser and APK scripts. ANDROID_NETWORK_LOCAL_SIGNALING=1
 * substitutes a deterministic in-process Nostr relay at the WebSocket boundary;
 * WebRTC data channels and the game protocol remain real. ANDROID_NETWORK_TURNSERVER_BIN
 * starts an ephemeral loopback-only coturn fixture with random test credentials.
 * This does not certify 4G or a production TURN service.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { qaServer } from './qa-server.mjs';

const out = path.resolve(
  process.env.ANDROID_NETWORK_OUT ?? 'artifacts/android-qa/network-protocol',
);
const localSignaling = process.env.ANDROID_NETWORK_LOCAL_SIGNALING === '1';
await mkdir(out, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  environment: `Two desktop Chromium contexts; real production protocol, ${localSignaling ? 'deterministic in-process Nostr relay' : 'public Nostr signaling'}, real WebRTC; automatic game clocks disabled for stable signed-frame comparison.`,
  limitations:
    'No native Android OS, physical phone, separate access networks, 4G/5G or publicly operated TURN service test.',
  checks: [],
  signaling: [],
  errors: [],
  status: 'running',
};
const save = () => writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
const check = async (message) => {
  report.checks.push(message);
  console.log(`PASS ${message}`);
  await save();
};
let app, browser, turnProcess;
let turnServers = [];
const pages = [];
const relayClients = new Set();
const relayEvents = new Map();
function relayMatches(event, filters) {
  return filters.some(
    (filter) =>
      (!filter.kinds || filter.kinds.includes(event.kind)) &&
      (!filter.since || event.created_at >= filter.since) &&
      (!filter['#x'] ||
        event.tags.some(([tag, value]) => tag === 'x' && filter['#x'].includes(value))),
  );
}
async function interceptLocalSignaling(context) {
  await context.routeWebSocket(
    (url) => url.protocol === 'wss:',
    (socket) => {
      const client = { socket, subscriptions: new Map() };
      relayClients.add(client);
      socket.onClose(() => relayClients.delete(client));
      socket.onMessage((data) => {
        const [kind, value, ...filters] = JSON.parse(String(data));
        if (kind === 'REQ') {
          client.subscriptions.set(value, filters);
          for (const event of relayEvents.values())
            if (relayMatches(event, filters)) socket.send(JSON.stringify(['EVENT', value, event]));
          socket.send(JSON.stringify(['EOSE', value]));
        } else if (kind === 'CLOSE') client.subscriptions.delete(value);
        else if (kind === 'EVENT') {
          relayEvents.set(value.id, value);
          socket.send(JSON.stringify(['OK', value.id, true, '']));
          for (const peer of relayClients)
            for (const [subscription, selectors] of peer.subscriptions)
              if (relayMatches(value, selectors))
                peer.socket.send(JSON.stringify(['EVENT', subscription, value]));
        }
      });
    },
  );
}
async function setup(page, { code, creator, recover = false }) {
  await page.evaluate(
    async ({ code, creator, recover, turnServers }) => {
      const [{ Session }, { TrysteroTransport }, { identity }] = await Promise.all([
        import('/src/network/session.ts'),
        import('/src/network/trystero.ts'),
        import('/src/network/crypto.ts'),
      ]);
      const user = recover
        ? JSON.parse(localStorage.getItem('qa-network-identity'))
        : await identity();
      const session = new Session(
        new TrysteroTransport(turnServers, turnServers.length > 0),
        user,
        creator ? 'HoteProtocoleQA' : 'InviteProtocoleQA',
        creator,
      );
      window.__networkSession = session;
      session.onPersist = (value) => {
        localStorage.setItem('qa-network-save', JSON.stringify(value));
      };
      localStorage.setItem('qa-network-identity', JSON.stringify(user));
      await session.join(
        code,
        recover ? JSON.parse(localStorage.getItem('qa-network-save')) : undefined,
        false,
      );
    },
    { code, creator, recover, turnServers },
  );
}
async function startTurnFixture(binary) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'moneytour-turn-'));
  const port = await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.on('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address();
      listener.close(() => resolve(port));
    });
  });
  const username = `qa-${randomBytes(8).toString('hex')}`;
  const credential = randomBytes(24).toString('hex');
  const configPath = path.join(directory, 'turnserver.conf');
  await writeFile(
    configPath,
    [
      'listening-ip=127.0.0.1',
      'relay-ip=127.0.0.1',
      `listening-port=${port}`,
      'min-port=60000',
      'max-port=60031',
      'realm=moneytour-local-qa',
      'lt-cred-mech',
      `user=${username}:${credential}`,
      'fingerprint',
      'no-cli',
      'no-tls',
      'no-dtls',
      'no-udp',
      'no-multicast-peers',
      'allow-loopback-peers',
      'denied-peer-ip=0.0.0.0-255.255.255.255',
      'allowed-peer-ip=127.0.0.1',
      'relay-threads=1',
      `pidfile=${path.join(directory, 'turnserver.pid')}`,
      `log-file=${path.join(directory, 'turnserver.log')}`,
    ].join('\n') + '\n',
    { mode: 0o600 },
  );
  turnProcess = spawn(binary, ['-c', configPath], { stdio: 'ignore' });
  let startupError;
  turnProcess.on('error', (error) => {
    startupError = error;
  });
  let started = false;
  for (let attempt = 0; attempt < 50 && !started; attempt++) {
    if (startupError) throw startupError;
    if (turnProcess.exitCode !== null) throw new Error('Local TURN fixture exited during startup');
    started = await new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    if (!started) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(started, 'Ephemeral loopback TURN/TCP fixture started');
  report.turnFixture = {
    listeningAddress: '127.0.0.1',
    transport: 'TURN over TCP',
    scope:
      'Random test credentials, loopback-only listener/relay peers; temporary local process. Does not provide a mobile TURN service.',
  };
  return [{ urls: `turn:127.0.0.1:${port}?transport=tcp`, username, credential }];
}
async function connected() {
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(() => window.__networkSession?.view.connected.length === 2, undefined, {
        timeout: 60000,
      }),
    ),
  );
}
try {
  try {
    report.browserManagedIpHandling =
      JSON.parse(await readFile('/etc/chromium/policies/managed/misc.json', 'utf8'))
        .WebRtcIPHandling ?? null;
  } catch {
    /* Managed Chromium policy is optional outside the cloud environment. */
  }
  if (process.env.ANDROID_NETWORK_TURNSERVER_BIN)
    turnServers = await startTurnFixture(process.env.ANDROID_NETWORK_TURNSERVER_BIN);
  app = await qaServer(process.env.ANDROID_NETWORK_URL, 4214);
  report.url = app.url;
  const proxyServer =
    process.env.LOBBY_QA_PROXY_SERVER ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  const proxy = proxyServer ? new URL(proxyServer) : null;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    ...(proxy && !localSignaling
      ? {
          proxy: {
            server: `${proxy.protocol}//${proxy.host}`,
            bypass: 'localhost,127.0.0.1',
            ...(proxy.username ? { username: decodeURIComponent(proxy.username) } : {}),
            ...(proxy.password ? { password: decodeURIComponent(proxy.password) } : {}),
          },
        }
      : {}),
  });
  report.browser = browser.version();
  const code = randomBytes(16).toString('hex');
  for (const role of ['host', 'guest']) {
    const context = await browser.newContext();
    if (localSignaling) await interceptLocalSignaling(context);
    await context.addInitScript(() => {
      window.__networkConnections = [];
      const PC = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends PC {
        constructor(...args) {
          super(...args);
          const record = {
            state: this.connectionState,
            ice: this.iceConnectionState,
            gathering: this.iceGatheringState,
            types: [],
            descriptions: {},
            errors: [],
          };
          window.__networkConnections.push(record);
          for (const method of ['setLocalDescription', 'setRemoteDescription']) {
            const original = this[method].bind(this);
            this[method] = async (...args) => {
              try {
                const value = await original(...args);
                record.descriptions.local = this.localDescription?.type;
                record.descriptions.remote = this.remoteDescription?.type;
                return value;
              } catch (error) {
                record.errors.push({ method, message: error.message });
                throw error;
              }
            };
          }
          this.addEventListener(
            'connectionstatechange',
            () => (record.state = this.connectionState),
          );
          this.addEventListener(
            'iceconnectionstatechange',
            () => (record.ice = this.iceConnectionState),
          );
          this.addEventListener(
            'icegatheringstatechange',
            () => (record.gathering = this.iceGatheringState),
          );
          this.addEventListener('icecandidate', ({ candidate }) => {
            if (candidate?.type && !record.types.includes(candidate.type))
              record.types.push(candidate.type);
          });
        }
      };
    });
    const page = await context.newPage();
    pages.push(page);
    page.on('pageerror', (error) => report.errors.push({ role, message: error.message }));
    page.on('websocket', (socket) => {
      if (!socket.url().startsWith('wss:')) return;
      const url = new URL(socket.url());
      const entry = { role, url: `${url.origin}${url.pathname}`, sent: 0, received: 0, errors: [] };
      report.signaling.push(entry);
      socket.on('framesent', () => entry.sent++);
      socket.on('framereceived', () => entry.received++);
      socket.on('socketerror', (message) => entry.errors.push(String(message)));
    });
    // A static same-origin document gives WebCrypto/module imports without a WebGL game scene.
    await page.goto(`${app.url}/favicon.svg`);
    await setup(page, { code, creator: role === 'host' });
  }
  await connected();
  await check(
    `Two authenticated peers connected through ${localSignaling ? 'deterministic local Nostr signaling' : 'public Nostr'} and real WebRTC`,
  );
  await pages[0].evaluate(() => window.__networkSession.start(2, false, 1200000, 'fast'));
  await Promise.all(
    pages.map((page) => page.waitForFunction(() => window.__networkSession.frames.length > 0)),
  );
  const start = await Promise.all(
    pages.map((page) => page.evaluate(() => window.__networkSession.frames[0])),
  );
  assert.deepEqual(start[0], start[1]);
  assert.equal(start[0].command.type, 'start');
  assert.equal(start[0].proof.context.participants.length, 2);
  report.startHash = start[0].result;
  await check('Signed start and random first-player proof are identical with two contributors');
  await Promise.all(
    pages.map((page) => page.evaluate(() => window.__networkSession.readyAdventure())),
  );
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(() => window.__networkSession.view.startGate === null),
    ),
  );
  await check('Both signed readiness confirmations released the shared introduction barrier');
  const actors = await Promise.all(
    pages.map((page) =>
      page.evaluate(() => {
        const session = window.__networkSession;
        return session.user.id === session.state.players[session.state.currentPlayer].id;
      }),
    ),
  );
  assert.equal(actors.filter(Boolean).length, 1);
  await pages[actors.indexOf(true)].evaluate(() => {
    const session = window.__networkSession;
    return session.intent({ type: 'roll', playerId: session.user.id });
  });
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(() =>
        window.__networkSession.frames.some(
          (frame) => frame.command.type === 'action' && frame.command.action.type === 'roll',
        ),
      ),
    ),
  );
  const rolls = await Promise.all(
    pages.map((page) =>
      page.evaluate(() =>
        window.__networkSession.frames.find(
          (frame) => frame.command.type === 'action' && frame.command.action.type === 'roll',
        ),
      ),
    ),
  );
  assert.deepEqual(rolls[0], rolls[1]);
  assert.equal(rolls[0].proof.context.participants.length, 2);
  report.rollHash = rolls[0].result;
  report.rollContributors = rolls[0].proof.context.participants.length;
  await check(
    'A real signed roll produced the same committed result and two-party draw proof on both peers',
  );
  await pages[1].evaluate(() => window.__networkSession.close());
  await pages[1].reload();
  await setup(pages[1], { code, creator: false, recover: true });
  await connected();
  await pages[1].waitForFunction(
    (result) => window.__networkSession.frames.some((frame) => frame.result === result),
    report.rollHash,
  );
  assert.equal(await pages[1].evaluate(() => window.__networkSession.head), report.rollHash);
  await check(
    'Guest reloaded with its saved identity and recovered the verified rolled history over WebRTC',
  );
  await pages[1].evaluate(() => window.__networkSession.taunt('laugh'));
  await pages[0].waitForFunction(() =>
    window.__networkSession.taunts.some((taunt) => taunt.kind === 'laugh'),
  );
  await check('The recovered human seat sent a signed reaction accepted by the host');
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack ?? String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  report.diagnostics = await Promise.all(
    pages.map((page) =>
      page
        .evaluate(() => {
          const session = window.__networkSession;
          return {
            status: session?.status,
            incidents: session?.incidents,
            connected: session?.view.connected.length,
            members: session?.members.map(({ name }) => name),
            frames: session?.frames.length,
            hash: session?.head,
            transport: window.__networkConnections,
          };
        })
        .catch((error) => ({ error: error.message })),
    ),
  );
  for (const page of pages)
    await page.evaluate(() => window.__networkSession?.close()).catch(() => {});
  report.finishedAt = new Date().toISOString();
  await save();
  await browser?.close();
  turnProcess?.kill();
  app?.close();
  console.log(JSON.stringify({ status: report.status, checks: report.checks, out }, null, 2));
}
