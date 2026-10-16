import { expect, it } from 'vitest';
import { MemoryNetwork, MemoryTransport } from '../src/network/transport';
import { Session } from '../src/network/session';
import { identity } from '../src/network/crypto';

it('does not spend the human decision clock while presenting an online purchase', async () => {
  let now = 100000;
  const network = new MemoryNetwork();
  const session = new Session(
    new MemoryTransport('clock', network),
    await identity(),
    'Host',
    true,
    () => now,
  );
  try {
    await session.join('clock-room', undefined, false);
    await session.start(2, false, 1200000);
    await session.idle();
    const state = session.state!;
    // Exercise the host's purchase regardless of which seat won the opening draw.
    state.currentPlayer = 0;
    state.phase = 'property';
    state.players[0]!.position = 5;
    state.properties[5]!.ownerId = null;
    if (state.adventure) state.adventure.twist = 'inheritance';
    await session.intent({ type: 'buy', playerId: session.user.id });
    await session.idle();
    const elapsed = session.state!.decisionElapsedMs;
    now += 1000;
    await session.pulse();
    expect(session.state!.decisionElapsedMs).toBe(elapsed);
    now += 2000;
    await session.pulse();
    expect(session.state!.decisionElapsedMs).toBe(elapsed + 1000);
    expect(session.state!.players[0]!.bot).toBe(false);
  } finally {
    session.close();
  }
});
it('reports a missing host once and keeps the connection available for late arrivals', async () => {
  let now = 100000;
  const session = new Session(
    new MemoryTransport('waiting', new MemoryNetwork()),
    await identity(),
    'Guest',
    false,
    () => now,
  );
  try {
    await session.join('missing-host', undefined, false);
    now += 26000;
    for (let i = 0; i < 10; i++) {
      await session.pulse();
      now += 250;
    }
    expect(session.incidents).toHaveLength(1);
    expect(session.status).toContain('4G/5G');
    expect(session.blocked).toBe(false);
  } finally {
    session.close();
  }
});
