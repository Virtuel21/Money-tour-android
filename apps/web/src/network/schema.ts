import { z } from 'zod';
const id = z.string().min(1).max(80);
const natural = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const actionSchema = z.union([
  z
    .object({
      type: z.enum(['buy', 'buy_fraud', 'upgrade', 'buyout']),
      playerId: id,
      level: z.number().int().min(0).max(4).optional(),
    })
    .strict(),
  z.object({ type: z.literal('auction_pass'), playerId: id }).strict(),
  z
    .object({
      type: z.literal('auction_commit'),
      playerId: id,
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal('auction_reveal'),
      playerId: id,
      amount: natural,
      salt: z.string().regex(/^[a-f0-9]{32,64}$/),
    })
    .strict(),
  z.object({ type: z.literal('alliance'), playerId: id, targetId: id }).strict(),
  z
    .object({
      type: z.literal('duel_offer'),
      playerId: id,
      targetId: id,
      amount: natural.positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('duel_commit'),
      playerId: id,
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal('duel_reveal'),
      playerId: id,
      choice: z.enum(['rock', 'paper', 'scissors']),
      salt: z.string().regex(/^[a-f0-9]{32,64}$/),
    })
    .strict(),
  z
    .object({
      type: z.enum([
        'roll',
        'use_squatter',
        'pay_rent',
        'casino_red',
        'casino_black',
        'casino_spin',
        'duel_accept',
        'duel_decline',
        'duel_cancel',
        'duel_bot',
        'finish',
        'pay_bail',
        'use_escape',
        'attempt_escape',
        'decline_travel',
        'quit',
      ]),
      playerId: id,
    })
    .strict(),
  z
    .object({
      type: z.enum(['sell', 'place_championship', 'travel', 'insure', 'attack']),
      playerId: id,
      tile: z.number().int().min(0).max(31),
    })
    .strict(),
  z.object({ type: z.literal('tick'), elapsedMs: z.number().int().min(0).max(2000) }).strict(),
  z.object({ type: z.literal('set_control'), playerId: id, bot: z.boolean() }).strict(),
]);
export const optionsSchema = z
  .object({
    randomFirstPlayer: z.boolean().optional(),
    players: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(20),
            bot: z.boolean(),
            team: z.number().int().min(0).max(1).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    mode: z.enum(['free-for-all', 'teams']),
    durationMs: z.number().int().min(60000).max(10800000),
    presentationPace: z.enum(['normal', 'fast']).optional(),
  })
  .strict();
export const authSchema = z
  .object({
    playerId: id,
    parent: z.string().length(64),
    action: actionSchema,
    signature: z.string().length(128),
  })
  .strict();
export const commandSchema = z.union([
  z.object({ type: z.literal('start'), options: optionsSchema }).strict(),
  z.object({ type: z.literal('rematch'), options: optionsSchema }).strict(),
  z
    .object({ type: z.literal('action'), action: actionSchema, auth: authSchema.optional() })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type AuthIntent = z.infer<typeof authSchema>;
export const contextSchema = z
  .object({
    room: z.string().length(64),
    epoch: natural,
    seq: natural,
    parent: z.string().length(64),
    command: z.string().length(64),
    participants: z.array(id).min(1).max(4),
    nonce: z.string().length(64),
  })
  .strict();
const hashes = z.record(id, z.string().regex(/^[a-f0-9]{64}$/));
export const proofSchema = z
  .object({
    context: contextSchema,
    commitments: hashes,
    secrets: hashes,
    attestations: z.record(id, z.string().length(128)).optional(),
  })
  .strict();
export const frameSchema = z
  .object({
    room: z.string().length(64),
    epoch: natural,
    index: natural,
    parent: z.string().length(64),
    command: commandSchema,
    proof: proofSchema.nullable(),
    result: z.string().length(64),
    signer: id,
    signature: z.string().length(128),
  })
  .strict();
export type Frame = z.infer<typeof frameSchema>;
export const memberSchema = z
  .object({
    id,
    name: z.string().min(1).max(20),
    key: z.record(z.string(), z.unknown()),
    order: z.number().int().min(0).max(3),
  })
  .strict();
export type Member = z.infer<typeof memberSchema>;
export const bodySchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('taunt'),
      kind: z.enum(['laugh', 'cash', 'cry', 'kiss', 'crown']),
      targetId: id.optional(),
    })
    .strict(),
  z.object({
    type: z.literal('attest'),
    nonce: z.string().length(64),
    signature: z.string().length(128),
  }),
  z.object({
    type: z.literal('hello'),
    name: z.string().min(1).max(20),
    creator: z.boolean(),
    epoch: natural,
    index: natural,
    head: z.string().length(64),
  }),
  z.object({
    type: z.literal('status'),
    host: id,
    epoch: natural,
    members: z.array(memberSchema).max(4),
    index: natural,
    head: z.string().length(64),
  }),
  z.object({ type: z.literal('intent'), intent: authSchema }),
  z.object({ type: z.literal('round'), context: contextSchema, command: commandSchema }),
  z.object({
    type: z.literal('contribution'),
    nonce: z.string().length(64),
    kind: z.enum(['commit', 'lock', 'reveal']),
    value: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ type: z.literal('frame'), frame: frameSchema }),
  z.object({ type: z.literal('sync') }),
  z.object({ type: z.literal('snapshot'), frames: z.array(frameSchema).max(15000) }),
  z.object({ type: z.literal('abort'), nonce: z.string().length(64), missing: z.array(id).max(4) }),
  z.object({
    type: z.literal('migration'),
    epoch: natural,
    index: natural,
    head: z.string().length(64),
  }),
]);
export type Body = z.infer<typeof bodySchema>;
export const envelopeSchema = z
  .object({
    room: z.string().length(64),
    from: id,
    peer: id,
    serial: natural,
    key: z.record(z.string(), z.unknown()),
    body: bodySchema,
    signature: z.string().length(128),
  })
  .strict();
