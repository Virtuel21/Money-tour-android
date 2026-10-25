import { z } from 'zod';

export const PRESENCE_MS = 35_000;
export const HEARTBEAT_MS = 10_000;
export const RESERVATION_MS = 45_000;
const MAX_BODY_BYTES = 8_192;
const id = z.string().min(1).max(80);
const token = z.string().regex(/^[a-f0-9]{64}$/);
const roomIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
const advertisementSchema = z
  .object({
    code: z.string().regex(/^[a-f0-9]{32}$/),
    protocol: z.literal(4),
    rulesVersion: z.literal(18),
    language: z.enum(['fr', 'en']),
    region: z.literal('global'),
    phase: z.enum(['waiting', 'playing']),
    humans: z.number().int().min(1).max(4),
    capacity: z.literal(4),
    durationMs: z.number().int().min(60_000).max(10_800_000),
    elapsedMs: z.number().int().min(0).max(10_800_000),
    claimableSeatIds: z.array(id).max(3),
    memberIds: z.array(id).min(1).max(4),
    hostId: id,
  })
  .strict()
  .superRefine((room, context) => {
    if (room.elapsedMs > room.durationMs || room.claimableSeatIds.length > 4 - room.humans)
      context.addIssue({ code: 'custom', message: 'Invalid availability' });
    if (
      !room.memberIds.includes(room.hostId) ||
      new Set(room.memberIds).size !== room.memberIds.length
    )
      context.addIssue({ code: 'custom', message: 'Invalid members' });
    const invalidSeats =
      room.phase === 'waiting'
        ? room.claimableSeatIds.some((seat) => seat !== 'lobby')
        : new Set(room.claimableSeatIds).size !== room.claimableSeatIds.length ||
          room.claimableSeatIds.includes('lobby');
    if (invalidSeats) context.addIssue({ code: 'custom', message: 'Invalid seats' });
  });
const matchSchema = z
  .object({
    protocol: z.literal(4),
    rulesVersion: z.literal(18),
    language: z.enum(['fr', 'en']),
    region: z.literal('global'),
    relaxed: z.boolean(),
    excludeRoomIds: z.array(roomIdSchema).max(16),
  })
  .strict();
const claimSchema = z.object({ reservationToken: token, identityId: id, seatId: id }).strict();
export type Advertisement = z.infer<typeof advertisementSchema>;

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function bearer(request: Request): string {
  const value = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!value) throw new ApiError(401, 'Invalid capability');
  return value;
}
function cors(request: Request): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  });
  const origin = request.headers.get('origin');
  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ApiError(403, 'Origin not allowed');
    }
    const local =
      ['http:', 'https:'].includes(parsed.protocol) &&
      ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (
      origin !== 'https://virtuel21.github.io' &&
      origin !== new URL(request.url).origin &&
      !local
    )
      throw new ApiError(403, 'Origin not allowed');
    headers.set('Access-Control-Allow-Origin', origin);
  }
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return headers;
}
function response(data: unknown, headers: Headers, status = 200): Response {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers });
}
async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new ApiError(415, 'Expected JSON');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES)
    throw new ApiError(413, 'Request too large');
  if (!request.body) throw new ApiError(400, 'Missing JSON body');
  const reader = request.body.getReader(),
    decoder = new TextDecoder();
  let text = '',
    size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'Request too large');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Invalid JSON');
  }
}
async function limit(
  db: D1Database,
  request: Request,
  group: string,
  maximum: number,
  now: number,
): Promise<void> {
  // Keep only a short-lived hash, never the client IP itself. Cloudflare sets this header.
  const window = Math.floor(now / 60_000);
  const key = await digest(
    `rate:${window}:${group}:${request.headers.get('cf-connecting-ip') ?? 'local'}`,
  );
  const row = await db
    .prepare(
      `INSERT INTO request_limits (key, requests, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET requests = requests + 1 RETURNING requests`,
    )
    .bind(key, (window + 2) * 60_000)
    .first<{ requests: number }>();
  if (!row || row.requests > maximum) throw new ApiError(429, 'Too many requests');
}
function roomValues(room: Advertisement, now: number) {
  return [
    room.code,
    room.hostId,
    room.protocol,
    room.rulesVersion,
    room.language,
    room.region,
    room.phase,
    room.humans,
    room.capacity,
    room.durationMs,
    room.elapsedMs,
    JSON.stringify(room.claimableSeatIds),
    JSON.stringify(room.memberIds),
    now,
    now + PRESENCE_MS,
  ];
}
async function register(
  db: D1Database,
  request: Request,
  headers: Headers,
  now: number,
): Promise<Response> {
  await limit(db, request, 'create', 12, now);
  const room = advertisementSchema.parse(await jsonBody(request));
  const roomId = (await digest(`money-tour-public-room-v1:${room.code}`)).slice(0, 32);
  const hostToken = randomToken(),
    hostHash = await digest(`host:${hostToken}`);
  const inserted = await db
    .prepare(
      `INSERT INTO rooms (id, host_token_hash, code, host_id, protocol, rules_version, language, region, phase, humans, capacity, duration_ms, elapsed_ms, claimable_seats, member_ids, updated_at, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET host_token_hash=excluded.host_token_hash, code=excluded.code, host_id=excluded.host_id, protocol=excluded.protocol, rules_version=excluded.rules_version, language=excluded.language, region=excluded.region, phase=excluded.phase, humans=excluded.humans, capacity=excluded.capacity, duration_ms=excluded.duration_ms, elapsed_ms=excluded.elapsed_ms, claimable_seats=excluded.claimable_seats, member_ids=excluded.member_ids, updated_at=excluded.updated_at, expires_at=excluded.expires_at, created_at=excluded.created_at
    WHERE rooms.expires_at <= ? RETURNING id`,
    )
    .bind(roomId, hostHash, ...roomValues(room, now), now, now)
    .first<{ id: string }>();
  if (!inserted) throw new ApiError(409, 'Room lease is active');
  return response(
    { roomId, hostToken, expiresAt: now + PRESENCE_MS, heartbeatMs: HEARTBEAT_MS },
    headers,
    201,
  );
}
async function heartbeat(
  db: D1Database,
  request: Request,
  headers: Headers,
  roomId: string,
  now: number,
): Promise<Response> {
  const hostHash = await digest(`host:${bearer(request)}`);
  await limit(db, request, 'heartbeat', 180, now);
  const room = advertisementSchema.parse(await jsonBody(request));
  if ((await digest(`money-tour-public-room-v1:${room.code}`)).slice(0, 32) !== roomId)
    throw new ApiError(400, 'Room does not match capability');
  const results = await db.batch<{ id: string }>([
    db
      .prepare(
        `UPDATE rooms SET code=?, host_id=?, protocol=?, rules_version=?, language=?, region=?, phase=?, humans=?, capacity=?, duration_ms=?, elapsed_ms=?, claimable_seats=?, member_ids=?, updated_at=?, expires_at=? WHERE id=? AND host_token_hash=? RETURNING id`,
      )
      .bind(...roomValues(room, now), roomId, hostHash),
    db
      .prepare(
        `DELETE FROM reservations WHERE room_id=? AND owner_hash=? AND status='claimed' AND identity_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(roomId, hostHash, JSON.stringify(room.memberIds)),
  ]);
  if (!results[0]?.results.length) throw new ApiError(401, 'Invalid capability');
  return response({ ok: true, expiresAt: now + PRESENCE_MS }, headers);
}
async function findMatch(
  db: D1Database,
  request: Request,
  headers: Headers,
  now: number,
): Promise<Response> {
  await limit(db, request, 'match', 90, now);
  const criteria = matchSchema.parse(await jsonBody(request));
  const reservationId = randomToken(),
    reservationToken = randomToken();
  const tokenHash = await digest(`reservation:${reservationToken}`);
  // A single INSERT…SELECT serializes capacity checks and seat allocation in D1/SQLite.
  // Waiting places are interchangeable; playing seats are individually reserved.
  const selected = await db
    .prepare(
      `INSERT INTO reservations (id, room_id, owner_hash, token_hash, seat_id, status, identity_id, expires_at)
    SELECT ?, r.id, r.host_token_hash, ?, seat.value, 'pending', NULL, ?
    FROM rooms r JOIN json_each(r.claimable_seats) seat
    WHERE r.expires_at > ? AND r.protocol=? AND r.rules_version=? AND r.region=?
      AND (?=1 OR r.language=?) AND r.humans < r.capacity
      AND r.id NOT IN (SELECT value FROM json_each(?))
      AND (r.phase='waiting' OR (r.duration_ms-r.elapsed_ms >= 180000 AND r.elapsed_ms*4 < r.duration_ms*3))
      AND (SELECT COUNT(*) FROM reservations held WHERE held.room_id=r.id AND held.owner_hash=r.host_token_hash AND held.expires_at > ?) < json_array_length(r.claimable_seats)
      AND (r.phase='waiting' OR NOT EXISTS (SELECT 1 FROM reservations taken WHERE taken.room_id=r.id AND taken.owner_hash=r.host_token_hash AND taken.seat_id=seat.value AND taken.expires_at > ?))
    ORDER BY CASE r.phase WHEN 'waiting' THEN 0 ELSE 1 END, CASE WHEN r.language=? THEN 0 ELSE 1 END, r.humans DESC, r.updated_at DESC, r.id, seat.key
    LIMIT 1 RETURNING room_id, seat_id`,
    )
    .bind(
      reservationId,
      tokenHash,
      now + RESERVATION_MS,
      now,
      criteria.protocol,
      criteria.rulesVersion,
      criteria.region,
      criteria.relaxed ? 1 : 0,
      criteria.language,
      JSON.stringify(criteria.excludeRoomIds),
      now,
      now,
      criteria.language,
    )
    .first<{ room_id: string; seat_id: string }>();
  if (!selected) return response({ match: null }, headers);
  const room = await db
    .prepare('SELECT code, phase, host_id FROM rooms WHERE id=?')
    .bind(selected.room_id)
    .first<{ code: string; phase: string; host_id: string }>();
  if (!room) return response({ match: null }, headers);
  return response(
    {
      match: {
        roomId: selected.room_id,
        code: room.code,
        phase: room.phase,
        hostId: room.host_id,
        seatId: selected.seat_id,
        reservationId,
        reservationToken,
        expiresAt: now + RESERVATION_MS,
      },
    },
    headers,
  );
}
async function claim(
  db: D1Database,
  request: Request,
  headers: Headers,
  reservationId: string,
  now: number,
): Promise<Response> {
  const hostHash = await digest(`host:${bearer(request)}`);
  await limit(db, request, 'claim', 90, now);
  const body = claimSchema.parse(await jsonBody(request));
  const tokenHash = await digest(`reservation:${body.reservationToken}`);
  const row = await db
    .prepare(
      `UPDATE reservations SET status='claimed', identity_id=?
    WHERE id=? AND token_hash=? AND seat_id=? AND owner_hash=? AND expires_at > ? AND (status='pending' OR identity_id=?)
      AND EXISTS (SELECT 1 FROM rooms r WHERE r.id=reservations.room_id AND r.host_token_hash=reservations.owner_hash AND r.expires_at > ? AND EXISTS (SELECT 1 FROM json_each(r.claimable_seats) seat WHERE seat.value=reservations.seat_id))
    RETURNING id`,
    )
    .bind(
      body.identityId,
      reservationId,
      tokenHash,
      body.seatId,
      hostHash,
      now,
      body.identityId,
      now,
    )
    .first<{ id: string }>();
  return response({ accepted: !!row }, headers);
}

export async function handleDirectory(
  request: Request,
  db: D1Database,
  now = Date.now(),
): Promise<Response> {
  let headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    if (request.method === 'GET' && path === '/v1/health') {
      await db.prepare('SELECT 1 AS ok').first();
      return response(
        { ok: true, service: 'money-tour-matchmaking', protocol: 4, rulesVersion: 18 },
        headers,
      );
    }
    await db.batch([
      db.prepare('DELETE FROM reservations WHERE expires_at <= ?').bind(now),
      db.prepare('DELETE FROM rooms WHERE expires_at <= ?').bind(now - 86_400_000),
      db.prepare('DELETE FROM request_limits WHERE expires_at <= ?').bind(now),
    ]);
    if (path === '/v1/rooms' && request.method === 'POST')
      return await register(db, request, headers, now);
    if (path === '/v1/match' && request.method === 'POST')
      return await findMatch(db, request, headers, now);
    const room = path.match(/^\/v1\/rooms\/([a-f0-9]{32})$/);
    if (room && request.method === 'PUT')
      return await heartbeat(db, request, headers, room[1], now);
    if (room && request.method === 'DELETE') {
      const hostHash = await digest(`host:${bearer(request)}`);
      const removed = await db
        .prepare('DELETE FROM rooms WHERE id=? AND host_token_hash=? RETURNING id')
        .bind(room[1], hostHash)
        .first();
      if (!removed) throw new ApiError(401, 'Invalid capability');
      return response({ closed: true }, headers);
    }
    const reservation = path.match(/^\/v1\/reservations\/([a-f0-9]{64})(\/claim)?$/);
    if (reservation?.[2] && request.method === 'POST')
      return await claim(db, request, headers, reservation[1], now);
    if (reservation && !reservation[2] && request.method === 'DELETE') {
      const tokenHash = await digest(`reservation:${bearer(request)}`);
      await db
        .prepare("DELETE FROM reservations WHERE id=? AND token_hash=? AND status='pending'")
        .bind(reservation[1], tokenHash)
        .run();
      return response({ cancelled: true }, headers);
    }
    throw new ApiError(404, 'Not found');
  } catch (error) {
    if (error instanceof z.ZodError) return response({ error: 'Invalid request' }, headers, 400);
    if (error instanceof ApiError) {
      if (error.status === 429) headers.set('Retry-After', '60');
      return response({ error: error.message }, headers, error.status);
    }
    // Do not send SQL, room codes, capabilities or provider diagnostics to callers.
    return response({ error: 'Directory unavailable' }, headers, 503);
  }
}
