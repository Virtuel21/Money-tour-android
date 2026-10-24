// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import OnlineLobby from '../src/network/OnlineLobby';
import { setLanguage } from '../src/i18n/language';
import { translate } from '../src/i18n/translate';
import { saveTurnPreferences } from '../src/network/turnSettings';

vi.mock('../src/network/trystero', () => ({ TrysteroTransport: class {} }));
vi.mock('../src/network/crypto', () => ({
  identity: async () => ({ id: 'host-id' }),
  secret: () => 'a'.repeat(32),
}));
vi.mock('../src/network/session', () => ({
  Session: class {
    onChange = (_view: unknown) => {};
    join() {
      this.onChange({
        state: null,
        members: [{ id: 'host-id', name: 'Camille', key: {}, order: 0 }],
        host: 'host-id',
        self: 'host-id',
        connected: ['host-id'],
        busy: false,
        status: 'Salon prêt : invitez vos amis.',
        incidents: [],
        hash: '',
        epoch: 0,
        events: [],
        blocked: false,
      });
    }
    close() {}
  },
}));

let root: Root | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  sessionStorage.clear();
  setLanguage('fr');
  history.replaceState(null, '', '/money-tour/?v=1');
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  setLanguage('fr');
});

async function lobby(
  options: {
    share?: typeof navigator.share;
    canShare?: typeof navigator.canShare;
    writeText?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const share = 'share' in options ? options.share : vi.fn().mockResolvedValue(undefined);
  const canShare = options.canShare;
  const writeText = options.writeText ?? vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText }, share, canShare });
  const element = document.body.appendChild(document.createElement('div'));
  root = createRoot(element);
  await act(() =>
    root!.render(
      createElement(OnlineLobby, {
        open: true,
        autoCreate: true,
        defaults: { name: 'Camille', count: 2, teams: false, minutes: 20 },
        onClose: vi.fn(),
        onSession: vi.fn(),
        onView: vi.fn(),
        onLeave: vi.fn(),
      }),
    ),
  );
  const button = (label: string) =>
    [...element.querySelectorAll('button')].find((button) => button.textContent === label);
  const copy = () => act(() => button(translate('Copier le lien d’invitation'))!.click());
  return { element, button, copy, writeText, share };
}

it('offers native sharing below the URL only after a successful copy, and invokes it in the click', async () => {
  const { element, button, copy, writeText, share } = await lobby();
  expect(button('Partager le lien')).toBeUndefined();
  await copy();
  const input = element.querySelector<HTMLInputElement>('.invite-code input')!;
  const shareButton = button('Partager le lien')!;
  expect(input.nextElementSibling).toBe(shareButton);
  expect(writeText).toHaveBeenCalledWith(input.value);
  expect(new URL(input.value).hash).toBe(`#room=${'a'.repeat(32)}`);
  expect(share).not.toHaveBeenCalled();
  await act(() => {
    shareButton.click();
    // No deferred work may consume the user's transient activation before share().
    expect(share).toHaveBeenCalledExactlyOnceWith({ title: 'Money Tour', url: input.value });
  });
});

it.each(['missing', 'unsupported'])(
  'keeps copying usable when native sharing is %s',
  async (support) => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(false);
    const { element, button, copy, writeText } = await lobby({
      ...(support === 'missing' ? { share: undefined } : { share, canShare }),
    });
    await copy();
    expect(button('Partager le lien')).toBeUndefined();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(element.textContent).toContain('Lien copié ✓');
    expect(share).not.toHaveBeenCalled();
    if (support === 'unsupported')
      expect(canShare).toHaveBeenCalledWith({
        title: 'Money Tour',
        url: element.querySelector<HTMLInputElement>('.invite-code input')!.value,
      });
  },
);

it('does not offer sharing after a failed copy and allows a successful retry', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('Denied')).mockResolvedValue(undefined);
  const { element, button, copy, share } = await lobby({ writeText });
  await copy();
  expect(button('Partager le lien')).toBeUndefined();
  expect(element.textContent).toContain('Copiez le lien affiché ci-dessous.');
  expect(share).not.toHaveBeenCalled();
  await copy();
  expect(button('Partager le lien')).toBeDefined();
  expect(element.textContent).not.toContain('Copiez le lien affiché ci-dessous.');
});

it('treats dismissal as neutral and allows reopening the native sheet', async () => {
  const share = vi.fn().mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'));
  const { element, button, copy } = await lobby({ share });
  await copy();
  await act(() => button('Partager le lien')!.click());
  expect(element.querySelector('.invite-share-error')).toBeNull();
  expect(button('Partager le lien')!.disabled).toBe(false);
  expect(element.textContent).toContain('Lien copié ✓');
  await act(() => button('Partager le lien')!.click());
  expect(share).toHaveBeenCalledTimes(2);
});

it('shows a useful copied-link fallback after a native share failure and clears it on retry', async () => {
  const share = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    .mockResolvedValue(undefined);
  const { element, button, copy } = await lobby({ share });
  await copy();
  await act(() => button('Partager le lien')!.click());
  expect(element.querySelector('.invite-share-error[role="alert"]')?.textContent).toContain(
    'Collez le lien copié dans votre application de messagerie.',
  );
  expect(element.textContent).toContain('Lien copié ✓');
  await act(() => button('Partager le lien')!.click());
  expect(element.querySelector('.invite-share-error')).toBeNull();
});

it('disables the native share button while its sheet is pending', async () => {
  let finish!: () => void;
  const share = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { button, copy } = await lobby({ share });
  await copy();
  await act(() => button('Partager le lien')!.click());
  expect(button('Ouverture du partage…')!.disabled).toBe(true);
  await act(() => button('Ouverture du partage…')!.click());
  expect(share).toHaveBeenCalledTimes(1);
  await act(() => finish());
  expect(button('Partager le lien')!.disabled).toBe(false);
});

it('shares the complete manual TURN invitation without including local credentials', async () => {
  const preferences = {
    url: 'turn:relay.example:3478',
    username: 'qa-user',
    password: 'qa-only-password',
    relayOnly: true,
  };
  saveTurnPreferences(preferences);
  const { element, button, copy, share } = await lobby();
  await copy();
  const url = element.querySelector<HTMLInputElement>('.invite-code input')!.value;
  expect(new URL(url).hash).toBe(`#room=${'a'.repeat(32)}&turn=manual&relay=1`);
  expect(new URL(url).search).toBe('?v=1');
  for (const value of [preferences.url, preferences.username, preferences.password])
    expect(url).not.toContain(value);
  await act(() => button('Partager le lien')!.click());
  expect(share).toHaveBeenCalledWith({ title: 'Money Tour', url });
});

it('translates the native share action and fallback into English', async () => {
  setLanguage('en');
  const share = vi.fn().mockRejectedValue(new Error('Unavailable'));
  const { element, button, copy } = await lobby({ share });
  await copy();
  await act(() => button('Share link')!.click());
  expect(element.querySelector('.invite-share-error')?.textContent).toBe(
    'Unable to open sharing. Paste the copied link into your messaging app.',
  );
});
