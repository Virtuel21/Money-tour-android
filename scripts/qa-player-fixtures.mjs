import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';

const { config, createGame, validateState, sameRules, questRules } = await tsImport(
  '../packages/engine/src/index.ts',
  import.meta.url,
);

export const playerFixtureNames = ['friends', 'two', 'teams', 'stress'];

/** Current, validated saves loaded through the ordinary Resume my game workflow. */
export function createPlayerFixture(name) {
  assert(playerFixtureNames.includes(name), `Unknown player fixture: ${name}`);
  const seed = `player-profile-qa:${name}`;
  const two = name === 'two';
  const stress = name === 'stress';
  const players = [
    { id: 'p1', name: stress ? 'Alexandrine-Marie' : 'Léa' },
    { id: 'p2', name: stress ? 'Jean-Christophe' : 'Sacha' },
    { id: 'p3', name: 'Lou', bot: true },
    { id: 'p4', name: 'Noa' },
  ].slice(0, two ? 2 : 4);
  const state = createGame({
    config,
    seed,
    players,
    mode: name === 'teams' ? 'teams' : 'free-for-all',
  });
  state.currentPlayer = two ? 0 : 3;
  state.turn = 9;
  state.dice = [2, 2];
  const assets = state.config.board.filter((tile) => ['city', 'resort'].includes(tile.type));
  for (const property of Object.values(state.properties)) {
    property.ownerId = null;
    property.level = 0;
    property.championships = 0;
  }
  const owners = stress
    ? ['p1', 'p1', 'p2', 'p1', 'p1', 'p2', 'p1', 'p1', 'p1', 'p2', 'p1', 'p1', 'p1', 'p1']
    : two
      ? ['p1', 'p2', 'p1', 'p2']
      : ['p1', 'p2', 'p3', 'p4', 'p2', 'p3', 'p4', 'p3', 'p4', 'p3'];
  for (const [index, ownerId] of owners.entries()) {
    const tile = assets[index];
    state.properties[tile.id] = {
      ownerId,
      level: tile.type === 'city' ? index % 3 : 0,
      championships: 0,
    };
  }
  for (const [index, player] of state.players.entries()) {
    player.cash = [1911, 1043, 617, 1365][index];
    player.laps = index === 3 ? 2 : 1;
    player.position = index * 8;
  }
  const insured = assets.find((tile) => state.properties[tile.id].ownerId === 'p2');
  state.players[1].insurance = { tile: insured.id };
  const keep = (effect, player) => {
    const id = state.config.cards.find((card) => card.effect === effect).id;
    state.deck = state.deck.filter((entry) => entry !== id);
    if (effect === 'escape') player.escapeCards.push(id);
    else player.heldCards = [...(player.heldCards ?? []), id];
  };
  keep('escape', state.players[0]);
  keep('fraud', state.players[0]);
  if (stress) {
    state.players[0].cash = 123456789;
    state.players[0].laps = 128;
    state.players[0].fraudLiability = 50000;
    state.players[1].islandTurns = 1;
    state.players[2].cash = 0;
    state.players[2].eliminated = true;
  }
  // These are saves after the staged gains: already fulfilled quests have already
  // been awarded, so the ordinary clock cannot open an unrelated achievement card.
  for (const player of state.players) {
    const quest = state.quests?.[player.id];
    if (!quest) continue;
    if (quest.kind === 'laps') quest.progress = player.laps;
    if (['cities', 'islands'].includes(quest.kind))
      quest.progress = assets.filter(
        (tile) =>
          tile.type === (quest.kind === 'cities' ? 'city' : 'resort') &&
          state.properties[tile.id].ownerId === player.id,
      ).length;
    quest.completed = quest.progress >= questRules[quest.kind].goal;
  }
  assert.deepEqual(validateState(state), [], `${name}: valid current save`);
  assert(sameRules(state.config, config), `${name}: production rules are unchanged`);
  return { name, save: { version: 1, seed, state } };
}
