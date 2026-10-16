import { config, createGame, createRng, reduceGame } from '@money-tour/engine';
import type { LocalSave } from './local';

/** Deterministic UI acceptance scenes, compiled out of production by Vite. */
export function previewScenario(): LocalSave | null {
  if (!import.meta.env.DEV) return null;
  const name = new URLSearchParams(location.search).get('scenario');
  if (
    !name ||
    ![
      'architecture',
      'results',
      'auction',
      'quest',
      'travel',
      'travel-double',
      'festival-lagoon',
      'utility-labels',
      'build',
      'card',
      'crowded',
      'showcase',
      'menu-review',
      'rent',
      'attack',
      'purchase',
      'hotel-purchase',
      'resort-purchase',
      'mondial',
      'tax',
      'celebration',
      'casino',
      'slots',
      'insurance',
      'insured-properties',
      'squatter',
      'fraud',
      'expropriate',
      'roaches',
      'debt',
      'duel',
      'alliance',
      'crisis',
      'earthquake',
      'island',
      'rivalry',
      'buyout',
      'resort-buyout',
      'hotel-buyout',
      'resort-festival',
      'resort-insurance',
      'taunt-out-of-turn',
    ].includes(name)
  )
    return null;
  const state = createGame({
    config: { ...config, shuffleStreets: false },
    players: [
      { id: 'p1', name: 'Léa' },
      { id: 'p2', name: 'Max' },
      { id: 'p3', name: 'Lou' },
      { id: 'p4', name: 'Noa' },
    ],
    seed: 'visual-review',
  });
  if (name === 'architecture' || name === 'results') {
    const cities = state.config.board.filter((tile) => tile.type === 'city');
    cities.forEach((tile, index) => {
      state.properties[tile.id] = {
        ownerId: `p${(index % 4) + 1}`,
        level: index % 2 ? 4 : 2,
        championships: 0,
      };
    });
    state.players.forEach((p, index) => {
      p.laps = 2;
      p.position = [1, 13, 25, 29][index]!;
    });
    state.players[0]!.insurance = { tile: 1 };
    if (name === 'results') {
      const result = reduceGame(state, { type: 'tick', elapsedMs: state.durationMs });
      return { version: 1, seed: 'visual-review', state: result.state };
    }
    return { version: 1, seed: 'visual-review', state };
  }
  if (name === 'auction') {
    state.phase = 'auction';
    state.auction = {
      id: 'preview-auction',
      tile: 5,
      kind: 'tender',
      resume: 'roll',
      participants: state.players.map((p) => p.id),
      stage: 'commit',
      commitments: {},
      bids: {},
      passed: [],
    };
    return { version: 1, seed: 'visual-review', state };
  }
  const player = state.players[0]!;
  player.position = name === 'travel' ? 24 : name === 'build' ? 1 : 4;
  state.phase = name === 'travel' ? 'travel' : name === 'build' ? 'property' : 'roll';
  player.travelPending = name === 'travel';
  player.laps = 1;
  if (name === 'utility-labels') {
    state.players.forEach((p, i) => {
      p.position = [8, 8, 11, 24][i]!;
    });
  }
  if (name === 'festival-lagoon') {
    player.position = state.config.board.find((tile) => tile.type === 'championship')!.id;
    state.players[1]!.position = player.position;
    state.players[2]!.position = 5;
    state.players[3]!.position = 21;
    for (const id of [2, 10, 18, 26]) {
      state.properties[id] = { ownerId: 'p1', level: 2, championships: 1, championshipTurns: 4 };
    }
  }
  for (const id of [1, 2]) state.properties[id]!.ownerId = 'p1';
  for (const id of [9, 10]) state.properties[id]!.ownerId = 'p2';
  state.properties[9]!.level = 2;
  state.properties[10]!.level = 4;
  if (name === 'insured-properties') {
    state.players.forEach((p, i) => {
      const id = [1, 10, 20, 26][i]!;
      p.insurance = { tile: id };
      p.position = id;
      state.properties[id] = { ownerId: p.id, level: [3, 4, 0, 2][i]!, championships: 0 };
    });
    state.properties[1]!.roachTurns = 2;
    state.properties[10]!.championships = 1;
    state.properties[10]!.championshipTurns = 4;
  }
  if (name === 'travel-double') {
    player.position = 20;
    const result = reduceGame(state, { type: 'roll', playerId: player.id }, () => 0.2);
    return { version: 1, seed: 'visual-review', state: result.state };
  }
  if (name === 'buyout') {
    player.position = 5;
    state.phase = 'property';
    state.properties[5] = { ownerId: 'p2', level: 0, championships: 0 };
  }
  if (name === 'taunt-out-of-turn') {
    state.currentPlayer = 1;
    state.players.forEach((p, i) => {
      p.bot = i !== 0;
      p.position = [5, 0, 21, 29][i]!;
    });
  }
  if (name === 'rivalry') {
    state.phase = 'roll';
    player.position = 5;
    for (const id of [1, 2, 3, 5, 6, 9])
      state.properties[id] = { ownerId: 'p1', level: 0, championships: 0 };
    state.properties[5] = { ownerId: 'p1', level: 4, championships: 0, roachTurns: 2 };
    state.players.forEach((p, i) => {
      p.position = [5, 14, 21, 29][i]!;
    });
  }
  if (name === 'earthquake') {
    state.config = {
      ...state.config,
      earthquakeChance: 100,
      earthquakeMinRound: 0,
      crisisChance: 0,
    };
    state.currentPlayer = 3;
    state.phase = 'end';
  }
  if (name === 'island') {
    state.phase = 'island';
    player.islandTurns = 1;
    player.position = state.config.board.find((t) => t.type === 'island')!.id;
    state.players[1]!.bot = true;
  }
  if (name === 'celebration') {
    state.properties[1] = { ownerId: 'p1', level: 2, championships: 1, championshipTurns: 4 };
  }
  if (name === 'showcase') {
    player.heldCards = ['squatter', 'fraud'].map(
      (effect) => state.config.cards.find((c) => c.effect === effect)!.id,
    );
    player.insurance = { tile: 1 };
    state.players[1]!.fraudLiability = 400;
    for (const tile of state.config.board.filter((t) => t.type === 'resort'))
      state.properties[tile.id]!.ownerId = 'p3';
    state.players.forEach((p, i) => {
      p.position = [4, 13, 19, 25][i]!;
    });
    [
      [1, 2],
      [9, 10],
      [17, 18],
      [25, 26],
    ].forEach((pair, i) => {
      pair.forEach((id, j) => {
        state.properties[id] = {
          ownerId: state.players[i]!.id,
          level: j ? 4 : (i % 3) + 1,
          championships: 0,
        };
      });
    });
  }
  if (name === 'crowded') {
    state.players.forEach((p) => {
      p.position = 1;
    });
    state.properties[1]!.level = 3;
    state.properties[2]!.level = 4;
    state.phase = 'property';
  }
  if (name === 'resort-purchase') {
    player.position = 4;
    state.phase = 'property';
  }
  if (name === 'purchase' || name === 'hotel-purchase') {
    player.position = 5;
    state.phase = 'property';
    if (name === 'hotel-purchase') player.laps = config.hotelUnlockLaps ?? 1;
  }
  if (name === 'mondial') {
    player.position = 16;
    state.phase = 'championship';
  }
  if (name === 'rent') {
    state.properties[5] = { ownerId: 'p2', level: 2, championships: 0 };
  }
  if (name === 'card' || name === 'attack' || name === 'rent' || name === 'tax') {
    const rolled = reduceGame(
      state,
      { type: 'roll', playerId: 'p1' },
      createRng('visual-review:0'),
    );
    const dice = rolled.events.find((event) => event.type === 'dice')!.dice!;
    const target = name === 'rent' ? 5 : name === 'tax' ? 31 : 15;
    if (name === 'attack') state.deck = ['chance-15'];
    player.position = (target - dice.reduce((sum, value) => sum + value, 0) + 32) % 32;
  }

  const hold = (id: string) => {
    state.deck = state.deck.filter((c) => c !== id);
    player.heldCards = [...(player.heldCards ?? []), id];
  };
  if (name === 'casino' || name === 'slots') {
    player.position = 7;
    state.phase = 'casino';
    state.casino = { tile: 7, game: name === 'slots' ? 'slots' : 'roulette', chance: 50 };
    state.casinoVisits = { 7: 25 };
  }
  if (name === 'insurance') {
    player.position = 11;
    player.insurance = { tile: null };
    state.phase = 'end';
  }
  if (name === 'fraud') {
    hold('chance-22');
    player.position = 5;
    state.phase = 'property';
  }
  if (name === 'squatter') {
    hold('chance-19');
    player.position = 9;
    state.pendingRent = { tile: 9, amount: 80, creditorId: 'p2' };
    state.phase = 'rent';
  }
  if (name === 'expropriate' || name === 'roaches') {
    const id = name === 'roaches' ? 'chance-21' : 'chance-20';
    state.deck = state.deck.filter((c) => c !== id);
    state.discard.push(id);
    state.pendingAttack = id;
    state.phase = 'attack';
    state.players[1]!.insurance = { tile: 10 };
  }
  if (name === 'debt') {
    player.cash = 5000;
    state.phase = 'debt';
    state.debt = {
      playerId: 'p1',
      creditorId: 'p2',
      amount: 100,
      reason: 'rent',
      continuation: 'property',
    };
  }
  if (name === 'duel') {
    state.phase = 'duel';
    state.duel = {
      id: 'visual-duel',
      challengerId: 'p1',
      amount: 0,
      stage: 'offer',
      commitments: {},
      reveals: {},
      escrow: false,
    };
  }
  if (['resort-buyout', 'hotel-buyout', 'resort-festival', 'resort-insurance'].includes(name)) {
    const tile = state.config.board.find(
      (t) => t.type === (name === 'hotel-buyout' ? 'city' : 'resort'),
    )!;
    player.position = tile.id;
    state.phase =
      name === 'resort-festival'
        ? 'championship'
        : name === 'resort-insurance'
          ? 'end'
          : 'property';
    player.cash = 5000;
    state.properties[tile.id] = {
      ownerId: name.endsWith('buyout') ? 'p2' : 'p1',
      level: name === 'hotel-buyout' ? 4 : 0,
      championships: 0,
    };
    if (name === 'resort-insurance') player.insurance = { tile: null };
  }
  if (name === 'alliance') state.phase = 'alliance';
  if (name === 'crisis') state.crisis = { remaining: state.players.map((p) => p.id) };
  if (name === 'menu-review') {
    const cities = state.config.board.filter((tile) => tile.type === 'city');
    const names = [
      'Alexandre de la Mer',
      'Maximilien du Rivage',
      'Lou à l’île lointaine',
      'Noa le Navigateur',
    ];
    state.players.forEach((p, index) => {
      p.name = names[index]!;
      p.laps = 3;
    });
    state.turn = 8;
    cities.forEach((tile, index) => {
      state.properties[tile.id] = {
        ownerId: index % 3 ? 'p1' : 'p2',
        level: index % 5,
        championships: 0,
      };
    });
    for (const effect of ['fraud', 'squatter']) {
      const card = state.config.cards.find((item) => item.effect === effect);
      if (card) hold(card.id);
    }
    return {
      version: 1,
      seed: 'visual-review',
      state,
      history: Array.from(
        { length: 80 },
        (_, index) =>
          `Tour ${80 - index} · ${names[index % names.length]} : ${cities[index % cities.length]!.name}, construction et règlement du loyer.`,
      ),
    };
  }
  return { version: 1, seed: 'visual-review', state };
}
