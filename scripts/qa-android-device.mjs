/** Native APK acceptance on a dedicated Android emulator/device.
 * This deliberately clears the installed test app; opt in with ANDROID_QA_ALLOW_RESET=1.
 * Requires a debuggable APK, adb and a running, unlocked Android device.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

assert.equal(
  process.env.ANDROID_QA_ALLOW_RESET,
  '1',
  'Use a dedicated device and explicitly set ANDROID_QA_ALLOW_RESET=1; app data will be cleared.',
);
const adbPath = process.env.ANDROID_HOME
  ? path.join(process.env.ANDROID_HOME, 'platform-tools/adb')
  : 'adb';
const serial = process.env.ANDROID_SERIAL;
const appId = 'com.moneytour.android';
const activity = `${appId}/.MainActivity`;
const port = Number(process.env.ANDROID_QA_CDP_PORT ?? 9223);
const out = path.resolve(process.env.ANDROID_DEVICE_QA_OUT ?? 'artifacts/android-qa/device');
const apk = path.resolve(
  process.env.ANDROID_QA_APK ?? 'artifacts/android/Money-Tour-Android-0.1.0-debug.apk',
);
const report = {
  startedAt: new Date().toISOString(),
  environment:
    'Real APK in Android WebView, native adb system input; emulator is not a physical phone.',
  checks: [],
  screenshots: [],
  errors: [],
  failures: [],
};
await fs.mkdir(out, { recursive: true });
const adb = (...args) =>
  execFileSync(adbPath, [...(serial ? ['-s', serial] : []), ...args], {
    encoding: 'utf8',
    timeout: 120_000,
  }).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const currentPid = () => {
  try {
    return adb('shell', 'pidof', appId);
  } catch {
    // am start can return before the new process has been scheduled.
    return null;
  }
};
const write = () =>
  fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const check = async (name, run) => {
  console.log(`Native acceptance: ${name}`);
  const details = await run();
  report.checks.push({ name, passed: true, details });
  await write();
};
const screenshot = async (name) => {
  const filename = `${name}.png`;
  await fs.writeFile(
    path.join(out, filename),
    execFileSync(adbPath, [...(serial ? ['-s', serial] : []), 'exec-out', 'screencap', '-p'], {
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  report.screenshots.push(filename);
};
let browser;
let initialWifi;
let initialMobileData;
let initialHardwareKeyboardIme;
try {
  adb('get-state');
  report.android = {
    release: adb('shell', 'getprop', 'ro.build.version.release'),
    api: adb('shell', 'getprop', 'ro.build.version.sdk'),
    model: adb('shell', 'getprop', 'ro.product.model'),
    display: adb('shell', 'wm', 'size'),
    density: adb('shell', 'wm', 'density'),
  };
  adb('install', '-r', apk);
  adb('shell', 'am', 'force-stop', appId);
  adb('shell', 'pm', 'clear', appId);
  initialWifi = adb('shell', 'settings', 'get', 'global', 'wifi_on');
  initialMobileData = adb('shell', 'settings', 'get', 'global', 'mobile_data');
  initialHardwareKeyboardIme = adb(
    'shell',
    'settings',
    'get',
    'secure',
    'show_ime_with_hard_keyboard',
  );
  adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1');
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adb('shell', 'wm', 'dismiss-keyguard');
  adb('shell', 'am', 'start', '-n', activity);
  let socket;
  for (let attempt = 0; attempt < 120; attempt++) {
    const pid = currentPid();
    if (pid)
      socket = adb('shell', 'cat', '/proc/net/unix')
        .split('\n')
        .find((line) => line.includes(`webview_devtools_remote_${pid}`))
        ?.split('@')[1];
    if (socket) break;
    await pause(1000);
  }
  assert(socket, 'Android WebView exposes debugging socket');
  adb('forward', `tcp:${port}`, `localabstract:${socket}`);
  // WebView does not implement Browser.setDownloadBehavior/context management.
  // Leave its native defaults intact, including focus/visibility lifecycle.
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
    timeout: 120_000,
    noDefaults: true,
  });
  const page = browser.contexts()[0].pages()[0];
  assert(page, 'The Android application contains a WebView page');
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  const touch = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const bounds = await locator.boundingBox();
    assert(bounds, 'Touch target is visible');
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('money-tour.local.v17')));
  await check('Cold launch completely offline', async () => {
    // Emulator language is usually English; choose French through the real UI
    // so the remaining assertions are independent of the system locale.
    await touch(page.getByRole('button', { name: 'Français', exact: true }));
    await page.getByRole('group', { name: 'Mode de jeu', exact: true }).waitFor();
    const platform = await page.evaluate(() => ({
      platform: window.Capacitor?.getPlatform(),
      secure: isSecureContext,
      origin: location.origin,
      viewport: { width: innerWidth, height: innerHeight },
      native: document.documentElement.dataset.platform,
    }));
    assert.equal(platform.platform, 'android');
    assert.equal(platform.native, 'android');
    assert.equal(platform.secure, true);
    assert.equal(platform.origin, 'https://localhost');
    assert.equal(
      await page.locator('.hero-map').count(),
      0,
      'No decorative 3D load before gameplay',
    );
    await screenshot('01-offline-home');
    return platform;
  });
  await check('Hardware Back closes settings', async () => {
    await touch(page.getByRole('button', { name: 'Réglages', exact: true }));
    const dialog = page.getByRole('dialog', { name: 'Votre confort de voyage' });
    await dialog.waitFor();
    await screenshot('02-native-settings');
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await dialog.waitFor({ state: 'hidden' });
    assert(await page.locator('.landing').isVisible());
  });
  await check('Native keyboard keeps the name field reachable', async () => {
    const originalHeight = await page.evaluate(() => innerHeight);
    const input = page.getByLabel('Nom du joueur 1', { exact: true });
    await touch(input);
    await page.waitForFunction((height) => innerHeight < height - 80, originalHeight, {
      timeout: 30000,
    });
    await input.fill('Android natif');
    const geometry = await input.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        viewportHeight: innerHeight,
        viewportFit: document.querySelector('meta[name="viewport"]').content,
      };
    });
    assert(
      geometry.top >= -1 && geometry.bottom <= geometry.viewportHeight + 1,
      'Name input stays above the keyboard',
    );
    assert(
      geometry.viewportFit.includes('viewport-fit=contain'),
      'Native WebView handles system insets from first paint',
    );
    await screenshot('03-native-keyboard');
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await page.waitForFunction((height) => innerHeight >= height - 10, originalHeight, {
      timeout: 30000,
    });
    assert(await page.locator('.landing').isVisible(), 'Back dismisses only the keyboard');
    return geometry;
  });
  await check('Offline hot-seat game, real WebGL board and local save', async () => {
    await page.getByRole('combobox', { name: /^Voyageurs/ }).selectOption('2');
    await page.getByLabel('Nom du joueur 1', { exact: true }).fill('Android natif');
    await page.getByLabel('Type du joueur 2', { exact: true }).selectOption('human');
    await touch(page.getByRole('button', { name: /^Jouer sur cet appareil/ }));
    const intro = page.getByRole('button', { name: 'Démarrer l’aventure', exact: true });
    await intro.waitFor({ timeout: 120_000 });
    await touch(intro);
    await page.locator('.board-canvas canvas').waitFor({ timeout: 180_000 });
    await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 180_000 });
    assert.equal(await page.locator('.board-fallback').count(), 0, 'Real 3D renderer is available');
    await page.waitForFunction(
      () =>
        document.querySelector('.board-hit-polygons polygon')?.getAttribute('points')?.length > 10,
      undefined,
      { timeout: 120_000 },
    );
    const stored = await save();
    assert.equal(stored.state.players.length, 2);
    assert.equal(stored.state.players[0].name, 'Android natif');
    await screenshot('03-offline-board');
    return { players: stored.state.players.length, phase: stored.state.phase };
  });
  await check('Background persists and pauses local game', async () => {
    const previous = await save();
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    // ADB input itself may take several seconds on an unaccelerated emulator.
    // Start measuring only once the native lifecycle callback has paused React.
    let pauseApplied = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: `[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Reprendre' && button.getAttribute('aria-pressed') === 'true')`,
        returnByValue: true,
      });
      if (result.value) {
        pauseApplied = true;
        break;
      }
      await pause(500);
    }
    assert(pauseApplied, 'Native background event pauses the local game');
    const paused = await save();
    await pause(3000);
    adb('shell', 'am', 'start', '-n', activity);
    await page
      .getByRole('button', { name: 'Reprendre', exact: true })
      .waitFor({ timeout: 120_000 });
    assert.equal(
      await page
        .getByRole('button', { name: 'Reprendre', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    const resumed = await save();
    assert.equal(resumed.seed, previous.seed);
    assert.equal(resumed.state.seq, previous.state.seq, 'No game action occurs in background');
    assert.equal(
      resumed.state.elapsedMs,
      paused.state.elapsedMs,
      'The paused game clock remains frozen throughout background and return',
    );
    await screenshot('04-return-paused');
    return { elapsedDeltaMs: resumed.state.elapsedMs - paused.state.elapsedMs };
  });
  await check('Hardware Back requests confirmation before leaving game', async () => {
    // A paused local game still uses the ordinary leave confirmation.
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    const leave = page.getByRole('dialog', { name: /accueil|quitter/i });
    await leave.waitFor();
    await screenshot('05-leave-confirmation');
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await leave.waitFor({ state: 'hidden' });
    assert(await page.locator('.game-layout').isVisible());
  });
  const stored = await save();
  await check('Process restart restores saved game', async () => {
    adb('shell', 'am', 'force-stop', appId);
    await browser.close();
    browser = undefined;
    adb('shell', 'am', 'start', '-n', activity);
    let restoredSocket;
    for (let i = 0; i < 120; i++) {
      const pid = currentPid();
      if (pid)
        restoredSocket = adb('shell', 'cat', '/proc/net/unix')
          .split('\n')
          .find((line) => line.includes(`webview_devtools_remote_${pid}`))
          ?.split('@')[1];
      if (restoredSocket) break;
      await pause(1000);
    }
    assert(restoredSocket);
    adb('forward', `tcp:${port}`, `localabstract:${restoredSocket}`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
      timeout: 120_000,
      noDefaults: true,
    });
    const restoredPage = browser.contexts()[0].pages()[0];
    restoredPage.setDefaultTimeout(120_000);
    restoredPage.on('pageerror', (error) => report.errors.push(error.message));
    await restoredPage.getByRole('button', { name: /Reprendre ma partie$/ }).waitFor();
    const restored = await restoredPage.evaluate(() =>
      JSON.parse(localStorage.getItem('money-tour.local.v17')),
    );
    assert.equal(restored.seed, stored.seed);
    assert.equal(restored.state.seq, stored.state.seq);
    await screenshot('06-restored-home');
    return { seedPreserved: true, actionsPreserved: true };
  });
  assert.deepEqual(report.errors, [], 'No JavaScript page errors');
} catch (error) {
  report.failures.push({ message: error.message, stack: error.stack });
  console.error(error);
  process.exitCode = 1;
  try {
    await screenshot('failure');
  } catch {
    /* Preserve the original error. */
  }
} finally {
  await browser?.close();
  try {
    if (initialWifi === '1' || initialWifi === '0')
      adb('shell', 'svc', 'wifi', initialWifi === '1' ? 'enable' : 'disable');
    if (initialMobileData === '1' || initialMobileData === '0')
      adb('shell', 'svc', 'data', initialMobileData === '1' ? 'enable' : 'disable');
    if (initialHardwareKeyboardIme === 'null')
      adb('shell', 'settings', 'delete', 'secure', 'show_ime_with_hard_keyboard');
    else if (initialHardwareKeyboardIme)
      adb(
        'shell',
        'settings',
        'put',
        'secure',
        'show_ime_with_hard_keyboard',
        initialHardwareKeyboardIme,
      );
  } catch {
    /* Device may be disconnected; keep the original test result. */
  }
  try {
    adb('forward', '--remove', `tcp:${port}`);
  } catch {
    /* Forward may never have been created. */
  }
  report.finishedAt = new Date().toISOString();
  await write();
  console.log(
    JSON.stringify({
      checks: report.checks.length,
      failures: report.failures.length,
      report: path.join(out, 'results.json'),
    }),
  );
}
