import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function qaServer(existing, port) {
  if (existing) return { url: existing.replace(/\/$/, ''), close() {} };
  const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: fileURLToPath(new URL('../apps/web', import.meta.url)),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (chunk) => {
      log = (log + chunk).slice(-3000);
    });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`QA server exited: ${log}`);
    try {
      if ((await fetch(url)).ok) return { url, close: () => server.kill() };
    } catch {
      /* Starting Vite. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill();
  throw new Error(`QA server did not become ready: ${log}`);
}
