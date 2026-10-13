import { config } from '@money-tour/engine';
import { z } from 'zod';
import type { Identity } from './crypto';
import { frameSchema, memberSchema } from './schema';
import type { SavedSession } from './session';

const resumeKey = 'money-tour.online-resume.v1';
const resumeSchema = z.object({
  code: z.string().regex(/^[a-f0-9]{32}$/i),
  name: z.string().min(1).max(20),
  creator: z.boolean(),
  at: z.number(),
});
export type OnlineResume = z.infer<typeof resumeSchema>;
const savedSchema = z.object({
  room: z.string().length(64),
  host: z.string(),
  epoch: z.number().int().nonnegative(),
  members: z.array(memberSchema).max(4),
  frames: z.array(frameSchema).max(15000),
});
function fresh(at: number): boolean {
  return at <= Date.now() && Date.now() - at < config.network.reconnectTtlMs;
}
export function loadOnlineResume(code?: string): OnlineResume | null {
  try {
    const result = resumeSchema.safeParse(JSON.parse(localStorage.getItem(resumeKey) ?? 'null'));
    if (!result.success || !fresh(result.data.at) || (code && code !== result.data.code))
      return null;
    return loadOnlineIdentity(result.data.code) ? result.data : null;
  } catch {
    return null;
  }
}
export function loadOnlineIdentity(code: string): Identity | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(`money-tour.identity.${code}`) ?? 'null');
    if (stored && fresh(stored.at) && typeof stored.identity?.id === 'string')
      return stored.identity;
  } catch {
    /* Storage can be unavailable. */
  }
}
export function loadOnlineSession(code: string): SavedSession | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(`money-tour.session.${code}`) ?? 'null');
    if (stored && fresh(stored.at)) {
      const parsed = savedSchema.safeParse(stored.save);
      if (parsed.success) return parsed.data;
    }
    // Upgrade the cache of a tab that was open before persistent recovery existed.
    const legacy = savedSchema.safeParse(
      JSON.parse(sessionStorage.getItem(`money-tour.session.${code}`) ?? 'null'),
    );
    if (legacy.success) return legacy.data;
  } catch {
    /* A malformed cache must not prevent a fresh authenticated sync. */
  }
}
export function rememberOnline(
  resume: Omit<OnlineResume, 'at'>,
  user: Identity,
  save?: SavedSession,
): boolean {
  try {
    const at = Date.now();
    localStorage.setItem(
      `money-tour.identity.${resume.code}`,
      JSON.stringify({ at, identity: user }),
    );
    if (save)
      localStorage.setItem(`money-tour.session.${resume.code}`, JSON.stringify({ at, save }));
    localStorage.setItem(resumeKey, JSON.stringify({ ...resume, at }));
    return true;
  } catch {
    return false;
  }
}
export function forgetOnlineResume(code: string): void {
  try {
    if (loadOnlineResume()?.code === code) localStorage.removeItem(resumeKey);
  } catch {
    /* Optional storage. */
  }
}
