import type { GameEvent, GameState } from '@money-tour/engine';
import { eventCelebrations, type Celebration } from './celebrations';
import { CARD_ARRIVE_MS } from './cardMotion';

export type PresentationPace = 'normal' | 'fast';

// Animated cards spend 1.5 seconds arriving before their front is fully readable.
// Shared online budgets include that time even if one viewer disables motion.
const FAST_CARD_NOTICE_MS = CARD_ARRIVE_MS + 4000;
const routineNotices = ['alliance_expired', 'crisis_expired', 'roaches_expired'];
// Status feedback never holds a decision or the shared clock after its action card leaves.
const passiveNotices = ['insurance', 'insured_tile', 'duel_cancelled'];

/** One debit for a purchase/construction batch; keep the original events for the journal. */
function propertyPayment(events: GameEvent[], index: number): number | undefined {
  const event = events[index]!;
  if (!['purchase', 'build'].includes(event.type)) return undefined;
  const previous = events[index - 1];
  if (
    event.type === 'build' &&
    previous &&
    ['purchase', 'build'].includes(previous.type) &&
    previous.tile === event.tile &&
    previous.playerId === event.playerId
  )
    return 0;
  let amount = event.amount ?? 0;
  for (let i = index + 1; i < events.length; i++) {
    const next = events[i]!;
    if (next.type !== 'build' || next.tile !== event.tile || next.playerId !== event.playerId)
      break;
    amount += next.amount ?? 0;
  }
  return amount;
}

/** Reading time and auction orientation are independent from animation speed. */
function pacedDuration(cue: Cue, pace: PresentationPace, reduced: boolean): number {
  if (pace === 'normal' || ['card', 'tax'].includes(cue.kind) || cue.reason === 'auction_started')
    return cue.duration;
  const caps: Record<Cue['kind'], number> = {
    dice: 600,
    hop: 90,
    card: 5500,
    tax: 5000,
    build: 350,
    money: 650,
    turn: 650,
    settle: 150,
    casino: 5000,
    notice: routineNotices.includes(cue.reason ?? '') ? 2200 : reduced ? 4000 : FAST_CARD_NOTICE_MS,
  };
  return Math.min(cue.duration, caps[cue.kind]);
}

export interface Cue {
  kind:
    'dice' | 'hop' | 'card' | 'tax' | 'build' | 'money' | 'turn' | 'settle' | 'casino' | 'notice';
  casinoGame?: 'roulette' | 'slots';
  casinoColor?: string;
  casinoReels?: number[];
  jackpot?: boolean;
  message?: string;
  nonblocking?: boolean;
  duration: number;
  amount?: number;
  payerId?: string;
  reason?: string;
  playerId?: string;
  from?: number;
  to?: number;
  dice?: number[];
  cardId?: string;
  tile?: number;
  sound?: string;
  celebrations?: Celebration[];
}
export interface SceneFrame {
  state: GameState;
  cue: Cue;
}
/** Presentation only: never changes the authoritative state or consumes game randomness. */
export function presentation(
  previous: GameState,
  next: GameState,
  events: GameEvent[],
  reduced = false,
  pace: PresentationPace = 'normal',
): SceneFrame[] {
  const visual = structuredClone(previous);
  const frames: SceneFrame[] = [];
  const size = previous.config.board.length;
  const add = (cue: Cue) =>
    frames.push({
      state: structuredClone(visual),
      cue: { ...cue, duration: pacedDuration(cue, pace, reduced) },
    });
  const celebrations = eventCelebrations(previous, next, events);
  const money = (event: GameEvent, duration = 1500) => {
    if ((event.amount ?? 0) <= 0) return;
    const recipient = visual.players.find((p) => p.id === event.playerId);
    const payerId = typeof event.payerId === 'string' ? event.payerId : undefined;
    const payer = visual.players.find((p) => p.id === payerId);
    if (payer) payer.cash = Math.max(0, payer.cash - event.amount!);
    if (recipient) recipient.cash += event.amount!;
    add({
      kind: 'money',
      playerId: event.playerId,
      payerId,
      amount: event.amount,
      reason: String(event.reason ?? event.type),
      tile: event.tile,
      sound: recipient ? 'coin-in' : 'coin-out',
      duration: reduced ? 350 : duration,
    });
  };
  let departure: GameEvent | undefined;
  for (const [index, event] of events.entries()) {
    const propertyAmount = propertyPayment(events, index);
    if (propertyAmount !== undefined)
      money(
        {
          ...event,
          amount: propertyAmount,
          playerId: undefined,
          payerId: event.playerId,
          reason: event.type,
        },
        1000,
      );
    const firstFrame = frames.length;
    if (event.type === 'insured')
      add({ kind: 'settle', reason: 'insured', tile: event.tile, duration: 700 });
    if (event.type === 'auction_started' && next.auction) {
      visual.auction = structuredClone(next.auction);
      visual.phase = 'auction';
    }
    if (event.type === 'casino_result')
      add({
        kind: 'casino',
        duration: reduced ? 3500 : 5500,
        playerId: event.playerId,
        amount: event.amount,
        casinoGame: event.game as 'roulette' | 'slots',
        casinoColor: String(event.color),
        casinoReels: event.reels as number[],
        jackpot: Boolean(event.jackpot),
        sound: event.game === 'slots' ? 'casino-slots' : 'casino-roulette',
      });
    if (event.type === 'earthquake' && event.tile !== undefined) {
      add({
        kind: 'notice',
        reason: 'earthquake',
        tile: event.tile,
        playerId: event.playerId,
        message: String(event.message),
        sound: 'earthquake',
        duration: reduced ? 4000 : FAST_CARD_NOTICE_MS,
      });
      visual.properties[event.tile] = { ...next.properties[event.tile]! };
      add({ kind: 'settle', duration: 500 });
    }
    const notice: Record<string, string> = {
      auction_started: String(event.message),
      auction_result: String(event.message),
      quest_completed: String(event.message),
      capital_revealed: String(event.message),
      alliance: String(event.message),
      alliance_expired: String(event.message),
      crisis: String(event.message),
      crisis_expired: String(event.message),
      victory_warning: String(event.message),
      duel_forfeit: String(event.message),
      duel_cancelled: String(event.message),
      duel_result:
        event.type === 'duel_result'
          ? ((event.choices as string[]) ?? [])
              .map(
                (c, i) =>
                  (next.players.find((p) => p.id === (i ? event.targetId : event.challengerId))
                    ?.name ?? '') +
                  ' : ' +
                  ({ rock: '✊ Pierre', paper: '✋ Feuille', scissors: '✌️ Ciseaux' }[c] ?? c),
              )
              .join(' · ') +
            '. ' +
            event.message
          : '',
      insurance: 'Un jeton assurance vous attend. Choisissez une propriété à protéger.',
      insured_tile: 'Cette propriété est maintenant assurée.',
      squatter: 'Vous passez sans payer de loyer !',
      expropriate: 'Expropriation : cette ville est à nouveau disponible.',
      roaches: `🪳 ${event.tile === undefined ? 'Hôtel ciblé' : next.config.board[event.tile]?.name} · ${next.players.find((p) => p.id === next.properties[event.tile ?? -1]?.ownerId)?.name ?? ''} : hôtel infesté, loyer divisé par deux pendant ${next.properties[event.tile ?? -1]?.roachTurns ?? 2} retours du tour de son propriétaire.`,
      roaches_expired: 'La désinsectisation est terminée : le loyer revient à la normale.',
      karma: String(event.message ?? 'Le Karma a tranché.'),
    };
    if (notice[event.type])
      add({
        kind: 'notice',
        reason: event.type,
        duration: passiveNotices.includes(event.type)
          ? 0
          : event.type === 'auction_started'
            ? 1800
            : (reduced ? 800 : 2600) + 5000,
        ...(passiveNotices.includes(event.type) ? { nonblocking: true } : {}),
        playerId: event.playerId,
        tile: event.tile,
        message: notice[event.type],
        sound: 'card',
      });
    if (
      event.type === 'start_bonus' &&
      events[index + 1]?.type === 'move' &&
      events[index + 1]?.playerId === event.playerId
    ) {
      departure = { ...event };
      continue;
    }
    if (event.type === 'dice') {
      add({ kind: 'dice', dice: event.dice, duration: reduced ? 150 : 1600 });
      visual.dice = event.dice ?? [];
      add({ kind: 'settle', duration: reduced ? 100 : 400 });
    }
    if (event.type === 'move' || event.type === 'island') {
      const player = visual.players.find((p) => p.id === event.playerId);
      if (!player) continue;
      const destination =
        event.type === 'island'
          ? next.players.find((p) => p.id === event.playerId)!.position
          : event.tile!;
      const steps =
        event.type === 'island'
          ? (destination - player.position + size) % size
          : Number(event.steps ?? 0);
      for (let i = 0; i < Math.abs(steps); i++) {
        const from = player.position;
        player.position = (from + Math.sign(steps) + size) % size;
        add({
          kind: 'hop',
          playerId: player.id,
          from,
          to: player.position,
          duration: reduced ? 35 : 270,
        });
        if (player.position === 0 && steps > 0 && departure?.playerId === player.id) {
          const amount = Math.min(departure.amount ?? 0, visual.config.startBonus);
          money({ ...departure, amount });
          departure.amount = (departure.amount ?? 0) - amount;
          if (!departure.amount) departure = undefined;
        }
      }
    }
    if (event.type === 'tax_notice')
      add({
        kind: 'tax',
        reason: typeof event.reason === 'string' ? event.reason : undefined,
        playerId: event.playerId,
        tile: event.tile,
        amount: event.amount,
        sound: 'card',
        duration: 5000 + (reduced ? 0 : CARD_ARRIVE_MS),
      });
    if (event.type === 'card')
      add({
        kind: 'card',
        playerId: event.playerId,
        cardId: event.cardId,
        duration: 5500 + (reduced ? 0 : CARD_ARRIVE_MS),
      });
    if (['payment', 'income', 'start_bonus', 'sale'].includes(event.type)) money(event);
    if (event.type === 'turn' || event.type === 'extra_roll') {
      Object.assign(visual, structuredClone(next));
      add({ kind: 'turn', playerId: event.playerId, duration: reduced ? 450 : 1400 });
    }
    if (['purchase', 'buyout', 'sale', 'build'].includes(event.type) && event.tile !== undefined) {
      visual.properties[event.tile] = { ...next.properties[event.tile]! };
      if (['purchase', 'buyout', 'build'].includes(event.type) && typeof event.level === 'number')
        visual.properties[event.tile]!.level = event.level;
      add({
        kind: event.type === 'build' ? 'build' : 'settle',
        sound: event.type === 'buyout' ? 'purchase' : event.type,
        tile: event.tile,
        duration: reduced
          ? 100
          : event.type === 'build'
            ? 350
            : event.type === 'purchase'
              ? 250
              : 700,
      });
    }
    if (event.type === 'championship')
      money({
        ...event,
        type: 'payment',
        playerId: undefined,
        payerId: event.playerId,
        reason: event.type,
      });
    if (['victory', 'bankruptcy'].includes(event.type))
      add({ kind: 'settle', sound: event.type, duration: 150 });
    const highlights = celebrations.filter((celebration) => celebration.eventIndex === index);
    if (highlights.length && frames[firstFrame]) frames[firstFrame]!.cue.celebrations = highlights;
  }
  if (frames.some((frame) => !frame.cue.nonblocking))
    frames.push({ state: next, cue: { kind: 'settle', duration: 50 } });
  return frames;
}

export function presentationMs(events: GameEvent[], pace: PresentationPace = 'normal'): number {
  if (pace === 'fast')
    return events.reduce((ms, event, index) => {
      if (passiveNotices.includes(event.type)) return ms;
      const propertyAmount = propertyPayment(events, index);
      if (propertyAmount !== undefined)
        return ms + (propertyAmount > 0 ? 650 : 0) + (event.type === 'build' ? 350 : 150);
      if (event.type === 'move') return ms + Math.abs(Number(event.steps ?? 0)) * 90;
      if (event.type === 'island') return ms + 32 * 90;
      const durations: Record<string, number> = {
        dice: 750,
        auction_started: 1800,
        earthquake: FAST_CARD_NOTICE_MS + 150,
        casino_result: 5000,
        insured: 150,
        turn: 650,
        extra_roll: 650,
        tax_notice: 5000 + CARD_ARRIVE_MS,
        card: 5500 + CARD_ARRIVE_MS,
        buyout: 150,
        championship: 650,
        victory: 150,
        bankruptcy: 150,
      };
      if (event.type in durations) return ms + durations[event.type]!;
      if (['payment', 'income', 'start_bonus', 'sale'].includes(event.type))
        return ms + ((event.amount ?? 0) > 0 ? 650 : 0) + (event.type === 'sale' ? 150 : 0);
      // All remaining public notices retain readable time; unknown events keep their normal budget.
      return (
        ms +
        Math.min(
          routineNotices.includes(event.type) ? 2200 : FAST_CARD_NOTICE_MS,
          presentationMs([event]),
        )
      );
    }, 0);
  return events.reduce((ms, e, index) => {
    if (passiveNotices.includes(e.type)) return ms;
    const propertyAmount = propertyPayment(events, index);
    if (propertyAmount !== undefined)
      return ms + (propertyAmount > 0 ? 1000 : 0) + (e.type === 'build' ? 350 : 250);
    return (
      ms +
      (e.type === 'dice'
        ? 2000
        : e.type === 'insured'
          ? 700
          : e.type === 'auction_started'
            ? 1800
            : e.type === 'earthquake'
              ? FAST_CARD_NOTICE_MS + 500
              : e.type === 'casino_result'
                ? 5500
                : [
                      'auction_started',
                      'auction_result',
                      'quest_completed',
                      'capital_revealed',
                      'alliance',
                      'alliance_expired',
                      'crisis',
                      'crisis_expired',
                      'victory_warning',
                      'duel_result',
                      'duel_cancelled',
                      'duel_forfeit',
                      'insurance',
                      'insured_tile',
                      'squatter',
                      'expropriate',
                      'roaches',
                      'roaches_expired',
                      'karma',
                    ].includes(e.type)
                  ? 7600
                  : ['payment', 'income', 'start_bonus', 'sale'].includes(e.type) &&
                      (e.amount ?? 0) > 0
                    ? 1500
                    : ['turn', 'extra_roll'].includes(e.type)
                      ? 1400
                      : e.type === 'move'
                        ? Math.abs(Number(e.steps ?? 0)) * 270
                        : e.type === 'tax_notice'
                          ? 5000 + CARD_ARRIVE_MS
                          : e.type === 'card'
                            ? 5500 + CARD_ARRIVE_MS
                            : ['build', 'purchase', 'buyout'].includes(e.type)
                              ? 2200
                              : e.type === 'championship'
                                ? 1500
                                : e.type === 'island'
                                  ? 8640
                                  : 0)
    );
  }, 0);
}
