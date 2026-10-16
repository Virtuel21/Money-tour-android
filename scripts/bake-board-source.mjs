/** Capture lossless source patterns and exact layout measurements from the running game.
 * Start pnpm dev --port 4173, then run with an installed Playwright module.
 * PLAYWRIGHT_MODULE can point to a shared Playwright index.mjs outside this repository.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url))
  .replaceAll('\\', '/')
  .replace(/\/$/, '');
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage();
  await page.goto(process.env.BOARD_SOURCE_URL ?? 'http://127.0.0.1:4173/');
  const source = await page.evaluate(async (root) => {
    const { boardShape, tileFrame } = await import('/src/board/layout.ts');
    const { tileLabelRegions } = await import('/src/board/tileLabels.ts');
    const { streetSurface } = await import('/src/board/surfaces.ts');
    const { config } = await import(`/@fs/${root}/packages/engine/src/index.ts`);
    const variants = new Map();
    for (const tile of config.board) {
      const key = `${tile.type}:${tile.group ?? ''}:${tile.color ?? ''}`;
      if (!variants.has(key))
        variants.set(key, {
          key,
          png: streetSurface(tile).image.toDataURL('image/png').split(',')[1],
        });
    }
    return {
      shapes: [26, 28, 30, 32].map((count) => ({
        count,
        x: boardShape(count).x,
        z: boardShape(count).z,
        depth: boardShape(count).depth,
        step: boardShape(count).step,
        tiles: Array.from({ length: count }, (_, id) => ({
          id,
          ...tileFrame(id, count),
          label: {
            width: tileLabelRegions(id, count).width,
            rent: tileLabelRegions(id, count).rent,
          },
        })),
      })),
      variants: [...variants.values()],
    };
  }, root);
  const out = path.join(root, 'scripts/board-source');
  await mkdir(out, { recursive: true });
  for (const [i, variant] of source.variants.entries()) {
    variant.file = `surface-${i}.png`;
    await writeFile(path.join(out, variant.file), Buffer.from(variant.png, 'base64'));
    delete variant.png;
  }
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(source, null, 2) + '\n');
  console.log(
    `Captured ${source.variants.length} exact surface patterns and four layouts in ${out}`,
  );
} finally {
  await browser.close();
}
