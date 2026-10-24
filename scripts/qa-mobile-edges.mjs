/** Mobile board compositing acceptance. Uses real WebGL, saved production rules,
 * ordinary UI taps and Chromium touch input; no physical phone is represented.
 * MOBILE_EDGE_QA_URL can target the public deployment. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createPlayerFixture } from './qa-player-fixtures.mjs';
import { qaServer } from './qa-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.MOBILE_EDGE_QA_OUT ?? '../../outputs/recette-mobile-bords');
await fs.mkdir(out, { recursive: true });
const app = await qaServer(process.env.MOBILE_EDGE_QA_URL, 4196);
const browser = await chromium.launch({ headless: true });
const report = {
  startedAt: new Date().toISOString(),
  url: app.url,
  browser: browser.version(),
  environment: 'Headless Chromium, emulated mobile viewport and CDP touch; real WebGL renderer.',
  checks: [],
  screenshots: [],
  errors: [],
  failures: [],
};
const selected = process.env.MOBILE_EDGE_QA_CASES?.split(',');
const write = () => fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
async function capture(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(out, filename), animations: 'disabled' });
  report.screenshots.push(filename);
}
async function ready(page) {
  await page.locator('.board-canvas canvas').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('.board-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector('.board-hit-polygons polygon')?.getAttribute('points')?.length > 10,
  );
  assert.equal(await page.locator('.board-fallback').count(), 0);
}
async function fullBleed(page) {
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      overflowY: document.documentElement.scrollHeight > innerHeight,
      logicalViewport: rect('.board-viewport'),
      boxes: Object.fromEntries(
        ['.board-shell', '.board-canvas', '.board-canvas canvas', '.board-hit-polygons'].map(
          (selector) => [selector, rect(selector)],
        ),
      ),
    };
  });
  for (const [selector, box] of Object.entries(geometry.boxes)) {
    assert(box.x <= 0, `${selector} starts at x=${box.x}, leaving a side band`);
    assert(box.y <= 0, `${selector} starts at y=${box.y}, clipping the board above`);
    assert(box.x + box.width >= geometry.width, `${selector} clips the right edge`);
    assert(box.y + box.height >= geometry.height, `${selector} clips the bottom edge`);
  }
  assert.equal(geometry.overflowX, false, 'No horizontal page overflow');
  assert.equal(geometry.overflowY, false, 'No vertical page overflow');
  return geometry;
}
async function touchPan(page) {
  await page.locator('.board-can-pan').waitFor();
  const start = await page.evaluate(() => {
    for (let y = innerHeight * 0.35; y < innerHeight * 0.7; y += 15)
      for (let x = innerWidth * 0.3; x < innerWidth * 0.65; x += 15)
        if (document.elementFromPoint(x, y)?.closest('.board-shell')) return { x, y };
    return null;
  });
  assert(start, 'Exposed board surface accepts the pan gesture');
  const before = await page.locator('.board-hit-polygons polygon').first().getAttribute('points');
  const session = await page.context().newCDPSession(page);
  const { width, height } = page.viewportSize();
  try {
    for (let frame = 0; frame <= 4; frame++) {
      await session.send('Input.dispatchTouchEvent', {
        type: frame === 0 ? 'touchStart' : 'touchMove',
        touchPoints: [
          {
            id: 0,
            x: start.x + (width * 0.18 * frame) / 4,
            y: start.y + (height * 0.04 * frame) / 4,
            radiusX: 4,
            radiusY: 4,
            force: 1,
          },
        ],
      });
      await page.waitForTimeout(50);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
  await page.waitForTimeout(700);
  const after = await page.locator('.board-hit-polygons polygon').first().getAttribute('points');
  assert.notEqual(after, before, 'The touch pan moves the real board projections');
  assert.equal(await page.locator('dialog[open]').count(), 0, 'A pan does not inspect a tile');
  return { start, projectionsMoved: true };
}
async function followAnchor(page) {
  const framing = await page.evaluate(() => {
    const pawn = document.querySelector('.pawn-foreground');
    const shell = document.querySelector('.board-shell').getBoundingClientRect();
    const safe = document.querySelector('.board-viewport').getBoundingClientRect();
    const anchor = {
      x: shell.x + (parseFloat(pawn.style.left) * shell.width) / 100,
      y: shell.y + (parseFloat(pawn.style.top) * shell.height) / 100,
    };
    return {
      anchor,
      safe: { x: safe.x, y: safe.y, width: safe.width, height: safe.height },
      expectedCenter: { x: safe.x + safe.width / 2, y: safe.y + safe.height / 2 },
    };
  });
  assert(
    Math.abs(framing.anchor.x - framing.expectedCenter.x) < 3,
    'Follow camera preserves the logical horizontal center at every zoom',
  );
  // The anchor is on the tile (world y=0.27), slightly below the camera target
  // (world y=0.6); the character itself rises above that anchor.
  assert(
    Math.abs(framing.anchor.y - framing.expectedCenter.y) < Math.max(12, framing.safe.height * 0.2),
    'Follow camera keeps the active pawn in the logical board cell',
  );
  return framing;
}
async function projectedTileTap(page) {
  const target = await page.evaluate(() => {
    const svg = document.querySelector('.board-hit-polygons');
    const bounds = svg.getBoundingClientRect();
    const inside = (point, polygon) => {
      let hit = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i],
          [xj, yj] = polygon[j];
        if (
          yi > point[1] !== yj > point[1] &&
          point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
        )
          hit = !hit;
      }
      return hit;
    };
    const projected = [...svg.querySelectorAll('polygon')].map((polygon) => {
      const points = polygon
        .getAttribute('points')
        .trim()
        .split(/\s+/)
        .map((p) => {
          const [x, y] = p.split(',').map(Number);
          return [bounds.x + (x * bounds.width) / 100, bounds.y + (y * bounds.height) / 100];
        });
      return { polygon, points };
    });
    const candidates = [];
    for (let y = 12; y < innerHeight - 12; y += 12)
      candidates.push([2, y, true], [innerWidth - 3, y, true]);
    for (let y = 20; y < innerHeight - 20; y += 12)
      for (let x = 20; x < innerWidth - 20; x += 12) candidates.push([x, y, false]);
    for (const [x, y, edgeTap] of candidates)
      for (const { polygon, points } of projected)
        if (inside([x, y], points) && document.elementFromPoint(x, y) === polygon)
          return { x, y, edgeTap, label: polygon.getAttribute('aria-label') };
    return null;
  });
  assert(target, 'A visible projected tile has a tappable interior');
  await page.touchscreen.tap(target.x, target.y);
  await page.locator('dialog[open]').waitFor();
  const title = await page.locator('dialog[open] h2').innerText();
  assert(target.label.includes(title), `Projection ${target.label} opened ${title}`);
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'hidden' });
  return { ...target, opened: title };
}
async function edgePixels(page, name) {
  // A diagnostic background distinguishes transparent ocean from an erroneous
  // foreground illustration covering an opaque board tile at the screen edge.
  const diagnostic = await page.addStyleTag({
    content:
      '.archipelago-backdrop { background: #ff00ff !important; } .archipelago-backdrop__art, .archipelago-backdrop::after { visibility: hidden !important; }',
  });
  try {
    const samples = await page.evaluate(() => {
      const svg = document.querySelector('.board-hit-polygons');
      const b = svg.getBoundingClientRect();
      const polygons = [...svg.querySelectorAll('polygon')].map((polygon) => ({
        polygon,
        points: polygon
          .getAttribute('points')
          .trim()
          .split(/\s+/)
          .map((p) => {
            const [x, y] = p.split(',').map(Number);
            return [b.x + (x * b.width) / 100, b.y + (y * b.height) / 100];
          }),
      }));
      const inside = (x, y, points) => {
        let hit = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i],
            [xj, yj] = points[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
      };
      // Hit hulls include the bevel and the tiny gaps between physical tiles.
      // Sample solid interiors, excluding those intentional transparent seams.
      const safelyInside = (x, y, points) => {
        if (!inside(x, y, points)) return false;
        return points.every(([ax, ay], index) => {
          const [bx, by] = points[(index + 1) % points.length];
          const dx = bx - ax,
            dy = by - ay;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
          return Math.hypot(x - ax - t * dx, y - ay - t * dy) >= 6;
        });
      };
      const candidates = [];
      for (let y = 4; y < innerHeight - 4; y += 4)
        candidates.push([1, y, 'left'], [innerWidth - 2, y, 'right']);
      for (let x = 4; x < innerWidth - 4; x += 4)
        candidates.push([x, 1, 'top'], [x, innerHeight - 2, 'bottom']);
      return candidates.filter(([x, y]) =>
        polygons.some(
          ({ polygon, points }) =>
            safelyInside(x, y, points) && document.elementFromPoint(x, y) === polygon,
        ),
      );
    });
    const buffer = await page.screenshot({ animations: 'disabled' });
    await fs.writeFile(path.join(out, `${name}-diagnostic.png`), buffer);
    const { data, info } = await sharp(buffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const covered = samples.map(([x, y, side]) => {
      const offset = (Math.floor(y) * info.width + Math.floor(x)) * info.channels;
      const rgb = [...data.subarray(offset, offset + 3)];
      assert(
        !(rgb[0] > 245 && rgb[1] < 15 && rgb[2] > 245),
        `Backdrop covers tile at ${side} (${x},${y}): ${rgb}`,
      );
      return { x, y, side, rgb };
    });
    return {
      checkedPixels: covered.length,
      minimumDistanceFromTileEdge: 6,
      sides: [...new Set(covered.map((p) => p.side))],
      samples: covered.slice(0, 12),
    };
  } finally {
    await diagnostic.evaluate((element) => element.remove());
  }
}

try {
  for (const [width, height] of [
    [390, 844],
    [502, 650],
    [320, 740],
    [844, 390],
  ]) {
    for (const zoom of [100, 200, 400, ...(width === 502 ? [150] : [])]) {
      const name = `mobile-${width}x${height}-zoom-${zoom}`;
      if (selected && !selected.includes(name)) continue;
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      try {
        const fixture = createPlayerFixture('two');
        fixture.save.state.currentPlayer = 0;
        fixture.save.state.players[0].position = fixture.save.state.config.board.find(
          (tile) => tile.name === 'Rome',
        ).id;
        if (zoom === 150) fixture.save.state.phase = 'property';
        await context.addInitScript(
          ({ save, zoom }) => {
            localStorage.clear();
            localStorage.setItem('money-tour.local.v17', JSON.stringify(save));
            localStorage.setItem('money-tour.language.v1', 'fr');
            localStorage.setItem(
              'money-tour.audio',
              JSON.stringify({ music: false, effects: false }),
            );
            localStorage.setItem(
              'money-tour.comfort',
              JSON.stringify({ boardZoom: zoom, pace: 'normal', largeText: false }),
            );
          },
          { save: fixture.save, zoom },
        );
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.on('pageerror', (error) => report.errors.push({ name, message: error.message }));
        await page.goto(app.url);
        await page.getByRole('button', { name: /Reprendre ma partie$/ }).click({ timeout: 45000 });
        await ready(page);
        if (zoom === 150) {
          await page.locator('dialog[open]').waitFor();
          await page.keyboard.press('Escape');
          await page.locator('dialog[open]').waitFor({ state: 'hidden' });
        }
        await page.getByRole('button', { name: 'Suivre mon pion', exact: true }).tap();
        await page.getByRole('button', { name: 'Vue globale', exact: true }).waitFor();
        await page.waitForTimeout(900);
        const follow = await fullBleed(page);
        const framing = await followAnchor(page);
        if (zoom === 150)
          await page
            .getByText('Choisissez votre niveau de construction', { exact: true })
            .waitFor();
        await capture(page, `${name}-follow`);
        const followEdges = await edgePixels(page, `${name}-follow`);
        let tipDismissedFraming;
        if (zoom === 150) {
          await page.getByRole('button', { name: 'Masquer ce conseil', exact: true }).tap();
          await page.locator('.context-tip').waitFor({ state: 'hidden' });
          await page.waitForTimeout(700);
          await fullBleed(page);
          tipDismissedFraming = await followAnchor(page);
          await capture(page, `${name}-conseil-masque`);
        }
        const tile = await projectedTileTap(page);
        const pan = await touchPan(page);
        const panned = await fullBleed(page);
        await capture(page, `${name}-pan`);
        const panEdges = await edgePixels(page, `${name}-pan`);
        // HUD remains above the full-screen renderer and receives a real touch.
        await page.getByRole('button', { name: 'Journal des actions', exact: true }).tap();
        await page.locator('dialog[open]').waitFor();
        await page.keyboard.press('Escape');
        await page.locator('dialog[open]').waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Pause', exact: true }).tap();
        await page.getByRole('button', { name: 'Reprendre', exact: true }).waitFor();
        assert.equal(
          await page.evaluate(
            () => JSON.parse(localStorage.getItem('money-tour.comfort')).boardZoom,
          ),
          zoom,
        );
        report.checks.push({
          name,
          passed: true,
          follow,
          framing,
          tipDismissedFraming,
          panned,
          followEdges,
          panEdges,
          tile,
          pan,
          hudTappable: true,
        });
        console.log(`PASS ${name}`);
      } catch (error) {
        report.failures.push({ name, message: error.message, stack: error.stack });
        const failurePage = context.pages()[0];
        if (failurePage) await capture(failurePage, `${name}-failure`).catch(() => {});
        console.log(`FAIL ${name}: ${error.message}`);
      } finally {
        await context.close();
        await write();
      }
    }
  }
  assert.deepEqual(report.errors, [], 'No browser application errors');
  assert.deepEqual(report.failures, [], 'All mobile edge checks pass');
} finally {
  report.completedAt = new Date().toISOString();
  await write();
  await browser.close();
  app.close();
}
