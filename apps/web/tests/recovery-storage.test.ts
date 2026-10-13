// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { config } from '@money-tour/engine';
import { identity } from '../src/network/crypto';
import { Session } from '../src/network/session';
import { MemoryNetwork, MemoryTransport } from '../src/network/transport';
import {
  loadOnlineIdentity,
  loadOnlineResume,
  loadOnlineSession,
  rememberOnline,
  forgetOnlineResume,
} from '../src/network/storage';
import { readPrivateChoice, savePrivateChoice } from '../src/game/privateStorage';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});
it('reopens a closed tab with the same signing identity and verified game history', async () => {
  const code = 'c'.repeat(32);
  const user = await identity();
  const resume = { code, name: 'Camille', creator: true };
  const network = new MemoryNetwork();
  const host = new Session(new MemoryTransport('original-tab', network), user, resume.name, true);
  host.onPersist = (save) => {
    expect(rememberOnline(resume, user, save)).toBe(true);
  };
  await host.join(code, undefined, false);
  await host.start(2, false, 1200000);
  await host.idle();
  const head = host.head;
  host.close();
  sessionStorage.clear();
  expect(loadOnlineResume()).toMatchObject(resume);
  expect(loadOnlineResume('d'.repeat(32))).toBeNull();
  const returned = new Session(
    new MemoryTransport('new-tab', network),
    loadOnlineIdentity(code)!,
    resume.name,
    true,
  );
  try {
    await returned.join(code, loadOnlineSession(code), false);
    expect(returned.head).toBe(head);
    expect(returned.state!.players[0]!.id).toBe(user.id);
    expect(returned.state!.players[0]!.bot).toBe(false);
    forgetOnlineResume(code);
    expect(loadOnlineResume()).toBeNull();
  } finally {
    returned.close();
  }
});
it('expires recovery after 24 hours and ignores corrupted browser data', async () => {
  vi.useFakeTimers();
  const code = 'a'.repeat(32);
  rememberOnline({ code, name: 'Camille', creator: false }, await identity());
  vi.advanceTimersByTime(config.network.reconnectTtlMs + 1);
  expect(loadOnlineResume()).toBeNull();
  expect(loadOnlineIdentity(code)).toBeUndefined();
  localStorage.setItem('money-tour.online-resume.v1', '{broken');
  localStorage.setItem(`money-tour.session.${code}`, '{broken');
  expect(loadOnlineResume()).toBeNull();
  expect(loadOnlineSession(code)).toBeUndefined();
});
it('keeps committed duel and auction secrets after tab storage disappears', () => {
  const secret = { salt: 'a'.repeat(32), amount: 75 };
  savePrivateChoice('money-tour.auction.recovery', secret, true);
  savePrivateChoice('money-tour.duel.recovery', { choice: 'rock', salt: secret.salt }, true);
  sessionStorage.clear();
  expect(readPrivateChoice('money-tour.auction.recovery')).toEqual(secret);
  expect(readPrivateChoice('money-tour.duel.recovery')).toEqual({
    choice: 'rock',
    salt: secret.salt,
  });
});
