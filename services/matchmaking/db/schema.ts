import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable(
  'rooms',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    hostTokenHash: text('host_token_hash').notNull(),
    hostId: text('host_id').notNull(),
    protocol: integer('protocol').notNull(),
    rulesVersion: integer('rules_version').notNull(),
    language: text('language').notNull(),
    region: text('region').notNull(),
    phase: text('phase').notNull(),
    humans: integer('humans').notNull(),
    capacity: integer('capacity').notNull(),
    durationMs: integer('duration_ms').notNull(),
    elapsedMs: integer('elapsed_ms').notNull(),
    claimableSeats: text('claimable_seats').notNull(),
    memberIds: text('member_ids').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('rooms_match').on(table.protocol, table.rulesVersion, table.expiresAt)],
);

export const reservations = sqliteTable(
  'reservations',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    ownerHash: text('owner_hash').notNull(),
    tokenHash: text('token_hash').notNull(),
    seatId: text('seat_id').notNull(),
    status: text('status').notNull(),
    identityId: text('identity_id'),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('reservations_room').on(table.roomId, table.ownerHash, table.expiresAt)],
);

export const requestLimits = sqliteTable('request_limits', {
  key: text('key').primaryKey(),
  requests: integer('requests').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
