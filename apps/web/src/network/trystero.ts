import { joinRoom, selfId, type Room } from 'trystero';
import { hash } from './crypto';
import type { Transport } from './transport';

export class TrysteroTransport implements Transport {
  readonly peerId = selfId;
  onMessage: Transport['onMessage'] = () => {};
  onPeerJoin: Transport['onPeerJoin'] = () => {};
  onPeerLeave: Transport['onPeerLeave'] = () => {};
  onError: Transport['onError'] = () => {};
  private room: Room | null = null;
  private dispatch: ((message: unknown, peer?: string) => void) | null = null;
  constructor(
    private turn: RTCIceServer[] = [],
    private relayOnly = false,
  ) {}
  async join(code: string): Promise<void> {
    if (this.relayOnly && !this.turn.length)
      throw new Error('Configurez un serveur TURN avant d’activer le relais obligatoire.');
    const roomId = await hash({ domain: 'money-tour-room-v2', code });
    const password = await hash({ domain: 'money-tour-password-v2', code });
    this.room = joinRoom(
      {
        // Isolate cached versions with different shared presentation budgets.
        // Every peer in a room must use the same card reading schedule.
        appId: 'virtuel21-money-tour-v22',
        password,
        ...(this.turn.length ? { turnConfig: this.turn } : {}),
        ...(this.relayOnly ? { rtcConfig: { iceTransportPolicy: 'relay' as const } } : {}),
      },
      roomId,
      {
        onJoinError: () =>
          this.onError(
            'Connexion directe impossible. Essayez un autre réseau ou renseignez un serveur TURN dans les options avancées.',
          ),
      },
    );
    const channel = this.room.makeAction<string>('game-v1');
    channel.onMessage = (data, { peerId }) => {
      try {
        if (data.length <= 8_000_000) this.onMessage(JSON.parse(data), peerId);
      } catch {
        /* Ignore malformed packets. */
      }
    };
    this.dispatch = (message, peer) => {
      void channel
        .send(JSON.stringify(message), peer ? { target: peer } : undefined)
        .catch(() => this.onError('Envoi interrompu ; resynchronisation en cours.'));
    };
    this.room.onPeerJoin = (peer) => this.onPeerJoin(peer);
    this.room.onPeerLeave = (peer) => this.onPeerLeave(peer);
  }
  send(message: unknown, peer?: string): void {
    this.dispatch?.(message, peer);
  }
  leave(): void {
    void this.room?.leave();
    this.room = null;
    this.dispatch = null;
  }
}
