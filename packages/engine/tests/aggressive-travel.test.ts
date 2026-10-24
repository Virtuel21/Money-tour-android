import { expect, it } from 'vitest';
import {
  config,
  createGame,
  getBuyoutQuote,
  getLegalActions,
  getRent,
  reduceGame,
  validateState,
  type GameAction,
  type GameState,
} from '../src/index';

function travelGame() {
  const state = createGame({
    config: { ...config, shuffleStreets: false, adventures: false, festivalCount: 0 },
    players: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
  });
  state.phase = 'travel';
  state.players[0]!.position = 0;
  state.players[0]!.travelPending = true;
  state.properties[1]!.ownerId = 'b';
  state.properties[1]!.level = 1;
  return state;
}

function step(state: GameState, action: GameAction) {
  const result = reduceGame(state, action, () => 0.5);
  expect(result.error).toBeUndefined();
  expect(validateState(result.state)).toEqual([]);
  return result;
}

it('travels onto a rival city, pays its rent once, then buys it with its existing house', () => {
  const initial = travelGame();
  const rent = getRent(initial, 1);
  const a = initial.players[0]!.cash,
    b = initial.players[1]!.cash;
  const trip = step(initial, { type: 'travel', playerId: 'a', tile: 1 });
  expect(trip.state.players[0]).toMatchObject({
    position: 1,
    cash: a - config.travelFee - rent,
    travelPending: false,
  });
  expect(trip.state.players[1]!.cash).toBe(b + rent);
  expect(
    trip.events.filter((event) => event.type === 'payment' && event.reason === 'rent'),
  ).toHaveLength(1);
  expect(trip.state.phase).toBe('property');
  expect(getLegalActions(trip.state)).toContainEqual({ type: 'buyout', playerId: 'a' });
  const quote = getBuyoutQuote(trip.state)!;
  expect(quote.canBuy).toBe(true);
  const bought = step(trip.state, { type: 'buyout', playerId: 'a' });
  expect(bought.state.properties[1]).toMatchObject({ ownerId: 'a', level: 1 });
  expect(bought.state.players[0]!.cash).toBe(a - config.travelFee - rent - quote.total);
  expect(bought.state.players[1]!.cash).toBe(b + rent + quote.land);
  expect(bought.state.phase).toBe('end');
});

it('allows travel to every other space, including rival islands, but keeps a real destination mandatory', () => {
  const state = travelGame();
  const island = state.config.board.find((tile) => tile.type === 'resort')!;
  state.properties[island.id]!.ownerId = 'b';
  const actions = getLegalActions(state).filter((action) => action.type === 'travel');
  expect(
    actions.map((action) => 'tile' in action && action.tile).sort((a, b) => Number(a) - Number(b)),
  ).toEqual(state.config.board.filter((tile) => tile.id !== 0).map((tile) => tile.id));
  const trip = step(state, { type: 'travel', playerId: 'a', tile: island.id });
  expect(trip.state.phase).toBe('property');
  expect(getBuyoutQuote(trip.state)?.available).toBe(true);
  const rejected = reduceGame(state, { type: 'travel', playerId: 'a', tile: 0 });
  expect(rejected.error).toBeTruthy();
  expect(rejected.state).toBe(state);
});

it('keeps debt and insufficient funds authoritative when travelling aggressively', () => {
  const state = travelGame();
  state.players[0]!.cash = config.travelFee;
  state.properties[2]!.ownerId = 'a';
  const trip = step(state, { type: 'travel', playerId: 'a', tile: 1 });
  expect(trip.state.phase).toBe('debt');
  expect(trip.state.debt?.reason).toBe('rent');
  expect(getLegalActions(trip.state).some((action) => action.type === 'buyout')).toBe(false);
  const poor = travelGame();
  poor.players[0]!.cash = config.travelFee - 1;
  expect(getLegalActions(poor).some((action) => action.type === 'travel')).toBe(false);
});

it('keeps a Squatteur choice before a rival property buyout', () => {
  const state = travelGame();
  state.players[0]!.heldCards = [state.config.cards.find((card) => card.effect === 'squatter')!.id];
  state.deck = state.deck.filter((id) => !state.players[0]!.heldCards!.includes(id));
  const trip = step(state, { type: 'travel', playerId: 'a', tile: 1 });
  expect(trip.state.phase).toBe('rent');
  const paid = step(trip.state, { type: 'pay_rent', playerId: 'a' });
  expect(paid.state.phase).toBe('property');
  expect(getBuyoutQuote(paid.state)?.canBuy).toBe(true);
});
