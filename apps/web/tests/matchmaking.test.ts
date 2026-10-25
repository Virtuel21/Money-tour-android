// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { PublicMatchmaker, PUBLIC_SEARCH_MS } from '../src/network/matchmaking';
import type { Session, SessionView } from '../src/network/session';

const match = {
  roomId: 'room-a',
  hostId: 'host-identity',
  code: 'c'.repeat(32),
  phase: 'playing',
  seatId: 'bot-1',
  reservationId: 'reservation-a',
  reservationToken: 'guest-capability',
  expiresAt: Date.now() + 45000,
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

it('receives a reserved seat without sending cookies or an owner capability', async () => {
  const request = vi.fn().mockResolvedValue(json({ match }));
  const directory = new PublicMatchmaker('https://directory.example', request);
  expect(await directory.find({ language: 'fr', excludeRoomIds: ['failed-room'] })).toEqual(match);
  const [url, options] = request.mock.calls[0]!;
  expect(url).toBe('https://directory.example/v1/match');
  expect(options.credentials).toBe('omit');
  expect(options.headers.Authorization).toBeUndefined();
  expect(JSON.parse(options.body)).toMatchObject({
    protocol: 4,
    rulesVersion: 18,
    language: 'fr',
    relaxed: false,
    excludeRoomIds: ['failed-room'],
  });
});

it('widens the language preference and finishes an empty search without inventing a match', async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockImplementation(() => Promise.resolve(json({ match: null })));
  const directory = new PublicMatchmaker('https://directory.example', request);
  const pending = directory.find({ language: 'fr' });
  await vi.advanceTimersByTimeAsync(PUBLIC_SEARCH_MS + 1);
  expect(await pending).toBeNull();
  const bodies = request.mock.calls.map((call) => JSON.parse(call[1].body));
  expect(bodies.some((body) => body.relaxed)).toBe(true);
  expect(request.mock.calls.length).toBeLessThanOrEqual(7);
});

it('cancels between requests and releases reservations with the guest capability only', async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockImplementation(() => Promise.resolve(json({ match: null })));
  const directory = new PublicMatchmaker('https://directory.example', request);
  const controller = new AbortController();
  const pending = directory.find({ language: 'en', signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(10);
  controller.abort();
  await rejected;
  const count = request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(request).toHaveBeenCalledTimes(count);
  await directory.release(match as Parameters<PublicMatchmaker['release']>[0]);
  expect(request.mock.calls.at(-1)?.[1]).toMatchObject({
    method: 'DELETE',
    headers: { Authorization: 'Bearer guest-capability' },
    keepalive: true,
  });
});

it('reports a directory outage instead of claiming a public bot room was created', async () => {
  const directory = new PublicMatchmaker(
    'https://directory.example',
    vi.fn().mockResolvedValue(json({}, 503)),
  );
  await expect(directory.find({ language: 'en' })).rejects.toThrow(
    'L’annuaire des parties ne répond pas.',
  );
  expect(() => new PublicMatchmaker('http://untrusted.example')).toThrow('HTTPS');
});

it('publishes only as host, authorizes reservations, and removes the room on close', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        json(
          url.endsWith('/v1/rooms')
            ? { roomId: 'room-a', hostToken: 'owner-capability' }
            : { accepted: true },
        ),
      ),
    );
  const view = {
    selfIdentity: 'host-identity',
    members: [{ id: 'host-identity' }],
    connected: ['host-identity'],
    state: null,
    blocked: false,
  } as SessionView;
  const session = {
    isHost: true,
    user: { id: 'host-identity' },
    get view() {
      return view;
    },
    availablePublicSeats: () => ['lobby', 'lobby', 'lobby'],
  } as unknown as Session;
  const directory = new PublicMatchmaker('https://directory.example', request);
  const lease = directory.watch(session, { code: 'c'.repeat(32), language: 'fr' });
  await lease.ready();
  expect(JSON.parse(request.mock.calls[0]?.[1].body)).toMatchObject({
    humans: 1,
    claimableSeatIds: ['lobby', 'lobby', 'lobby'],
    memberIds: ['host-identity'],
  });
  expect(
    await lease.authorizePublicJoin({
      identityId: 'new-identity',
      seatId: 'lobby',
      reservationId: 'reservation-a',
      reservationToken: 'guest-capability',
    }),
  ).toBe(true);
  expect(request.mock.calls[1]?.[1].headers.Authorization).toBe('Bearer owner-capability');
  lease.close();
  await vi.advanceTimersByTimeAsync(30000);
  expect(request.mock.calls.at(-1)?.[1].method).toBe('DELETE');
  const count = request.mock.calls.length;
  lease.close();
  expect(request).toHaveBeenCalledTimes(count);
  expect(
    await lease.authorizePublicJoin({
      identityId: 'other',
      seatId: 'lobby',
      reservationId: 'other',
      reservationToken: 'other',
    }),
  ).toBe(false);
});

it('keeps guests discoverable after they take over hosting without publishing guest-owned state', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockResolvedValue(json({ roomId: 'room-b', hostToken: 'new-owner-capability' }));
  const mutable = {
    isHost: false,
    user: { id: 'guest-identity' },
    view: {
      selfIdentity: 'guest-identity',
      members: [{ id: 'guest-identity' }],
      connected: ['guest-identity'],
      state: null,
      blocked: false,
    },
    availablePublicSeats: () => ['lobby'],
  };
  const directory = new PublicMatchmaker('https://directory.example', request);
  const lease = directory.watch(mutable as unknown as Session, {
    code: 'd'.repeat(32),
    language: 'en',
  });
  await lease.ready();
  expect(request).not.toHaveBeenCalled();
  mutable.isHost = true;
  await vi.advanceTimersByTimeAsync(1000);
  expect(request).toHaveBeenCalledTimes(1);
  lease.close();
  await vi.advanceTimersByTimeAsync(1);
});
