// Reuse Money Tour's original sailboat favicon; no external or generated artwork.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const resource = new URL('android/app/src/main/res/', root);
const original = readFileSync(new URL('apps/web/public/favicon.svg', root));
const sailboat = `
  <path d="M31 10v31H12z" fill="#fff6df"/>
  <path d="M36 17v24h17z" fill="#e8725b"/>
  <path d="M10 45h45l-10 9H20z" fill="#e6b94a"/>
`;
const roundIcon = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#142d3d"/><g transform="translate(3.2 3.2) scale(.9)">${sailboat}</g></svg>`,
);
for (const [density, size] of Object.entries({
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
})) {
  const destination = new URL(`mipmap-${density}/`, resource);
  const image = await sharp(original).resize(size, size).png().toBuffer();
  writeFileSync(new URL('ic_launcher.png', destination), image);
  await sharp(roundIcon)
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL('ic_launcher_round.png', destination)));
}
// The splash and adaptive/themed launcher use the centered vector resources.
console.log('Android legacy launcher icons regenerated from favicon.svg.');
