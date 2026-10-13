import { config } from '@money-tour/engine';

/** Private commitments stay on this device, alongside the reconnect identity. */
export function savePrivateChoice(key: string, value: unknown, persistent: boolean): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* In-memory choices remain usable in the mounted game. */
  }
  if (persistent) {
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
    } catch {
      /* Recovery can still use the tab cache when available. */
    }
  }
}
export function readPrivateChoice(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* Try persistent recovery. */
  }
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (saved && saved.at <= Date.now() && Date.now() - saved.at < config.network.reconnectTtlMs)
      return saved.value;
  } catch {
    /* The caller validates a recovered choice against its commitment. */
  }
  return null;
}
