import { expect, it, vi } from 'vitest';
const { joinRoom } = vi.hoisted(() => ({
  joinRoom: vi.fn(() => ({
    makeAction: () => ({ onMessage: null, send: vi.fn() }),
    onPeerJoin: null,
    onPeerLeave: null,
    leave: vi.fn(),
  })),
}));
vi.mock('trystero', () => ({ selfId: 'test-peer', joinRoom }));
import { TrysteroTransport } from '../src/network/trystero';

it('passes TURN and mandatory relay to Trystero without removing its default STUN configuration', async () => {
  const turn = [{ urls: 'turn:relay.example:3478', username: 'user', credential: 'temporary' }];
  const transport = new TrysteroTransport(turn, true);
  await transport.join('a'.repeat(32));
  expect(joinRoom).toHaveBeenLastCalledWith(
    expect.objectContaining({
      appId: 'virtuel21-money-tour-v20',
      turnConfig: turn,
      rtcConfig: { iceTransportPolicy: 'relay' },
    }),
    expect.any(String),
    expect.any(Object),
  );
  transport.leave();
});
it('refuses mandatory relay without TURN instead of making an unexpected direct connection', async () => {
  await expect(new TrysteroTransport([], true).join('a'.repeat(32))).rejects.toThrow('Configurez');
});
