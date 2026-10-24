import { afterEach, expect, it, vi } from 'vitest';
import { invitationCode } from '../src/network/invitation';
import { loadTurnServers } from '../src/network/ice';
afterEach(() => vi.unstubAllGlobals());
it('accepts a shared link, fragment or formatted code without accepting incomplete invitations', () => {
  const code = 'abcdef01'.repeat(4);
  expect(invitationCode(`https://example.test/money-tour/#room=${code}`)).toBe(code);
  expect(invitationCode(`#room=${code.toUpperCase()}`)).toBe(code);
  expect(invitationCode(`moneytour://room/${code}`)).toBe(code);
  expect(invitationCode(`moneytour://other/${code}`)).toBeNull();
  expect(invitationCode('ABCDEF01 ABCDEF01-ABCDEF01 ABCDEF01')).toBe(code);
  expect(invitationCode('#room=broken')).toBeNull();
  expect(invitationCode('')).toBeNull();
});
it('loads temporary TURN credentials without sending room or browser credentials', async () => {
  const servers = [
    {
      urls: ['turn:relay.example:3478', 'turns:relay.example:443?transport=tcp'],
      username: 'expiring-user',
      credential: 'temporary',
    },
  ];
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ iceServers: servers })));
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  expect(await loadTurnServers('https://relay.example/credentials', signal)).toEqual(servers);
  expect(fetcher).toHaveBeenCalledWith('https://relay.example/credentials', {
    signal,
    cache: 'no-store',
    credentials: 'omit',
  });
});
it.each([{}, { iceServers: [] }, { iceServers: [{ urls: 'https://example.test' }] }])(
  'rejects malformed relay configuration %j',
  async (data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    await expect(loadTurnServers('/turn', new AbortController().signal)).rejects.toThrow(
      'invalide',
    );
  },
);
