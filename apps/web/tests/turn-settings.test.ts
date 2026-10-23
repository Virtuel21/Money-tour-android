// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import {
  invitationLink,
  invitationTurn,
  rememberTurn,
  savedTurn,
  loadTurnPreferences,
  saveTurnPreferences,
  forgetTurnPreferences,
} from '../src/network/turnSettings';
import { manualTurnServers, probeTurn } from '../src/network/ice';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const preferences = {
  url: 'turn:relay.example:3478, turns:relay.example:5349?transport=tcp',
  username: 'qa-user',
  password: 'qa-only-password',
  relayOnly: true,
};

it('keeps all manual settings beyond room expiry without sharing credentials in invitations', () => {
  expect(saveTurnPreferences(preferences)).toBe(true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 30 * 86400000);
  expect(loadTurnPreferences()).toEqual(preferences);
  const link = invitationLink('https://example.test', 'a'.repeat(32), {
    ...preferences,
    manual: true,
  });
  for (const value of [preferences.url, preferences.username, preferences.password])
    expect(link).not.toContain(value);
  expect(invitationTurn(link)).toEqual({ manual: true, relayOnly: true });
  expect(forgetTurnPreferences()).toBe(true);
  expect(loadTurnPreferences()).toBeNull();
});

it.each([
  '{broken',
  '{}',
  'null',
  '{"url":1}',
  JSON.stringify({ ...preferences, relayOnly: 'true' }),
])('ignores malformed saved manual settings: %s', (raw) => {
  localStorage.setItem('money-tour.turn-settings.v1', raw);
  expect(loadTurnPreferences()).toBeNull();
});

it('handles unavailable browser storage without losing the current visit', () => {
  const unavailable = () => {
    throw new Error('Storage disabled');
  };
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    getItem: unavailable,
    setItem: unavailable,
    removeItem: unavailable,
  } as unknown as Storage);
  expect(loadTurnPreferences()).toBeNull();
  expect(saveTurnPreferences(preferences)).toBe(false);
  expect(forgetTurnPreferences()).toBe(false);
});
const code = 'a'.repeat(32);
it('shares the manual mode in the invitation without any TURN credentials', () => {
  const settings = { relayOnly: true, manual: true };
  const link = invitationLink('https://example.test/game/?v=1#old', code, settings);
  expect(new URL(link).search).toBe('?v=1');
  expect(invitationTurn(link)).toEqual(settings);
  expect(new URL(link).hash).toContain('room=' + code);
  expect(invitationTurn('#room=' + code)).toBeNull();
});
it('does not fetch arbitrary endpoints from an invitation', () => {
  expect(() => invitationTurn('#turn=https://untrusted.example/credentials')).toThrow('invalide');
});
it('expires public room preferences after 24 hours', () => {
  const settings = { manual: true, relayOnly: true };
  rememberTurn(settings, code);
  expect(savedTurn(code)).toEqual(settings);
  expect(savedTurn('b'.repeat(32))).toBeNull();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 86400001);
  expect(savedTurn(code)).toBeNull();
});
it('validates all manual URLs and requires both credential fields', () => {
  expect(
    manualTurnServers(
      'turn:relay.example:3478, turns:relay.example:5349?transport=tcp',
      ' user ',
      'pass',
    )[0],
  ).toEqual({
    urls: ['turn:relay.example:3478', 'turns:relay.example:5349?transport=tcp'],
    username: 'user',
    credential: 'pass',
  });
  expect(() => manualTurnServers('https://relay.example', 'user', 'pass')).toThrow('adresse');
  expect(() => manualTurnServers('turn:relay.example', '', 'pass')).toThrow('identifiant');
  expect(() => manualTurnServers('turn:relay.example', 'user', '')).toThrow('identifiant');
});
it('does not leave a peer connection open after success, timeout or cancellation', async () => {
  vi.useFakeTimers();
  const close = vi.fn();
  let peer: { onicecandidate: ((event: unknown) => void) | null };
  vi.stubGlobal(
    'RTCPeerConnection',
    class {
      onicecandidate = null;
      onicegatheringstatechange = null;
      constructor() {
        // Capture the browser mock so the test can deliver ICE events.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        peer = this;
      }
      close = close;
      createDataChannel() {}
      createOffer = async () => ({});
      setLocalDescription = async () => {};
    },
  );
  const servers = manualTurnServers('turn:relay.example', 'user', 'pass');
  const success = probeTurn(servers, new AbortController().signal);
  peer!.onicecandidate!({ candidate: { type: 'relay' } });
  await success;
  const controller = new AbortController();
  const cancelled = expect(probeTurn(servers, controller.signal)).rejects.toThrow('annulé');
  controller.abort();
  await cancelled;
  const timedOut = expect(probeTurn(servers, new AbortController().signal)).rejects.toThrow(
    'joignable',
  );
  await vi.advanceTimersByTimeAsync(12000);
  await timedOut;
  expect(close).toHaveBeenCalledTimes(3);
});

it('never persists unexpected credential properties', () => {
  rememberTurn(
    Object.assign(
      { manual: true, relayOnly: true },
      { credential: 'must-not-save', username: 'must-not-save' },
    ),
    code,
  );
  expect(localStorage.getItem('money-tour.turn.v1' + code)).not.toContain('must-not-save');
});
