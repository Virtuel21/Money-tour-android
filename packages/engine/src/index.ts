export { scaledAmount } from './economy.js';
export { config } from './config.js';
export { createRng } from './rng.js';
export {
  createGame,
  reduceGame,
  chooseBotAction,
  getLegalActions,
  isLegalPlayerAction,
  getNetWorth,
  getPropertyValue,
  getRent,
  getPurchaseQuote,
  getBuyoutQuote,
  getConstructionQuote,
  validateState,
} from './engine.js';
export type * from './types.js';

export { sameRules } from './layout.js';
export { default as legacyConfig } from './legacy-v5.config.json';

export { default as legacyConfigV6 } from './legacy-v6.config.json';

export { duelCommitment, duelChoices, getDecisionPlayerId } from './duel.js';

export { default as legacyConfigV7 } from './legacy-v7.config.json';
export { default as legacyConfigV9 } from './legacy-v9.config.json';
export { default as legacyConfigV8 } from './legacy-v8.config.json';
export { adventureText, questRules, auctionCommitment, reservedCity } from './adventure.js';

export { default as legacyConfigV10 } from './legacy-v10.config.json';

export { default as legacyConfigV11 } from './legacy-v11.config.json';

export { default as legacyConfigV12 } from './legacy-v12.config.json';
export { default as legacyConfigV13 } from './legacy-v13.config.json';
export { victoryThreats } from './victory-threats.js';
export { monopolyGroups } from './monopoly.js';

export { default as legacyConfigV14 } from './legacy-v14.config.json';

export { default as legacyConfigV15 } from './legacy-v15.config.json';

export { default as legacyConfigV16 } from './legacy-v16.config.json';
