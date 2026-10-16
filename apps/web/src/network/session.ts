import { accumulateStats, newGameStats, rematchOptions, type GameStats } from '../game/gameStats';
import {
  chooseBotAction,
  isLegalPlayerAction,
  getDecisionPlayerId,
  config,
  createGame,
  createRng,
  reduceGame,
  type GameAction,
  type GameEvent,
  type GameState,
} from '@money-tour/engine';
import {
  Ceremony,
  canonical,
  commitment,
  drawSeed,
  hash,
  secret,
  sign,
  verify,
  type Identity,
  type DrawProof,
} from './crypto';
import {
  actionSchema,
  bodySchema,
  commandSchema,
  envelopeSchema,
  frameSchema,
  type AuthIntent,
  type Body,
  type Command,
  type Frame,
  type Member,
} from './schema';
import type { Transport } from './transport';
import { presentationMs } from '../game/presentation';
import { DISCONNECT_GRACE_MS } from './policy';
import { TAUNT_COOLDOWN, taunts, type Taunt, type TauntKind } from '../game/taunts';

const ZERO = '0'.repeat(64);
class NeedsRandom extends Error {}
export function execute(
  state: GameState | null,
  command: Command,
  seed?: string,
): { state: GameState; events: GameEvent[] } {
  const rng = seed
    ? createRng(seed)
    : () => {
        throw new NeedsRandom();
      };
  if (command.type === 'start' || command.type === 'rematch') {
    if (command.type === 'start' && state) throw new Error('Already started');
    if (command.type === 'rematch') {
      if (!state?.winner) throw new Error('Game not finished');
      const expected = rematchOptions(state, command.options.randomFirstPlayer === true);
      // Restoring a human seat from bot control is allowed; table and rules are fixed.
      expected.players = expected.players.map((p) => ({
        ...p,
        bot: command.options.players.find((next) => next.id === p.id)?.bot ?? p.bot,
      }));
      if (canonical(expected) !== canonical(command.options))
        throw new Error('Rematch settings changed');
    }
    return { state: createGame(command.options, rng), events: [] };
  }
  if (!state) throw new Error('Not started');
  const result = reduceGame(state, command.action, rng);
  if (result.error) throw new Error(result.error);
  return result;
}
export function needsRandom(state: GameState | null, command: Command): boolean {
  try {
    execute(state, command);
    return false;
  } catch (error) {
    if (error instanceof NeedsRandom) return true;
    throw error;
  }
}
export interface SessionView {
  stats?: GameStats;
  taunts?: Taunt[];
  state: GameState | null;
  members: Member[];
  host: string;
  self: string;
  connected: string[];
  busy: boolean;
  status: string;
  incidents: string[];
  hash: string;
  epoch: number;
  events: GameEvent[];
  blocked: boolean;
}
interface Round {
  ceremony: Ceremony;
  command: Command;
  secret: string;
  started: number;
  lockSent: boolean;
  revealSent: boolean;
  pending: Map<string, string>;
  done: boolean;
  attestations: Record<string, string>;
}
export interface SavedSession {
  room: string;
  members: Member[];
  host: string;
  epoch: number;
  frames: Frame[];
}

/** All received messages are authenticated and processed in one serial queue. */
export class Session {
  stats: GameStats | undefined;
  taunts: Taunt[] = [];
  private tauntTimes = new Map<string, number>();
  state: GameState | null = null;
  members: Member[] = [];
  host = '';
  epoch = 0;
  frames: Frame[] = [];
  head = ZERO;
  blocked = false;
  status = 'Connexion au salon…';
  incidents: string[] = [];
  events: GameEvent[] = [];
  onChange: (view: SessionView) => void = () => {};
  onPersist: (save: SavedSession) => void = () => {};
  private room = '';
  private serial = 0;
  private peers = new Map<string, string>();
  private seen = new Map<string, number>();
  private identities = new Map<string, JsonWebKey>();
  private dedup = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private round: Round | null = null;
  private stopped = false;
  private busy = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHello = 0;
  private lastTick = 0;
  private lastBot = 0;
  private presentationUntil = 0;
  private joinWarningShown = false;
  private exclusions = new Set<string>();
  private unavailableSince = new Map<string, number>();
  private reclaimOnSync = false;
  private failures = 0;
  private hostMissingSince: number | null = null;
  private recovering = false;
  private recoveryUntil = 0;
  private scheduled: { from: string; body: Extract<Body, { type: 'contribution' }> }[] = [];
  constructor(
    readonly transport: Transport,
    readonly user: Identity,
    public name: string,
    readonly creator = false,
    private now = () => Date.now(),
  ) {}
  get isHost(): boolean {
    return this.host === this.user.id;
  }
  get view(): SessionView {
    return {
      stats: this.stats,
      taunts: this.taunts,
      state: this.state,
      members: this.members,
      host: this.host,
      self: this.user.id,
      connected: this.connected(),
      busy: this.busy || !!this.round,
      status: this.status,
      incidents: this.incidents,
      hash: this.head,
      epoch: this.epoch,
      events: this.events,
      blocked: this.blocked,
    };
  }
  private connected(): string[] {
    return this.members
      .filter(
        (m) =>
          m.id === this.user.id ||
          (this.seen.get(m.id) ?? 0) > this.now() - config.network.hostTimeoutMs,
      )
      .map((m) => m.id);
  }
  private emit(): void {
    this.onChange(this.view);
  }
  private incident(message: string): void {
    this.incidents = [message, ...this.incidents].slice(0, 30);
    this.status = message;
    this.emit();
  }
  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue
      .then(async () => {
        if (!this.stopped) await job();
      })
      .catch((error) => {
        this.incident(error instanceof Error ? error.message : 'Message réseau rejeté');
      });
  }
  async idle(): Promise<void> {
    await this.queue;
  }
  async join(code: string, saved?: SavedSession, automatic = true): Promise<void> {
    this.room = await hash({ code, protocol: 1 });
    if (this.stopped) return;
    this.identities.set(this.user.id, this.user.publicKey);
    if (saved && saved.room === this.room) {
      this.recovering = true;
      this.reclaimOnSync = true;
      this.recoveryUntil = this.now() + config.network.hostTimeoutMs;
      this.members = saved.members;
      this.host = saved.host;
      this.epoch = saved.epoch;
      for (const member of this.members) this.identities.set(member.id, member.key);
      for (const frame of saved.frames) await this.acceptFrame(frame, false);
    } else if (this.creator) {
      this.host = this.user.id;
      this.members = [
        { id: this.user.id, name: this.name, key: { ...this.user.publicKey }, order: 0 },
      ];
    }
    this.transport.onMessage = (message, peer) => this.enqueue(() => this.receive(message, peer));
    this.transport.onPeerJoin = () => this.enqueue(() => this.hello());
    this.transport.onPeerLeave = (peer) => {
      const id = [...this.peers].find(([, p]) => p === peer)?.[0];
      if (id) {
        this.peers.delete(id);
        this.seen.delete(id);
        if (!this.unavailableSince.has(id)) this.unavailableSince.set(id, this.now());
        if (id === this.host) this.hostMissingSince = this.now();
      }
      this.emit();
    };
    this.transport.onError = (message) => this.incident(message);
    await this.transport.join(code);
    if (this.stopped) {
      this.transport.leave();
      return;
    }
    await this.hello();
    if (this.stopped) return;
    this.lastTick = this.now();
    this.lastHello = this.now();
    this.status = this.state
      ? this.recovering
        ? 'Reconnexion à la partie…'
        : 'Partie synchronisée.'
      : this.isHost
        ? 'Salon prêt : invitez vos amis.'
        : 'Recherche de l’hôte…';
    if (this.host) this.persist();
    this.emit();
    if (automatic) this.timer = setInterval(() => this.enqueue(() => this.pulse()), 250);
  }
  private async send(body: Body, peer?: string): Promise<void> {
    const unsigned = {
      room: this.room,
      from: this.user.id,
      peer: this.transport.peerId,
      serial: ++this.serial,
      key: this.user.publicKey,
      body,
    };
    this.transport.send(
      { ...unsigned, signature: await sign(this.user.privateKey, unsigned) },
      peer,
    );
  }
  private acceptTaunt(
    playerId: string,
    kind: TauntKind,
    targetId: string | undefined,
    id: string,
  ): boolean {
    const player = this.state?.players.find((p) => p.id === playerId);
    if (
      !player ||
      player.bot ||
      player.eliminated ||
      this.state?.winner ||
      !taunts.some((t) => t.id === kind)
    )
      return false;
    if (targetId && !this.state?.players.some((p) => p.id === targetId && !p.eliminated))
      return false;
    const now = this.now(),
      previous = this.tauntTimes.get(playerId);
    if (previous !== undefined && now - previous < TAUNT_COOLDOWN) return false;
    this.tauntTimes.set(playerId, now);
    this.taunts = [
      ...this.taunts.filter((t) => t.playerId !== playerId),
      { id, playerId, kind, targetId, at: now },
    ].slice(-4);
    this.emit();
    return true;
  }
  async taunt(kind: TauntKind, targetId?: string): Promise<void> {
    this.enqueue(async () => {
      if (this.acceptTaunt(this.user.id, kind, targetId, `${this.user.id}:${this.serial + 1}`))
        await this.send({ type: 'taunt', kind, targetId });
    });
    await this.idle();
  }
  async rename(name: string): Promise<void> {
    const value = name.trim().slice(0, 20);
    if (!value || this.state || this.round) return;
    this.name = value;
    if (this.isHost) {
      const member = this.members.find((m) => m.id === this.user.id);
      if (member) member.name = value;
      this.persist();
    }
    await this.hello();
    this.emit();
  }
  private async hello(): Promise<void> {
    await this.send({
      type: 'hello',
      name: this.name,
      creator: this.creator,
      epoch: this.epoch,
      index: this.frames.length,
      head: this.head,
    });
    if (this.isHost) await this.statusMessage();
  }
  private async statusMessage(): Promise<void> {
    await this.send({
      type: 'status',
      host: this.host,
      epoch: this.epoch,
      members: this.members,
      index: this.frames.length,
      head: this.head,
    });
  }
  private persist(): void {
    this.onPersist({
      room: this.room,
      members: this.members,
      host: this.host,
      epoch: this.epoch,
      frames: this.frames,
    });
  }
  private recovered(): void {
    this.recovering = false;
    if (!this.reclaimOnSync) return;
    this.reclaimOnSync = false;
    const player = this.state?.players.find((p) => p.id === this.user.id);
    if (player?.bot && !player.eliminated && !this.state?.winner)
      void this.intent({ type: 'set_control', playerId: this.user.id, bot: false });
  }
  private async receive(raw: unknown, peer: string): Promise<void> {
    if (JSON.stringify(raw).length > 8_000_000) return;
    const parsed = envelopeSchema.safeParse(raw);
    if (!parsed.success) return;
    const { signature, ...message } = parsed.data;
    if (message.room !== this.room || message.peer !== peer) return;
    const stamp = `${peer}:${message.serial}`;
    if (this.dedup.has(stamp)) return;
    const known = this.identities.get(message.from);
    if ((await hash(message.key)) !== message.from) return;
    if (!(await verify(known ?? message.key, message, signature))) return;
    this.identities.set(message.from, message.key);
    this.dedup.add(stamp);
    if (this.dedup.size > 3000) this.dedup.delete(this.dedup.values().next().value!);
    this.peers.set(message.from, peer);
    this.seen.set(message.from, this.now());
    if (!this.exclusions.has(message.from)) this.unavailableSince.delete(message.from);
    const body = bodySchema.parse(message.body),
      from = message.from;
    if (body.type === 'hello') {
      if (body.head === this.head && body.index === this.frames.length && !this.round) {
        this.exclusions.delete(from);
        this.unavailableSince.delete(from);
      }
      if (!this.host && body.creator) this.host = from;
      if (this.isHost) {
        const existing = this.members.find((m) => m.id === from);
        if (existing && !this.state && !this.round) {
          existing.name = body.name;
          this.persist();
        }
        if (!this.members.some((m) => m.id === from) && !this.state && this.members.length < 4) {
          this.members.push({
            id: from,
            name: body.name,
            key: message.key,
            order: this.members.length,
          });
          this.persist();
        }
        if (this.members.some((m) => m.id === from)) {
          await this.statusMessage();
          if (body.index !== this.frames.length || body.head !== this.head)
            await this.send({ type: 'snapshot', frames: this.frames }, peer);
        }
      }
      this.emit();
      return;
    }
    if (body.type === 'status') {
      if (
        this.recovering &&
        body.epoch > this.epoch &&
        body.host === from &&
        this.members.some((m) => m.id === from)
      ) {
        this.host = from;
        this.epoch = body.epoch;
        this.round = null;
        this.recovering = false;
      }
      if (!this.host) this.host = body.host;
      if (from !== this.host || body.host !== from) return;
      if (body.epoch !== this.epoch) {
        this.blocked = true;
        this.incident('Historiques réseau concurrents : partie suspendue.');
        return;
      }
      this.hostMissingSince = null;
      for (const member of body.members) {
        if ((await hash(member.key)) !== member.id) return;
        this.identities.set(member.id, member.key);
      }
      if (this.state && canonical(body.members) !== canonical(this.members)) return;
      this.members = body.members;
      if (body.index === this.frames.length && body.head !== this.head) {
        this.blocked = true;
        this.incident('Divergence d’état détectée : partie suspendue.');
        return;
      }
      if (body.index > this.frames.length) await this.send({ type: 'sync' }, peer);
      if (body.index === this.frames.length && body.head === this.head) {
        this.recovered();
        if (this.state) this.status = 'Partie synchronisée.';
      }
      if (!this.members.some((m) => m.id === this.user.id))
        this.status = 'Ce salon est complet ou la partie a déjà commencé.';
      else if (!this.state) this.status = 'Salon connecté. L’hôte peut lancer la partie.';
      this.persist();
      this.emit();
      return;
    }
    if (!this.members.some((m) => m.id === from)) return;
    if (body.type === 'taunt') {
      this.acceptTaunt(from, body.kind, body.targetId, stamp);
      return;
    }
    if (body.type === 'attest' && this.round?.ceremony.context.nonce === body.nonce) {
      this.round.attestations[from] = body.signature;
      await this.finishRound();
      return;
    }
    if (body.type === 'sync' && this.isHost) {
      await this.send({ type: 'snapshot', frames: this.frames }, peer);
      return;
    }
    if (body.type === 'snapshot' && from === this.host) {
      if (body.frames.length < this.frames.length) return;
      for (let i = 0; i < this.frames.length; i++)
        if (body.frames[i]?.result !== this.frames[i]?.result) {
          this.blocked = true;
          this.incident('La reprise contredit le dernier état validé.');
          return;
        }
      for (const frame of body.frames.slice(this.frames.length))
        await this.acceptFrame(frame, false);
      this.status = 'Partie synchronisée.';
      this.recovered();
      this.persist();
      this.emit();
      return;
    }
    if (body.type === 'intent' && this.isHost) {
      if (await this.validIntent(body.intent, from))
        await this.propose({ type: 'action', action: body.intent.action, auth: body.intent });
      return;
    }
    if (body.type === 'round' && from === this.host) {
      await this.openRound(body);
      return;
    }
    if (body.type === 'contribution') {
      await this.contribute(from, body);
      return;
    }
    if (body.type === 'frame' && from === this.host) {
      if (body.frame.index < this.frames.length) return;
      if (body.frame.index > this.frames.length) {
        await this.send({ type: 'sync' }, peer);
        return;
      }
      await this.acceptFrame(body.frame, true);
      this.persist();
      this.emit();
      return;
    }
    if (
      body.type === 'abort' &&
      from === this.host &&
      this.round?.ceremony.context.nonce === body.nonce
    ) {
      this.round = null;
      for (const id of body.missing) {
        this.exclusions.add(id);
        if (!this.unavailableSince.has(id)) this.unavailableSince.set(id, this.now());
      }
      this.incident('Tirage annulé : contribution manquante. Aucun résultat incomplet accepté.');
      return;
    }
    if (body.type === 'migration') {
      if (body.epoch === this.epoch && from === this.host) return;
      if (body.epoch !== this.epoch + 1 || this.hostAlive()) return;
      const candidate = this.successor();
      if (candidate !== from) return;
      if (body.index !== this.frames.length || body.head !== this.head) {
        this.blocked = true;
        this.incident('Migration suspendue : les derniers états diffèrent.');
        return;
      }
      this.epoch = body.epoch;
      this.host = from;
      this.hostMissingSince = null;
      this.round = null;
      this.busy = false;
      this.lastTick = this.now();
      this.persist();
      this.incident('Nouvel hôte : la partie reprend au dernier état validé.');
    }
  }
  private hostAlive(): boolean {
    return (
      this.isHost || (this.seen.get(this.host) ?? 0) > this.now() - config.network.hostTimeoutMs
    );
  }
  private successor(): string | undefined {
    return this.members
      .filter((m) => m.id !== this.host && this.connected().includes(m.id))
      .sort((a, b) => a.order - b.order)[0]?.id;
  }
  private async validIntent(intent: AuthIntent, from: string): Promise<boolean> {
    if (
      intent.playerId !== from ||
      intent.parent !== this.head ||
      !('playerId' in intent.action) ||
      intent.action.playerId !== from
    )
      return false;
    if (intent.action.type === 'set_control' && intent.action.bot) return false;
    if (
      this.state &&
      !['quit', 'set_control'].includes(intent.action.type) &&
      !isLegalPlayerAction(this.state, intent.action)
    )
      return false;
    const { signature, ...unsigned } = intent;
    return verify(this.identities.get(from)!, { room: this.room, ...unsigned }, signature);
  }
  async intent(action: GameAction): Promise<void> {
    if (
      !actionSchema.safeParse(action).success ||
      !('playerId' in action) ||
      action.playerId !== this.user.id
    )
      return;
    const unsigned = { playerId: this.user.id, parent: this.head, action };
    const intent = {
      ...unsigned,
      signature: await sign(this.user.privateKey, { room: this.room, ...unsigned }),
    };
    if (this.isHost)
      this.enqueue(async () => {
        if (await this.validIntent(intent, this.user.id))
          await this.propose({ type: 'action', action, auth: intent });
      });
    else {
      const peer = this.peers.get(this.host);
      if (peer) await this.send({ type: 'intent', intent }, peer);
    }
  }
  async start(
    count: number,
    teams: boolean,
    durationMs: number,
    presentationPace: 'normal' | 'fast' = 'normal',
  ): Promise<void> {
    this.enqueue(async () => {
      if (!this.isHost || this.state) return;
      if (teams) count = 4;
      const players = this.members.map((m, i) => ({
        id: m.id,
        name:
          m.name === 'Vous'
            ? `Joueur ${i + 1}`
            : this.members.filter((other) => other.name === m.name).length > 1
              ? `${m.name.slice(0, 16)} ${i + 1}`
              : m.name,
        bot: false,
        ...(teams ? { team: i % 2 } : {}),
      }));
      while (players.length < Math.max(count, players.length)) {
        const i = players.length;
        players.push({
          id: `bot-${i}`,
          name: ['Sacha', 'Lou', 'Noa', 'Alba'][i]!,
          bot: true,
          ...(teams ? { team: i % 2 } : {}),
        });
      }
      await this.propose(
        commandSchema.parse({
          type: 'start',
          options: {
            randomFirstPlayer: true,
            players,
            mode: teams ? 'teams' : 'free-for-all',
            durationMs,
            presentationPace,
          },
        }),
      );
    });
  }
  async rematch(): Promise<void> {
    this.enqueue(async () => {
      if (!this.isHost || !this.state?.winner) return;
      const options = rematchOptions(this.state);
      options.players = options.players.map((player) => ({
        ...player,
        bot: this.members.some((member) => member.id === player.id)
          ? !this.connected().includes(player.id)
          : true,
      }));
      await this.propose(commandSchema.parse({ type: 'rematch', options }));
    });
  }
  private async permitted(command: Command): Promise<boolean> {
    if (command.type === 'rematch') {
      if (!this.state?.winner) return false;
      const previous = rematchOptions(this.state, command.options.randomFirstPlayer === true);
      previous.players = previous.players.map((player) => ({
        ...player,
        bot: this.members.some((member) => member.id === player.id)
          ? (command.options.players.find((p) => p.id === player.id)?.bot ?? true)
          : true,
      }));
      return canonical(previous) === canonical(command.options);
    }
    if (command.type === 'start')
      return (
        !this.state &&
        this.members.every((m) => command.options.players.some((p) => p.id === m.id && !p.bot))
      );
    if (command.auth)
      return (
        (await this.validIntent(command.auth, command.auth.playerId)) &&
        canonical(command.auth.action) === canonical(command.action)
      );
    const a = command.action;
    if (a.type === 'tick') return true;
    if (a.type === 'set_control') return a.bot; // Liveness policy is host-managed and explicitly not a cryptographic clock.
    return !!this.state?.players.find((p) => p.id === a.playerId)?.bot;
  }
  private async propose(command: Command): Promise<void> {
    if (
      !this.isHost ||
      this.blocked ||
      this.busy ||
      this.round ||
      (this.state?.winner && command.type !== 'rematch') ||
      !(await this.permitted(command))
    )
      return;
    this.busy = true;
    try {
      if (needsRandom(this.state, command)) {
        const participants = this.connected().filter((id) => !this.exclusions.has(id));
        if (!participants.includes(this.user.id)) participants.unshift(this.user.id);
        const context = {
          room: this.room,
          epoch: this.epoch,
          seq: this.frames.length,
          parent: this.head,
          command: await hash(command),
          participants,
          nonce: secret(),
        };
        const body: Extract<Body, { type: 'round' }> = { type: 'round', context, command };
        await this.send(body);
        await this.openRound(body);
      } else await this.publish(command, null);
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  private async openRound(body: Extract<Body, { type: 'round' }>): Promise<void> {
    const c = body.context;
    if (
      this.blocked ||
      c.room !== this.room ||
      c.epoch !== this.epoch ||
      c.seq !== this.frames.length ||
      c.parent !== this.head ||
      c.command !== (await hash(body.command)) ||
      !(await this.permitted(body.command))
    )
      return;
    if (this.round) {
      if (this.round.ceremony.context.nonce === c.nonce) return;
      throw new Error('Cérémonies contradictoires');
    }
    if (!c.participants.every((id) => this.members.some((m) => m.id === id))) return;
    if (!c.participants.includes(this.user.id) && !this.exclusions.has(this.user.id))
      throw new Error('Contribution omise par l’hôte');
    this.round = {
      ceremony: new Ceremony(c),
      command: body.command,
      secret: secret(),
      started: this.now(),
      lockSent: false,
      revealSent: false,
      pending: new Map(),
      done: false,
      attestations: {},
    };
    this.status =
      c.participants.length === 1
        ? 'Aléa local : hôte seul.'
        : 'Tirage partagé : vérification des contributions…';
    this.emit();
    if (c.participants.includes(this.user.id))
      await this.ownContribution('commit', await commitment(c, this.user.id, this.round.secret));
    const waiting = this.scheduled.splice(0);
    for (const item of waiting) await this.contribute(item.from, item.body);
  }
  private async ownContribution(kind: 'commit' | 'lock' | 'reveal', value: string): Promise<void> {
    if (!this.round) return;
    const body: Extract<Body, { type: 'contribution' }> = {
      type: 'contribution',
      nonce: this.round.ceremony.context.nonce,
      kind,
      value,
    };
    await this.send(body);
    await this.contribute(this.user.id, body);
  }
  private async contribute(
    from: string,
    body: Extract<Body, { type: 'contribution' }>,
  ): Promise<void> {
    const round = this.round;
    if (!round) {
      if (this.scheduled.length < 40) this.scheduled.push({ from, body });
      return;
    }
    if (body.nonce !== round.ceremony.context.nonce) return;
    const ceremony = round.ceremony;
    if (body.kind === 'reveal' && !ceremony.locked) {
      round.pending.set(from, body.value);
      return;
    }
    ceremony.put(body.kind, from, body.value);
    if (
      ceremony.committed &&
      !round.lockSent &&
      ceremony.context.participants.includes(this.user.id)
    ) {
      round.lockSent = true;
      await this.ownContribution('lock', await hash(ceremony.commitments));
    }
    if (ceremony.locked) {
      const expected = await hash(ceremony.commitments);
      if (Object.values(ceremony.locks).some((lock) => lock !== expected))
        throw new Error('Engagements divergents');
      for (const [id, value] of round.pending) {
        ceremony.put('reveal', id, value);
        round.pending.delete(id);
      }
      if (!round.revealSent && ceremony.context.participants.includes(this.user.id)) {
        round.revealSent = true;
        await this.ownContribution('reveal', round.secret);
      }
    }
    if (ceremony.complete && !round.done) {
      round.done = true;
      const proof = ceremony.proof();
      await drawSeed(proof);
      if (ceremony.context.participants.includes(this.user.id)) {
        const signature = await sign(this.user.privateKey, {
          domain: 'money-tour-draw-proof-v1',
          ...proof,
        });
        round.attestations[this.user.id] = signature;
        await this.send({ type: 'attest', nonce: ceremony.context.nonce, signature });
      }
      await this.finishRound();
    }
  }
  private async finishRound(): Promise<void> {
    const round = this.round;
    if (!round?.ceremony.complete || !this.isHost) return;
    const proof = round.ceremony.proof();
    if (!proof.context.participants.every((id) => round.attestations[id])) return;
    for (const id of proof.context.participants)
      if (
        !(await verify(
          this.identities.get(id)!,
          { domain: 'money-tour-draw-proof-v1', ...proof },
          round.attestations[id]!,
        ))
      )
        throw new Error('Attestation du tirage invalide');
    await this.publish(round.command, { ...proof, attestations: round.attestations });
  }
  private async publish(command: Command, proof: DrawProof | null): Promise<void> {
    const result = execute(this.state, command, proof ? await drawSeed(proof) : undefined);
    const unsigned = {
      room: this.room,
      epoch: this.epoch,
      index: this.frames.length,
      parent: this.head,
      command,
      proof,
      result: await hash(result.state),
      signer: this.user.id,
    };
    const frame = { ...unsigned, signature: await sign(this.user.privateKey, unsigned) };
    await this.acceptFrame(frame, true);
    await this.send({ type: 'frame', frame });
    this.persist();
    this.emit();
  }
  private async acceptFrame(raw: Frame, live: boolean): Promise<void> {
    const frame = frameSchema.parse(raw);
    const { signature, ...unsigned } = frame;
    if (
      frame.room !== this.room ||
      frame.index !== this.frames.length ||
      frame.parent !== this.head
    )
      throw new Error('Chaîne d’actions invalide');
    const key = this.identities.get(frame.signer);
    if (!key || !(await verify(key, unsigned, signature)))
      throw new Error('Signature d’action invalide');
    if (!(await this.permitted(frame.command))) throw new Error('Auteur de l’intention invalide');
    let seed: string | undefined;
    if (frame.proof) {
      if (
        live &&
        !frame.proof.context.participants.includes(this.user.id) &&
        !this.exclusions.has(this.user.id)
      )
        throw new Error('Votre contribution manque au tirage');
      const { attestations, ...attested } = frame.proof;
      for (const id of frame.proof.context.participants) {
        const contributorKey = this.identities.get(id);
        if (
          !contributorKey ||
          !attestations?.[id] ||
          !(await verify(
            contributorKey,
            { domain: 'money-tour-draw-proof-v1', ...attested },
            attestations[id],
          ))
        )
          throw new Error('Preuve de contribution non authentifiée');
      }
      const c = frame.proof.context;
      if (
        c.room !== this.room ||
        c.epoch !== frame.epoch ||
        c.seq !== frame.index ||
        c.parent !== frame.parent ||
        c.command !== (await hash(frame.command))
      )
        throw new Error('Preuve hors contexte');
      if (
        live &&
        this.round &&
        canonical(this.round.ceremony.commitments) !== canonical(frame.proof.commitments)
      )
        throw new Error('Preuve différente des engagements reçus');
      seed = await drawSeed(frame.proof);
    }
    const result = execute(this.state, frame.command, seed);
    if ((await hash(result.state)) !== frame.result) throw new Error('Hash d’état invalide');
    this.stats =
      frame.command.type === 'action' && this.state
        ? accumulateStats(this.stats, this.state, result.state, result.events)
        : newGameStats(result.state);
    if (frame.command.type === 'rematch') {
      this.taunts = [];
      this.tauntTimes.clear();
      this.presentationUntil = 0;
      this.exclusions.clear();
      this.unavailableSince.clear();
      this.lastTick = this.now();
    }
    this.state = result.state;
    if (
      frame.command.type === 'action' &&
      frame.command.action.type === 'set_control' &&
      !frame.command.action.bot
    ) {
      this.exclusions.delete(frame.command.action.playerId);
      this.unavailableSince.delete(frame.command.action.playerId);
    }
    this.events = result.events;
    if (live && result.events.length) {
      this.presentationUntil =
        Math.max(this.now(), this.presentationUntil) +
        presentationMs(result.events, this.state.presentationPace ?? 'normal') +
        100;
      this.lastBot = this.presentationUntil;
    }
    this.head = frame.result;
    this.frames.push(frame);
    this.round = null;
    this.failures = 0;
    this.status =
      frame.proof?.context.participants.length === 1 ||
      this.connected().filter((id) => !this.exclusions.has(id)).length < 2
        ? 'Aléa local : hôte seul.'
        : 'État vérifié et synchronisé.';
  }
  async pulse(): Promise<void> {
    const now = this.now();
    if (this.recovering && now < this.recoveryUntil) {
      await this.hello();
      return;
    }
    if (now - this.lastHello >= 3000) {
      this.lastHello = now;
      await this.hello();
    }
    if (!this.host) {
      if (now - this.lastTick > 25000 && !this.joinWarningShown) {
        this.joinWarningShown = true;
        this.incident(
          'Connexion toujours en cours. Vérifiez que l’hôte garde son salon ouvert. Certains réseaux 4G/5G nécessitent un relais TURN ; vous pouvez réessayer ou changer de réseau.',
        );
      }
      return;
    }
    if (!this.hostAlive()) {
      if (this.hostMissingSince === null)
        this.hostMissingSince = now - config.network.hostTimeoutMs;
      this.status = 'Hôte déconnecté : attente de la relève (15 s).';
      this.emit();
      if (
        now - this.hostMissingSince >= config.network.hostTimeoutMs &&
        this.successor() === this.user.id
      ) {
        this.host = this.user.id;
        this.epoch++;
        this.hostMissingSince = null;
        this.round = null;
        this.busy = false;
        this.lastTick = now;
        await this.send({
          type: 'migration',
          epoch: this.epoch,
          index: this.frames.length,
          head: this.head,
        });
        this.persist();
        this.incident('Vous êtes le nouvel hôte. La partie reprend.');
      }
      return;
    }
    if (this.blocked || !this.isHost) return;
    if (this.round) {
      this.lastTick = now;
      if (
        now - this.round.started >
        config.network.commitTimeoutMs + config.network.revealTimeoutMs
      ) {
        const c = this.round.ceremony;
        const missing = c.context.participants.filter(
          (id) => !c.secrets[id] || !this.round?.attestations[id],
        );
        await this.send({ type: 'abort', nonce: c.context.nonce, missing });
        for (const id of missing)
          if (id !== this.user.id) {
            this.exclusions.add(id);
            if (!this.unavailableSince.has(id)) this.unavailableSince.set(id, now);
          }
        this.round = null;
        this.failures++;
        this.incident(
          'Tirage annulé : contribution manquante. Réessayez après la reconnexion ; le siège reste réservé pendant 90 secondes.',
        );
        if (this.failures >= config.network.maxRandomRetries) {
          this.blocked = true;
          this.incident('Trop d’interruptions réseau : partie suspendue.');
        }
      }
      return;
    }
    if (!this.state || this.state.winner) return;
    // Give humans their entire decision window after the shared presentation,
    // just as local play already does. Heartbeats and recovery still run above.
    if (now < this.presentationUntil) {
      this.lastTick = now;
      return;
    }
    const unavailable = this.state.players.filter(
      (p) =>
        !p.bot && !p.eliminated && (!this.connected().includes(p.id) || this.exclusions.has(p.id)),
    );
    for (const player of unavailable) {
      if (!this.unavailableSince.has(player.id))
        this.unavailableSince.set(player.id, this.seen.get(player.id) ?? now);
    }
    const absent = unavailable.find(
      (p) => now - this.unavailableSince.get(p.id)! >= DISCONNECT_GRACE_MS,
    );
    if (absent) {
      await this.propose({
        type: 'action',
        action: { type: 'set_control', playerId: absent.id, bot: true },
      });
      return;
    }
    if (unavailable.length) {
      this.lastTick = now;
      const remaining = Math.max(
        ...unavailable.map((p) =>
          Math.ceil((DISCONNECT_GRACE_MS - (now - this.unavailableSince.get(p.id)!)) / 1000),
        ),
      );
      this.status = `Reconnexion de ${unavailable.map((p) => p.name).join(', ')}… Partie en attente · bot dans ${remaining} s.`;
      this.emit();
      return;
    }
    const active = this.state.players.find((p) => p.id === getDecisionPlayerId(this.state!))!;
    if (!active.bot && this.state.decisionElapsedMs >= config.actionTimeoutMs - 1000) {
      await this.propose({
        type: 'action',
        action: { type: 'set_control', playerId: active.id, bot: true },
      });
      return;
    }
    if (now - this.lastTick >= 1000) {
      this.lastTick = now;
      await this.propose({ type: 'action', action: { type: 'tick', elapsedMs: 1000 } });
      return;
    }
    if (active.bot && now - this.lastBot >= 900) {
      this.lastBot = now;
      await this.propose({ type: 'action', action: chooseBotAction(this.state) });
    }
  }
  close(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.transport.leave();
  }
}
