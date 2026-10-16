export type Rng = () => number;
export type Phase =
  | 'roll'
  | 'island'
  | 'travel'
  | 'property'
  | 'championship'
  | 'debt'
  | 'end'
  | 'finished'
  | 'casino'
  | 'attack'
  | 'rent'
  | 'alliance'
  | 'auction'
  | 'duel';
export type TileType =
  | 'start'
  | 'city'
  | 'resort'
  | 'chance'
  | 'island'
  | 'championship'
  | 'travel'
  | 'tax'
  | 'casino'
  | 'insurance'
  | 'karma'
  | 'duel';
export interface Tile {
  id: number;
  name: string;
  type: TileType;
  group?: string;
  color?: string;
  line?: number;
  price?: number;
  rents?: number[];
  buildCosts?: number[];
}
export interface ChanceCard {
  id: string;
  title: string;
  description: string;
  effect:
    | 'cash'
    | 'move_to'
    | 'move_by'
    | 'escape'
    | 'downgrade'
    | 'steal'
    | 'levy'
    | 'squatter'
    | 'expropriate'
    | 'roaches'
    | 'fraud'
    | 'alliance'
    | 'duel';
  amount?: number;
  target?: number;
  steps?: number;
  salary?: boolean;
}
export interface GameConfig {
  moneyDivisor?: number;
  singlePropertyDecision?: boolean;
  adventures?: boolean;
  version: number;
  shuffleStreets?: boolean;
  casinoBaseChance?: number;
  casinoChanceStep?: number;
  casinoMaxChance?: number;
  karmaAmount?: number;
  fraudDiscount?: number;
  earthquakeChance?: number;
  earthquakeMinRound?: number;
  earthquakeCooldownRounds?: number;
  earthquakeMaxCount?: number;
  crisisChance?: number;
  crisisMinRound?: number;
  crisisCooldownRounds?: number;
  crisisMaxCount?: number;
  buildingRequiresGroup?: boolean;
  pricesFollowPosition?: boolean;
  insuranceSingleUse?: boolean;
  bundledPurchase?: boolean;
  duelReplayTies?: boolean;
  travelOnDouble?: boolean;
  casinoMinWin?: number;
  hotelUnlockLaps?: number;
  lineVictory?: boolean;
  resortVictory?: boolean;
  initialCash: number;
  startBonus: number;
  durationMs: number;
  actionTimeoutMs: number;
  minPlayers: number;
  maxPlayers: number;
  groupsToWin: number;
  diceCount: number;
  diceSides: number;
  doublesToIsland: number;
  maxIslandTurns: number;
  islandFee: number;
  championshipFee: number;
  championshipDuration?: number;
  travelFee: number;
  festivalCount: number;
  festivalMultiplier: number;
  initialMaxLevel: number;
  hotelLevel: number;
  buyoutMultiplier: number;
  resaleRate: number;
  taxRate: number;
  taxBase?: number;
  resortRents: number[];
  maxResolutionDepth: number;
  simulationActionLimit: number;
  botReserve: number;
  board: Tile[];
  cards: ChanceCard[];
  network: {
    hostTimeoutMs: number;
    commitTimeoutMs: number;
    revealTimeoutMs: number;
    reconnectTtlMs: number;
    maxRandomRetries: number;
  };
}
export interface PlayerSetup {
  id: string;
  name: string;
  bot?: boolean;
  team?: number;
}
export interface Player extends PlayerSetup {
  bot: boolean;
  cash: number;
  position: number;
  laps: number;
  islandTurns: number | null;
  escapeCards: string[];
  heldCards?: string[];
  insurance?: { tile: number | null };
  fraudLiability?: number;
  travelPending: boolean;
  eliminated: boolean;
  abandoned: boolean;
}
export interface Property {
  ownerId: string | null;
  level: number;
  championships: number;
  championshipTurns?: number;
  roachTurns?: number;
}
export type DebtContinuation = 'property' | 'end';
export interface Debt {
  playerId: string;
  creditorId: string | null;
  amount: number;
  reason: string;
  continuation: DebtContinuation;
}
export interface Winner {
  playerIds: string[];
  teamIds: number[];
  reasons: string[];
  netWorth: number;
}
export interface GameState {
  presentationPace?: 'normal' | 'fast';
  earthquakeHistory?: { count: number; lastRound: number };
  crisisHistory?: { count: number; lastRound: number };
  adventure?: Adventure;
  quests?: Record<string, Quest>;
  auction?: Auction;
  version: number;
  config: GameConfig;
  mode: 'free-for-all' | 'teams';
  players: Player[];
  currentPlayer: number;
  firstPlayer?: number;
  phase: Phase;
  properties: Record<number, Property>;
  festivals: number[];
  deck: string[];
  discard: string[];
  turn: number;
  seq: number;
  elapsedMs: number;
  decisionElapsedMs: number;
  durationMs: number;
  consecutiveDoubles: number;
  extraRoll: boolean;
  dice: number[];
  lastCard: string | null;
  pendingAttack?: string;
  pendingRent?: { tile: number; amount: number; creditorId: string };
  casino?: { tile: number; game: 'roulette' | 'slots'; chance: number };
  casinoVisits?: Record<number, number>;
  alliance?: { beneficiaryId: string; targetId: string };
  crisis?: { remaining: string[] };
  duel?: Duel;
  debt: Debt | null;
  winner: Winner | null;
}
export interface GameOptions {
  randomFirstPlayer?: boolean;
  presentationPace?: 'normal' | 'fast';
  players: PlayerSetup[];
  mode?: 'free-for-all' | 'teams';
  seed?: string | number;
  durationMs?: number;
  config?: GameConfig;
}
type PlayerActionType =
  | 'roll'
  | 'use_squatter'
  | 'pay_rent'
  | 'casino_red'
  | 'casino_black'
  | 'casino_spin'
  | 'duel_accept'
  | 'duel_decline'
  | 'duel_cancel'
  | 'duel_bot'
  | 'finish'
  | 'pay_bail'
  | 'use_escape'
  | 'attempt_escape'
  | 'decline_travel'
  | 'quit';
export type GameAction =
  | { type: 'buy' | 'buy_fraud' | 'upgrade' | 'buyout'; playerId: string; level?: number }
  | { type: 'auction_commit'; playerId: string; hash: string }
  | { type: 'auction_reveal'; playerId: string; amount: number; salt: string }
  | { type: 'auction_pass'; playerId: string }
  | { type: PlayerActionType; playerId: string }
  | {
      type: 'sell' | 'place_championship' | 'travel' | 'insure' | 'attack';
      playerId: string;
      tile: number;
    }
  | { type: 'tick'; elapsedMs: number }
  | { type: 'alliance'; playerId: string; targetId: string }
  | { type: 'duel_offer'; playerId: string; targetId: string; amount: number }
  | { type: 'duel_commit'; playerId: string; hash: string }
  | { type: 'duel_reveal'; playerId: string; choice: DuelChoice; salt: string }
  | { type: 'set_control'; playerId: string; bot: boolean };
export type DuelChoice = 'rock' | 'paper' | 'scissors';
export interface Duel {
  round?: number;
  id: string;
  challengerId: string;
  targetId?: string;
  amount: number;
  stage: 'offer' | 'accept' | 'commit' | 'reveal';
  commitments: Record<string, string>;
  reveals: Record<string, { choice: DuelChoice; salt: string }>;
  escrow: boolean;
}
export interface GameEvent {
  type: string;
  playerId?: string;
  tile?: number;
  amount?: number;
  cardId?: string;
  message?: string;
  dice?: number[];
  [key: string]: unknown;
}
export interface GameResult {
  state: GameState;
  events: GameEvent[];
  error?: string;
}
export type Twist = 'twins' | 'festivals' | 'inheritance' | 'market' | 'capital';
export interface Adventure {
  twist: Twist;
  round: number;
  tenderRound: number;
  tenderDone: boolean;
  marketTile?: number;
  marketDone?: boolean;
  capitalTile?: number;
  capitalPaid?: boolean;
  twinTiles?: number[];
}
export interface Quest {
  kind: 'islands' | 'doubles' | 'builds' | 'laps' | 'cities';
  progress: number;
  completed: boolean;
}
export interface Auction {
  id: string;
  tile: number;
  kind: 'tender' | 'market';
  resume: Phase;
  participants: string[];
  stage: 'commit' | 'reveal';
  commitments: Record<string, string>;
  bids: Record<string, number>;
  passed: string[];
}
