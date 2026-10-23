import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';

const { config, createGame, createRng, reduceGame, validateState, getLegalActions, sameRules } =
  await tsImport('../packages/engine/src/index.ts', import.meta.url);

export const actionFixtureNames = [
  'duel',
  'festival',
  'insurance',
  'casino',
  'slots',
  'travel',
  'island',
  'alliance',
  'rent',
  'attack',
  'debt',
  'purchase',
];

/** Production-compatible saves: no preview URL or development-only application hook. */
export function createActionFixture(name) {
  assert(actionFixtureNames.includes(name), `Unknown action fixture: ${name}`);
  const seed = `action-card-qa:${name}`;
  let state = createGame({
    config,
    seed,
    players: [
      { id: 'p1', name: 'Léa' },
      { id: 'p2', name: 'Max' },
      { id: 'p3', name: 'Lou' },
      { id: 'p4', name: 'Noa' },
    ],
  });
  state.currentPlayer = 0;
  const player = state.players[0];
  player.laps = 1;
  const city = state.config.board.filter((tile) => tile.type === 'city');
  const owned = city[0];
  const enemy = city.at(-1);
  // Give each decision actual legal targets while keeping the current rules/config intact.
  for (const tile of city.slice(0, 3))
    state.properties[tile.id] = { ownerId: 'p1', level: 0, championships: 0 };
  state.properties[enemy.id] = { ownerId: 'p2', level: 2, championships: 0 };

  const hold = (effect) => {
    const id = state.config.cards.find((card) => card.effect === effect).id;
    state.deck = state.deck.filter((card) => card !== id);
    player.heldCards = [...(player.heldCards ?? []), id];
  };
  const draw = (effect) => {
    const id = state.config.cards.find((card) => card.effect === effect).id;
    state.discard.push(...state.deck.filter((card) => card !== id));
    state.deck = [id];
  };
  const land = (target) => {
    // The same seeded random stream used by applyLocal. Only the pre-roll location is staged.
    const sample = reduceGame(
      state,
      { type: 'roll', playerId: 'p1' },
      createRng(`${seed}:${state.seq}`),
    );
    const dice = sample.events.find((event) => event.type === 'dice').dice;
    const distance = dice.reduce((total, die) => total + die, 0);
    player.position = (target - distance + state.config.board.length) % state.config.board.length;
    state = reduceGame(
      state,
      { type: 'roll', playerId: 'p1' },
      createRng(`${seed}:${state.seq}`),
    ).state;
    // No bonus roll obscures the decision under test after it resolves.
    state.extraRoll = false;
    state.consecutiveDoubles = 0;
  };
  const tile = (type) => state.config.board.find((entry) => entry.type === type).id;
  switch (name) {
    case 'duel':
      land(tile('duel'));
      break;
    case 'festival':
      land(tile('championship'));
      break;
    case 'insurance':
      land(tile('insurance'));
      break;
    case 'casino':
    case 'slots':
      land(tile('casino'));
      state.casino.game = name === 'slots' ? 'slots' : 'roulette';
      break;
    case 'travel':
      land(tile('travel'));
      // This is the next turn of the player who just obtained the travel opportunity.
      state.phase = 'travel';
      break;
    case 'island':
      land(tile('island'));
      state.phase = 'island';
      state.players[0].islandTurns = 1;
      break;
    case 'alliance':
      draw('alliance');
      land(tile('chance'));
      break;
    case 'rent':
      hold('squatter');
      land(enemy.id);
      break;
    case 'attack':
      draw('expropriate');
      land(tile('chance'));
      break;
    case 'debt':
      player.cash = 0;
      state.properties[enemy.id].level = state.config.hotelLevel;
      // Enough owned assets to avoid automatic bankruptcy, but not enough cash for this rent.
      for (const entry of city.slice(0, 3)) state.properties[entry.id].level = 4;
      state.properties[city.at(-4).id] = { ownerId: 'p1', level: 4, championships: 0 };
      land(enemy.id);
      break;
    case 'purchase': {
      const free = city.find((entry) => !state.properties[entry.id].ownerId);
      land(free.id);
      break;
    }
  }
  assert.deepEqual(validateState(state), [], `${name}: invalid production fixture`);
  assert(sameRules(state.config, config), `${name}: fixture must match production game rules`);
  const expectedPhase = {
    duel: 'duel',
    festival: 'championship',
    insurance: 'end',
    casino: 'casino',
    slots: 'casino',
    travel: 'travel',
    island: 'island',
    alliance: 'alliance',
    rent: 'rent',
    attack: 'attack',
    debt: 'debt',
    purchase: 'property',
  }[name];
  assert.equal(state.phase, expectedPhase, `${name}: expected phase`);
  const legal = getLegalActions(state);
  return {
    name,
    save: { version: 1, seed, state },
    expectedPhase,
    owned: owned.id,
    enemy: enemy.id,
    legalTypes: legal.map((action) => action.type),
  };
}

/** Excludes clock/sequence values, which continue to advance during a visible card. */
export function actionStateSignature(state) {
  return JSON.stringify({
    phase: state.phase,
    player: state.players[0],
    duel: state.duel,
    casino: state.casino,
    alliance: state.alliance,
    pendingRent: state.pendingRent,
    pendingAttack: state.pendingAttack,
    debt: state.debt,
    properties: state.properties,
  });
}
