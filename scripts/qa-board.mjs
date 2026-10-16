/** Real browser acceptance: canvas composition, resizes, rotations and game interactions.
 * Run pnpm qa:board:install once, then pnpm qa:board. No server or test DOM overrides needed.
 * BOARD_QA_URL reuses a dev server; BOARD_QA_OUT and BOARD_QA_BROWSERS customize the run.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.env.BOARD_QA_OUT ?? path.join(root, 'artifacts/board-qa'));
const requested = (
  process.env.BOARD_QA_BROWSERS ??
  (process.platform === 'win32' ? 'chromium,chrome,edge,firefox,webkit' : 'chromium,firefox,webkit')
).split(',');
const definitions = {
  chromium: [chromium, {}],
  chrome: [chromium, { channel: 'chrome' }],
  edge: [chromium, { channel: 'msedge' }],
  firefox: [firefox, { firefoxUserPrefs: { 'webgl.force-enabled': true } }],
  webkit: [webkit, {}],
};
const screens = [
  [320, 740],
  [390, 844],
  [430, 932],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1440, 1000],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];
const scenarios = [
  'purchase',
  'travel',
  'mondial',
  'crowded',
  'architecture',
  'insured-properties',
  'auction',
];
const result = {
  startedAt: new Date().toISOString(),
  browsers: {},
  frames: [],
  interactions: [],
  failures: [],
};
let server;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await mkdir(out, { recursive: true });
const pwRequire = createRequire(import.meta.resolve('playwright'));
const coreRoot = path.dirname(pwRequire.resolve('playwright-core/package.json'));
const versions = JSON.parse(await readFile(path.join(coreRoot, 'browsers.json'), 'utf8'));
result.webKitRevision = versions.browsers.find((b) => b.name === 'webkit').revision;
if (process.platform === 'win32' && requested.includes('webkit')) {
  assert(
    Number(result.webKitRevision) >= 2376,
    'This WebKit Windows build has the canvas-resize composition bug. Use the pinned Playwright dependency.',
  );
}
async function save() {
  await writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
}
async function startServer() {
  if (process.env.BOARD_QA_URL) return process.env.BOARD_QA_URL.replace(/\/$/, '');
  const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  const url = 'http://127.0.0.1:4176';
  let log = '';
  server = spawn(
    process.execPath,
    [vite, '--host', '127.0.0.1', '--port', '4176', '--strictPort'],
    {
      cwd: path.join(root, 'apps/web'),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout.on('data', (chunk) => {
    log = (log + chunk).slice(-3000);
  });
  server.stderr.on('data', (chunk) => {
    log = (log + chunk).slice(-3000);
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`QA server exited: ${log}`);
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      /* Starting Vite. */
    }
    await sleep(100);
  }
  throw new Error(`QA server did not become ready: ${log}`);
}
async function waterPixels(bytes) {
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] < 80 && data[i + 1] > 140 && data[i + 2] > 130 && data[i + 2] < data[i + 1] * 1.2)
      count++;
  }
  return count;
}
async function ready(page) {
  await page.waitForSelector('[data-label-kind="name"]', { timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('.turn-banner'));
}
async function dismissTip(page) {
  const button = page.getByRole('button', { name: 'Masquer ce conseil' });
  if (await button.count()) await button.click({ timeout: 15000 });
}
async function capture(page, browser, name, composed = true) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.waitForTimeout(180);
  const details = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    overflow: document.documentElement.scrollWidth > innerWidth,
    labels: document.querySelectorAll('[data-label-kind="name"]').length,
    camera: document.querySelector('.board-shell')?.getAttribute('data-camera'),
    contexts: [
      ...document.querySelectorAll('.board-canvas canvas, .festival-foreground-layer'),
    ].map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      lost: canvas.getContext('webgl2').isContextLost(),
    })),
  }));
  const filename = `${browser}-${name}.png`;
  const image = await page.screenshot({ path: path.join(out, filename) });
  // Frames covered by a decision dialog are checked in the live canvas as well.
  const buffer = composed
    ? image
    : Buffer.from(
        (
          await page
            .locator('.board-canvas canvas')
            .evaluate(
              (canvas) =>
                new Promise((resolve) => requestAnimationFrame(() => resolve(canvas.toDataURL()))),
            )
        ).split(',')[1],
        'base64',
      );
  const water = await waterPixels(buffer);
  const frame = { browser, name, filename, ...details, waterPixels: water, composed };
  result.frames.push(frame);
  assert(!details.overflow, `${browser}/${name}: horizontal overflow`);
  assert.equal(details.labels, 32, `${browser}/${name}: missing board names`);
  assert(
    details.contexts.every((c) => !c.lost && c.width > 0 && c.height > 0),
    `${browser}/${name}: invalid WebGL context`,
  );
  assert(water > 500, `${browser}/${name}: board is absent (${water} water pixels)`);
  return frame;
}
async function propertyPoint(page, name) {
  return page.getByRole('button', { name: new RegExp(`^Voir ${name}`) }).evaluate((polygon) => {
    const points = [...polygon.points];
    const bounds = polygon.ownerSVGElement.getBoundingClientRect();
    return {
      x: bounds.x + (points.reduce((sum, p) => sum + p.x, 0) / points.length / 100) * bounds.width,
      y: bounds.y + (points.reduce((sum, p) => sum + p.y, 0) / points.length / 100) * bounds.height,
    };
  });
}
async function modal(page, name) {
  await page
    .locator('dialog[open]')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .waitFor();
}
async function resizeProbe(browser, name) {
  const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
  await page.setContent(`<body style="margin:0"><canvas></canvas><script>
    const gl=document.querySelector('canvas').getContext('webgl');
    function resize(){gl.canvas.width=innerWidth;gl.canvas.height=innerHeight;gl.viewport(0,0,innerWidth,innerHeight);}
    addEventListener('resize',resize);resize();
    (function frame(){gl.clearColor(1,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);requestAnimationFrame(frame);})();
  </script></body>`);
  for (const height of [844, 664, 844]) {
    await page.setViewportSize({ width: 390, height });
    await page.waitForTimeout(180);
    const shot = await page.screenshot();
    const pixel = await sharp(shot)
      .extract({ left: 195, top: Math.floor(height / 2), width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    assert.deepEqual(
      [...pixel],
      [255, 0, 0],
      `${name}: WebGL canvas composition broke after resize`,
    );
  }
  result.interactions.push({ browser: name, test: 'native WebGL resize probe ×3', pass: true });
  await page.close();
}
async function firstVisit(browser, name, base) {
  for (const [width, height] of [
    [568, 320],
    [667, 375],
    [844, 390],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
      hasTouch: name !== 'firefox',
    });
    try {
      const page = await context.newPage();
      await page.goto(base + '/?scenario=showcase');
      await ready(page);
      const dismiss = page.getByRole('button', { name: 'Masquer ce conseil' });
      const bounds = await dismiss.boundingBox();
      assert(
        bounds.y >= 0 && bounds.y + bounds.height <= height,
        `${name}: landscape advice cannot be dismissed`,
      );
      assert(bounds.height >= 44, `${name}: advice touch target is too small`);
      const text = page.locator('.context-tip > div');
      const adviceBounds = await text.boundingBox();
      assert(adviceBounds.height >= 24, `${name}: advice text has no readable scroll area`);
      await text.focus();
      await page.keyboard.press('End');
      await capture(page, name, `first-visit-${width}x${height}`);
      await dismiss.click();
      await capture(page, name, `advice-closed-${width}x${height}`);
      const roll = await page.getByRole('button', { name: /Lancer les dés/ }).boundingBox();
      assert(roll.y >= 0 && roll.y + roll.height <= height, `${name}: roll action is off screen`);
    } finally {
      await context.close();
    }
  }
  result.interactions.push({
    browser: name,
    test: 'first visit: scrollable landscape advice, visible dismissal and roll action ×3',
    pass: true,
  });
}
async function interactions(page, context, name, touch) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const point = await propertyPoint(page, 'Lisbonne');
  await page.mouse.click(point.x, point.y);
  await modal(page, 'Lisbonne');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Vue globale', exact: true }).click();
  await page.waitForSelector('.board-shell[data-camera="overview"]');
  await capture(page, name, 'interactive-overview');
  const visible = await page.locator('[data-label-kind="name"]').evaluateAll(
    (labels) =>
      labels.filter((el) => {
        const b = el.getBoundingClientRect();
        return (
          b.x + b.width / 2 >= 0 &&
          b.x + b.width / 2 < innerWidth &&
          b.y + b.height / 2 >= 0 &&
          b.y + b.height / 2 < innerHeight
        );
      }).length,
  );
  assert.equal(visible, 32, `${name}: overview clips labels`);
  const mobilePoint = await propertyPoint(page, 'Porto');
  if (touch) await page.touchscreen.tap(mobilePoint.x, mobilePoint.y);
  else await page.mouse.click(mobilePoint.x, mobilePoint.y);
  await modal(page, 'Porto');
  await page.keyboard.press('Escape');
  result.interactions.push({
    browser: name,
    test: 'property click, mobile overview and property tap',
    pass: true,
  });
  if (['chromium', 'chrome', 'edge'].includes(name)) {
    await page.getByRole('button', { name: 'Suivre mon pion', exact: true }).click();
    await page.waitForSelector('.board-shell[data-camera="follow"]');
    const cdp = await context.newCDPSession(page);
    const box = await page.locator('.board-shell').boundingBox();
    const y = box.y + box.height / 2,
      x = 195;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 45, y, id: 1 },
        { x: x + 45, y, id: 2 },
      ],
    });
    for (const delta of [55, 65, 75])
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: x - delta, y, id: 1 },
          { x: x + delta, y, id: 2 },
        ],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(450);
    const zoom = await page.evaluate(
      () => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom,
    );
    assert(zoom > 100);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 180, y, id: 3 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 225, y: y + 15, id: 3 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForSelector('.board-shell[data-camera="manual"]');
    await page.getByRole('button', { name: 'Recentrer mon pion', exact: true }).click();
    await page.waitForSelector('.board-shell[data-camera="follow"]');
    await capture(page, name, 'pinch-pan-recenter');
    result.interactions.push({ browser: name, test: 'pinch, drag and recenter', zoom, pass: true });
  }
}
try {
  const base = await startServer();
  result.baseURL = base;
  for (const name of requested) {
    let browser;
    try {
      assert(definitions[name], `Unknown browser: ${name}`);
      const [engine, options] = definitions[name];
      browser = await engine.launch({ headless: true, ...options });
      result.browsers[name] = browser.version();
      await resizeProbe(browser, name);
      await firstVisit(browser, name, base);
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
        hasTouch: name !== 'firefox',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + '/?scenario=showcase');
      await ready(page);
      await dismissTip(page);
      await capture(page, name, 'tip-dismissed');
      for (const [width, height] of screens) {
        await page.setViewportSize({ width, height });
        await capture(page, name, `${width}x${height}`);
      }
      await interactions(page, context, name, name !== 'firefox');
      await context.close();
      const retina = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: name !== 'firefox',
        reducedMotion: 'reduce',
      });
      const phone = await retina.newPage();
      phone.on('pageerror', (e) => errors.push(e.message));
      await phone.goto(base + '/?scenario=showcase');
      await ready(phone);
      await dismissTip(phone);
      for (let repeat = 1; repeat <= 3; repeat++) {
        for (const [width, height] of [
          [844, 390],
          [390, 844],
        ]) {
          await phone.setViewportSize({ width, height });
          await capture(phone, name, `rotation-${repeat}-${width}x${height}-dpr2`);
        }
      }
      await retina.close();
      const scenes = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
        hasTouch: name !== 'firefox',
      });
      const scene = await scenes.newPage();
      scene.on('pageerror', (e) => errors.push(e.message));
      for (const scenario of scenarios) {
        await scene.setViewportSize({ width: 390, height: 844 });
        await scene.goto(base + '/?scenario=' + scenario);
        await ready(scene);
        for (const [width, height] of [
          [390, 844],
          [844, 390],
        ]) {
          await scene.setViewportSize({ width, height });
          await capture(scene, name, `${scenario}-${width}x${height}`, false);
        }
      }
      await scenes.close();
      assert.deepEqual(errors, [], `${name}: JavaScript exceptions`);
      console.log(
        `${name} ${browser.version()}: resize, rotations, interactions and ${scenarios.length} scenarios passed`,
      );
    } catch (error) {
      result.failures.push({ browser: name, error: String(error) });
      console.error(name, String(error));
    } finally {
      await browser?.close();
      await save();
    }
  }
} finally {
  server?.kill();
  result.finishedAt = new Date().toISOString();
  result.success = result.failures.length === 0;
  result.physicalDevices = 'Not tested: Android, iPhone and real Safari';
  await save();
}
console.log(
  JSON.stringify({
    success: result.success,
    frames: result.frames.length,
    interactions: result.interactions.length,
    failures: result.failures,
    out,
  }),
);
if (!result.success) process.exitCode = 1;
