import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const capacitor = fileURLToPath(new URL('node_modules/@capacitor/cli/bin/capacitor', root));
const result = spawnSync(process.execPath, [capacitor, 'sync', 'android'], {
  cwd: fileURLToPath(root),
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// Android owns its system-bar, display-cutout and keyboard insets natively.
// Set this in the packaged HTML before its first paint, avoiding any race with
// SystemBars.onPageCommitVisible. The browser build keeps viewport-fit=cover.
const index = new URL('android/app/src/main/assets/public/index.html', root);
const html = readFileSync(index, 'utf8');
if (!html.includes('viewport-fit=cover') && !html.includes('viewport-fit=contain')) {
  throw new Error('The Android viewport must explicitly declare viewport-fit.');
}
writeFileSync(index, html.replaceAll('viewport-fit=cover', 'viewport-fit=contain'));
