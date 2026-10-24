import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(wrapper, ['--no-daemon', 'assembleDebug', 'lintDebug'], {
  cwd: join(root, 'android'),
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const destination = join(root, 'artifacts/android');
const apkName = 'Money-Tour-Android-0.1.0-debug.apk';
mkdirSync(destination, { recursive: true });
copyFileSync(
  join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'),
  join(destination, apkName),
);
const digest = createHash('sha256')
  .update(readFileSync(join(destination, apkName)))
  .digest('hex');
writeFileSync(join(destination, 'SHA256SUMS.txt'), `${digest}  ${apkName}\n`);
console.log(`Android preview: artifacts/android/${apkName}`);
console.log(`SHA-256: ${digest}`);
