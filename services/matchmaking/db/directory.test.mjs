import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile } from 'node:fs/promises';
import { handleDirectory, PRESENCE_MS, RESERVATION_MS } from './directory.ts';

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of (await readdir(new URL('../drizzle/', import.meta.url)))
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const prepare = (sql, values = []) => ({
    bind(...next) {
      return prepare(sql, next);
    },
    execute() {
      const results = sqlite.prepare(sql).all(...values);
      return {
        success: true,
        results,
        meta: { changes: sqlite.prepare('SELECT changes() AS value').get().value },
      };
    },
    async first() {
      return sqlite.prepare(sql).get(...values) ?? null;
    },
    async all() {
      return this.execute();
    },
    async run() {
      return this.execute();
    },
  });
  const db = {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map((statement) => statement.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  let now = 1_800_000_000_000;
  async function request(
    path,
    body,
    method = 'POST',
    bearer,
    origin = 'https://virtuel21.github.io',
  ) {
    const headers = {
      'Content-Type': 'application/json',
      Origin: origin,
      'CF-Connecting-IP': '192.0.2.42',
    };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const response = await handleDirectory(
      new Request(`https://directory.example${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      db,
      now,
    );
    return {
      status: response.status,
      headers: response.headers,
      data: response.status === 204 ? null : await response.json(),
    };
  }
  return {
    sqlite,
    db,
    request,
    advance(ms) {
      now += ms;
    },
    close() {
      sqlite.close();
    },
  };
}
const advertisement = (overrides = {}) => ({
  code: 'a'.repeat(32),
  protocol: 4,
  rulesVersion: 18,
  language: 'fr',
  region: 'global',
  phase: 'waiting',
  humans: 1,
  capacity: 4,
  durationMs: 20 * 60_000,
  elapsedMs: 0,
  claimableSeatIds: ['lobby', 'lobby', 'lobby'],
  memberIds: ['host'],
  hostId: 'host',
  ...overrides,
});
const criteria = (overrides = {}) => ({
  protocol: 4,
  rulesVersion: 18,
  language: 'fr',
  region: 'global',
  relaxed: false,
  excludeRoomIds: [],
  ...overrides,
});

test('leases are capabilities, cannot be stolen while active, and do not expose a room list', async () => {
  const f = await fixture();
  try {
    const created = await f.request('/v1/rooms', advertisement());
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('Access-Control-Allow-Origin'), 'https://virtuel21.github.io');
    assert.equal((await f.request('/v1/rooms', advertisement())).status, 409);
    const row = f.sqlite.prepare('SELECT host_token_hash FROM rooms').get();
    assert.notEqual(row.host_token_hash, created.data.hostToken);
    assert.equal(
      (await f.request(`/v1/rooms/${created.data.roomId}`, advertisement(), 'PUT', '0'.repeat(64)))
        .status,
      401,
    );
    assert.equal((await f.request('/v1/rooms', undefined, 'GET')).status, 404);
    assert.equal((await f.request('/v1/health', undefined, 'GET')).data.ok, true);
    assert.equal(
      (
        await f.request(
          `/v1/rooms/${created.data.roomId}`,
          undefined,
          'DELETE',
          created.data.hostToken,
        )
      ).data.closed,
      true,
    );
  } finally {
    f.close();
  }
});

test('simultaneous searches cannot overbook the last waiting place; cancellation releases it', async () => {
  const f = await fixture();
  try {
    await f.request(
      '/v1/rooms',
      advertisement({ humans: 3, memberIds: ['host', 'p2', 'p3'], claimableSeatIds: ['lobby'] }),
    );
    const results = await Promise.all(
      Array.from({ length: 12 }, () => f.request('/v1/match', criteria())),
    );
    assert(results.every((result) => result.status === 200));
    const matches = results.map((result) => result.data.match).filter(Boolean);
    assert.equal(matches.length, 1);
    const match = matches[0];
    assert.equal(match.seatId, 'lobby');
    assert.equal(match.hostId, 'host');
    const stored = f.sqlite.prepare('SELECT token_hash FROM reservations').get();
    assert.notEqual(stored.token_hash, match.reservationToken);
    await f.request(
      `/v1/reservations/${match.reservationId}`,
      undefined,
      'DELETE',
      match.reservationToken,
    );
    assert((await f.request('/v1/match', criteria())).data.match);
  } finally {
    f.close();
  }
});

test('playing seats are unique and claims survive heartbeat until the new identity is represented', async () => {
  const f = await fixture();
  try {
    const ad = advertisement({
      phase: 'playing',
      humans: 2,
      memberIds: ['host', 'p2'],
      claimableSeatIds: ['ai1', 'ai2'],
    });
    const host = (await f.request('/v1/rooms', ad)).data;
    const attempts = await Promise.all(
      Array.from({ length: 3 }, () => f.request('/v1/match', criteria())),
    );
    const matches = attempts.map((result) => result.data.match).filter(Boolean);
    assert.equal(matches.length, 2);
    assert.equal(new Set(matches.map((match) => match.seatId)).size, 2);
    const match = matches[0];
    const claim = {
      reservationToken: match.reservationToken,
      identityId: 'new-human',
      seatId: match.seatId,
    };
    assert.equal(
      (
        await f.request(
          `/v1/reservations/${match.reservationId}/claim`,
          claim,
          'POST',
          '0'.repeat(64),
        )
      ).data.accepted,
      false,
    );
    assert.equal(
      (
        await f.request(
          `/v1/reservations/${match.reservationId}/claim`,
          claim,
          'POST',
          host.hostToken,
        )
      ).data.accepted,
      true,
    );
    assert.equal(
      (
        await f.request(
          `/v1/reservations/${match.reservationId}/claim`,
          claim,
          'POST',
          host.hostToken,
        )
      ).data.accepted,
      true,
    );
    await f.request(`/v1/rooms/${host.roomId}`, ad, 'PUT', host.hostToken);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM reservations').get().n, 2);
    const remaining = matches[1].seatId;
    await f.request(
      `/v1/rooms/${host.roomId}`,
      { ...ad, humans: 3, memberIds: ['host', 'p2', 'new-human'], claimableSeatIds: [remaining] },
      'PUT',
      host.hostToken,
    );
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM reservations').get().n, 1);
    assert.equal((await f.request('/v1/match', criteria())).data.match, null);
  } finally {
    f.close();
  }
});

test('stale hosts disappear; a migrated host can replace an expired lease and old claims cannot consume new seats', async () => {
  const f = await fixture();
  try {
    const ad = advertisement();
    const old = (await f.request('/v1/rooms', ad)).data;
    const reservation = (await f.request('/v1/match', criteria())).data.match;
    f.advance(PRESENCE_MS + 1);
    assert.equal((await f.request('/v1/match', criteria())).data.match, null);
    const nextAd = { ...ad, hostId: 'next-host', memberIds: ['next-host'] };
    const migrated = await f.request('/v1/rooms', nextAd);
    assert.equal(migrated.status, 201);
    assert.equal(migrated.data.roomId, old.roomId);
    assert.equal(
      (await f.request(`/v1/rooms/${old.roomId}`, ad, 'PUT', old.hostToken)).status,
      401,
    );
    const claim = {
      reservationToken: reservation.reservationToken,
      identityId: 'guest',
      seatId: 'lobby',
    };
    assert.equal(
      (
        await f.request(
          `/v1/reservations/${reservation.reservationId}/claim`,
          claim,
          'POST',
          migrated.data.hostToken,
        )
      ).data.accepted,
      false,
    );
    const available = await Promise.all(
      Array.from({ length: 4 }, () => f.request('/v1/match', criteria())),
    );
    assert.equal(available.filter((item) => item.data.match).length, 3);
    assert(
      available
        .filter((item) => item.data.match)
        .every((item) => item.data.match.hostId === 'next-host'),
    );
  } finally {
    f.close();
  }
});

test('selection respects language, waiting priority and excludes late or nearly finished games', async () => {
  const f = await fixture();
  try {
    const playing = advertisement({
      phase: 'playing',
      humans: 3,
      memberIds: ['host', 'p2', 'p3'],
      claimableSeatIds: ['ai1'],
      elapsedMs: 300_000,
    });
    const first = (await f.request('/v1/rooms', playing)).data;
    const second = (
      await f.request('/v1/rooms', advertisement({ code: 'b'.repeat(32), language: 'en' }))
    ).data;
    assert.equal((await f.request('/v1/match', criteria())).data.match.roomId, first.roomId);
    assert.equal(
      (await f.request('/v1/match', criteria({ relaxed: true }))).data.match.roomId,
      second.roomId,
    );
    await f.request(
      `/v1/rooms/${first.roomId}`,
      { ...playing, elapsedMs: 950_000 },
      'PUT',
      first.hostToken,
    );
    assert.equal(
      (await f.request('/v1/match', criteria({ excludeRoomIds: [second.roomId] }))).data.match,
      null,
    );
  } finally {
    f.close();
  }
});

test('reservation expiry restores capacity and a wrong identity cannot replay an admitted claim', async () => {
  const f = await fixture();
  try {
    const ad = advertisement({
      humans: 3,
      memberIds: ['host', 'p2', 'p3'],
      claimableSeatIds: ['lobby'],
    });
    const host = (await f.request('/v1/rooms', ad)).data;
    const match = (await f.request('/v1/match', criteria())).data.match;
    const claim = {
      reservationToken: match.reservationToken,
      identityId: 'guest',
      seatId: 'lobby',
    };
    assert.equal(
      (
        await f.request(
          `/v1/reservations/${match.reservationId}/claim`,
          claim,
          'POST',
          host.hostToken,
        )
      ).data.accepted,
      true,
    );
    assert.equal(
      (
        await f.request(
          `/v1/reservations/${match.reservationId}/claim`,
          { ...claim, identityId: 'intruder' },
          'POST',
          host.hostToken,
        )
      ).data.accepted,
      false,
    );
    f.advance(RESERVATION_MS + 1);
    await f.request(`/v1/rooms/${host.roomId}`, ad, 'PUT', host.hostToken);
    assert((await f.request('/v1/match', criteria())).data.match);
  } finally {
    f.close();
  }
});

test('public endpoints bound JSON input, validate seats, allow Capacitor CORS and limit bursts without raw IP retention', async () => {
  const f = await fixture();
  try {
    const preflight = await f.request(
      '/v1/match',
      undefined,
      'OPTIONS',
      undefined,
      'https://localhost',
    );
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://localhost');
    assert.equal(
      (await f.request('/v1/match', criteria(), 'POST', undefined, 'https://evil.example')).status,
      403,
    );
    assert.equal(
      (await f.request('/v1/rooms', advertisement({ claimableSeatIds: ['wrong'] }))).status,
      400,
    );
    assert.equal((await f.request('/v1/rooms', { excess: 'x'.repeat(9_000) })).status, 413);
    for (let index = 0; index < 90; index++)
      assert.equal((await f.request('/v1/match', criteria())).status, 200);
    assert.equal((await f.request('/v1/match', criteria())).status, 429);
    const rows = f.sqlite.prepare('SELECT * FROM request_limits').all();
    assert(rows.every((row) => /^[a-f0-9]{64}$/.test(row.key)));
    assert(!JSON.stringify(rows).includes('192.0.2.42'));
  } finally {
    f.close();
  }
});
