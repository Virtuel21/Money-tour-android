import { z } from 'zod';
import type { Session } from './session';

export const PUBLIC_PROTOCOL = 4;
export const PUBLIC_RULES_VERSION = 18;
export const PUBLIC_SEARCH_MS = 8000;
export const PUBLIC_DIRECTORY_URL =
  import.meta.env.VITE_MATCHMAKING_URL ||
  'https://money-tour-matchmaking.frostyshark128.chatgpt.site';

const opaque = z.string().min(1).max(128);
const matchSchema = z.object({
  roomId: opaque,
  hostId: z.string().min(1).max(80),
  code: z.string().regex(/^[a-f0-9]{32}$/),
  phase: z.enum(['waiting', 'playing']),
  seatId: z.string().min(1).max(80),
  reservationId: opaque,
  reservationToken: opaque,
  expiresAt: z.number().finite().positive(),
});
export type PublicMatch = z.infer<typeof matchSchema>;
export type PublicLanguage = 'fr' | 'en';
export interface PublicJoinAuthorization {
  identityId: string;
  reservationId: string;
  reservationToken: string;
  seatId: string;
}
interface HostLease {
  roomId: string;
  hostToken: string;
  hostId: string;
}

function abortError(): DOMException {
  return new DOMException('Recherche annulée.', 'AbortError');
}
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const finish = () => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(abortError());
    };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export class DirectoryError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'DirectoryError';
  }
}

/** The directory allocates seats; it never receives game state or private player keys. */
export class PublicMatchmaker {
  readonly origin: string;
  constructor(
    origin = PUBLIC_DIRECTORY_URL,
    private readonly requestFetch: typeof fetch = (...args) => fetch(...args),
    private readonly now = () => Date.now(),
  ) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('L’annuaire public doit utiliser HTTPS.');
    this.origin = origin.replace(/\/$/, '');
  }

  async request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      token?: string;
      signal?: AbortSignal;
      keepalive?: boolean;
    } = {},
  ): Promise<unknown> {
    const timeout = new AbortController();
    const cancel = () => timeout.abort();
    if (options.signal?.aborted) throw abortError();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 6500);
    try {
      const response = await this.requestFetch(this.origin + path, {
        method: options.method ?? 'POST',
        credentials: 'omit',
        cache: 'no-store',
        signal: timeout.signal,
        keepalive: options.keepalive ?? false,
        headers: {
          'Content-Type': 'application/json',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      if (!response.ok)
        throw new DirectoryError(
          response.status === 429
            ? 'Trop de recherches rapprochées. Patientez quelques instants.'
            : 'L’annuaire des parties ne répond pas. Réessayez dans un instant.',
          response.status,
        );
      if (response.status === 204) return null;
      return await response.json();
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      if (error instanceof DirectoryError) throw error;
      throw new DirectoryError('L’annuaire des parties ne répond pas. Réessayez dans un instant.');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }

  async find({
    language,
    signal,
    onStatus,
    excludeRoomIds = [],
  }: {
    language: PublicLanguage;
    signal?: AbortSignal;
    onStatus?: (message: string) => void;
    excludeRoomIds?: string[];
  }): Promise<PublicMatch | null> {
    const started = this.now();
    do {
      if (signal?.aborted) throw abortError();
      const relaxed = this.now() - started >= 4000;
      onStatus?.(
        relaxed ? 'Recherche élargie à d’autres voyageurs…' : 'Recherche d’une partie disponible…',
      );
      const data = z.object({ match: matchSchema.nullable() }).parse(
        await this.request('/v1/match', {
          signal,
          body: {
            protocol: PUBLIC_PROTOCOL,
            rulesVersion: PUBLIC_RULES_VERSION,
            language,
            region: 'global',
            relaxed,
            excludeRoomIds: excludeRoomIds.slice(0, 8),
          },
        }),
      );
      if (data.match && data.match.expiresAt > this.now()) return data.match;
      const remaining = PUBLIC_SEARCH_MS - (this.now() - started);
      if (remaining <= 0) return null;
      await pause(Math.min(1500, remaining), signal);
    } while (this.now() - started <= PUBLIC_SEARCH_MS);
    return null;
  }

  async release(match: PublicMatch): Promise<void> {
    await this.request(`/v1/reservations/${encodeURIComponent(match.reservationId)}`, {
      method: 'DELETE',
      token: match.reservationToken,
      keepalive: true,
    }).catch(() => {});
  }

  watch(session: Session, options: { code: string; language: PublicLanguage }): PublicRoomLease {
    return new PublicRoomLease(this, session, options);
  }
}

/** One watcher per public session also follows host migration and background/foreground changes. */
export class PublicRoomLease {
  private lease: HostLease | null = null;
  private closed = false;
  private publishing: Promise<void> | null = null;
  private lastSent = 0;
  private retryAt = 0;
  private fingerprint = '';
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly initial: Promise<void>;
  private readonly abort = new AbortController();
  private readonly storageKey: string;

  constructor(
    private readonly directory: PublicMatchmaker,
    private readonly session: Session,
    private readonly options: { code: string; language: PublicLanguage },
  ) {
    this.storageKey = `money-tour.public-lease.${options.code}`;
    try {
      const cached = z
        .object({ roomId: opaque, hostToken: opaque, hostId: opaque })
        .safeParse(JSON.parse(localStorage.getItem(this.storageKey) ?? 'null'));
      if (cached.success && cached.data.hostId === session.user.id) this.lease = cached.data;
    } catch {
      /* Storage is optional; a new host can recover the lease after expiry. */
    }
    this.initial = this.tick(true);
    // A resumed guest might not have synchronized yet. Only an authenticated host publishes.
    this.timer = setInterval(() => void this.tick().catch(() => {}), 1000);
    document.addEventListener('visibilitychange', this.foreground);
    window.addEventListener('pagehide', this.pagehide);
    window.addEventListener('pageshow', this.foreground);
    // Mark handled even when the caller will await ready() after setting up callbacks.
    void this.initial.catch(() => {});
  }

  ready(): Promise<void> {
    return this.initial;
  }

  private readonly foreground = () => {
    if (document.visibilityState === 'visible') void this.tick(true).catch(() => {});
  };
  private readonly pagehide = (event: PageTransitionEvent) => {
    // A page restored from the back/forward cache keeps this same live watcher.
    if (!event.persisted) this.close();
  };

  private async tick(force = false): Promise<void> {
    if (
      this.closed ||
      this.publishing ||
      !this.session.isHost ||
      (!force && Date.now() < this.retryAt)
    )
      return;
    const view = this.session.view;
    const state = view.state;
    const seats = view.blocked || state?.winner ? [] : this.session.availablePublicSeats();
    const hostId = view.selfIdentity ?? this.session.user.id;
    const payload = {
      code: this.options.code,
      protocol: PUBLIC_PROTOCOL,
      rulesVersion: PUBLIC_RULES_VERSION,
      language: this.options.language,
      region: 'global',
      phase: state ? 'playing' : 'waiting',
      humans: view.members.filter((member) => view.connected.includes(member.id)).length,
      capacity: 4,
      durationMs: state?.durationMs ?? 20 * 60000,
      elapsedMs: state?.elapsedMs ?? 0,
      claimableSeatIds: seats,
      memberIds: view.members.map((member) => member.id),
      hostId,
    };
    const key = JSON.stringify({ ...payload, elapsedMs: undefined });
    if (!force && Date.now() - this.lastSent < (key === this.fingerprint ? 10000 : 1000)) return;
    this.publishing = (async () => {
      if (!this.lease) {
        const data = z
          .object({ roomId: opaque, hostToken: opaque })
          .parse(
            await this.directory.request('/v1/rooms', { body: payload, signal: this.abort.signal }),
          );
        this.lease = { ...data, hostId };
        if (this.closed) {
          await this.remove();
          return;
        }
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(this.lease));
        } catch {
          /* Optional. */
        }
      } else {
        try {
          await this.directory.request(`/v1/rooms/${encodeURIComponent(this.lease.roomId)}`, {
            method: 'PUT',
            body: payload,
            token: this.lease.hostToken,
            signal: this.abort.signal,
          });
        } catch (error) {
          if (error instanceof DirectoryError && [401, 403, 404, 409].includes(error.status)) {
            this.lease = null;
            try {
              localStorage.removeItem(this.storageKey);
            } catch {
              /* Optional. */
            }
          }
          throw error;
        }
      }
      this.lastSent = Date.now();
      this.fingerprint = key;
    })();
    try {
      await this.publishing;
      this.retryAt = 0;
    } catch (error) {
      // The old host's capability remains valid until its presence lease expires.
      // Back off while a replacement host waits instead of exhausting the create limit.
      this.retryAt = Date.now() + 10000;
      throw error;
    } finally {
      this.publishing = null;
    }
  }

  async authorizePublicJoin(request: PublicJoinAuthorization): Promise<boolean> {
    if (this.closed || !this.lease || !this.session.isHost) return false;
    try {
      const data = z.object({ accepted: z.boolean() }).parse(
        await this.directory.request(
          `/v1/reservations/${encodeURIComponent(request.reservationId)}/claim`,
          {
            token: this.lease.hostToken,
            signal: this.abort.signal,
            body: {
              reservationToken: request.reservationToken,
              identityId: request.identityId,
              seatId: request.seatId,
            },
          },
        ),
      );
      return data.accepted;
    } catch {
      return false;
    }
  }

  private async remove(): Promise<void> {
    const lease = this.lease;
    this.lease = null;
    if (!lease) return;
    await this.directory
      .request(`/v1/rooms/${encodeURIComponent(lease.roomId)}`, {
        method: 'DELETE',
        token: lease.hostToken,
        keepalive: true,
      })
      .catch(() => {});
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* Optional. */
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.foreground);
    window.removeEventListener('pagehide', this.pagehide);
    window.removeEventListener('pageshow', this.foreground);
    void this.remove();
  }
}
