// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import OnlineLobby from '../src/network/OnlineLobby';
import type { SessionView } from '../src/network/session';
import { loadTurnPreferences, saveTurnPreferences } from '../src/network/turnSettings';
import { loadOnlineResume } from '../src/network/storage';
import { newLocal } from '../src/game/local';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const mocked = vi.hoisted(() => ({
  joins: vi.fn(),
  closes: vi.fn(),
  instances: [] as {
    onChange: (view: SessionView) => void;
    onPersist: (value: unknown) => void;
  }[],
  transports: vi.fn(),
}));
vi.mock('../src/network/trystero', () => ({
  TrysteroTransport: class {
    constructor(servers: RTCIceServer[], relayOnly: boolean) {
      mocked.transports(servers, relayOnly);
    }
  },
}));
vi.mock('../src/network/crypto', () => ({
  identity: async () => ({ id: 'guest-id' }),
  secret: () => 'f'.repeat(32),
}));
vi.mock('../src/network/session', () => ({
  Session: class {
    onChange = (_view: SessionView) => {};
    onPersist = (_value: unknown) => {};
    constructor(
      _transport: unknown,
      _user: unknown,
      public name: string,
      public creator: boolean,
    ) {
      mocked.instances.push(this);
    }
    async join(code: string) {
      await mocked.joins(code, this.name, this.creator);
    }
    close() {
      mocked.closes();
    }
  },
}));
let root: Root;
afterEach(async () => {
  await act(() => root?.unmount());
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  mocked.joins.mockClear();
  mocked.closes.mockClear();
  mocked.instances.length = 0;
  mocked.transports.mockClear();
});

const preferences = {
  url: 'turn:relay.example:3478',
  username: 'qa-user',
  password: 'qa-only-password',
  relayOnly: true,
};
async function mountTurnLobby(props: Partial<Parameters<typeof OnlineLobby>[0]> = {}) {
  const element = document.body.appendChild(document.createElement('div'));
  root = createRoot(element);
  await act(() =>
    root.render(
      createElement(OnlineLobby, {
        open: true,
        setupTurn: true,
        defaults: { name: 'Camille', count: 2, teams: false, minutes: 20 },
        onClose: vi.fn(),
        onSession: vi.fn(),
        onView: vi.fn(),
        onLeave: vi.fn(),
        ...props,
      }),
    ),
  );
  return element;
}
async function inputValue(input: HTMLInputElement, value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('automatically saves edits before connecting, restores on reopening, and forgets them', async () => {
  history.replaceState(null, '', '/');
  let element = await mountTurnLobby();
  const inputs = element.querySelectorAll<HTMLInputElement>('.turn-panel input');
  await inputValue(inputs[0]!, preferences.url);
  await inputValue(inputs[1]!, preferences.username);
  await inputValue(inputs[2]!, preferences.password);
  expect(loadTurnPreferences()).toEqual(preferences);
  await act(() => inputs[3]!.click());
  expect(loadTurnPreferences()?.relayOnly).toBe(false);
  await act(() => root.unmount());
  element.remove();
  element = await mountTurnLobby();
  const restored = element.querySelectorAll<HTMLInputElement>('.turn-panel input');
  expect([...restored].slice(0, 3).map((input) => input.value)).toEqual([
    preferences.url,
    preferences.username,
    preferences.password,
  ]);
  expect(restored[3]!.checked).toBe(false);
  expect(restored[2]!.type).toBe('password');
  await act(() =>
    [...element.querySelectorAll('button')]
      .find((button) => button.textContent === 'Effacer les paramètres TURN enregistrés')!
      .click(),
  );
  expect(loadTurnPreferences()).toBeNull();
  expect([...restored].slice(0, 3).every((input) => input.value === '')).toBe(true);
  expect(element.textContent).toContain('Paramètres TURN effacés');
});

it('uses saved credentials during automatic room recovery', async () => {
  const code = 'c'.repeat(32);
  history.replaceState(null, '', '/');
  saveTurnPreferences(preferences);
  await mountTurnLobby({
    setupTurn: false,
    resume: { code, name: 'Camille', creator: false, at: Date.now() },
  });
  expect(mocked.joins).toHaveBeenCalledWith(code, 'Camille', false);
  expect(mocked.transports).toHaveBeenLastCalledWith(
    [{ urls: [preferences.url], username: preferences.username, credential: preferences.password }],
    true,
  );
});

it('honors the invitation relay mode without replacing the saved preference', async () => {
  const code = 'd'.repeat(32);
  history.replaceState(null, '', `/#room=${code}&turn=manual&relay=1`);
  saveTurnPreferences({ ...preferences, relayOnly: false });
  const element = await mountTurnLobby({ setupTurn: false });
  expect(element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  await act(() =>
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(mocked.transports).toHaveBeenLastCalledWith(expect.any(Array), true);
  expect(loadTurnPreferences()?.relayOnly).toBe(false);
});

it('keeps entered settings usable and reports when browser storage is full', async () => {
  history.replaceState(null, '', '/');
  const element = await mountTurnLobby();
  const storage = localStorage;
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    getItem: storage.getItem.bind(storage),
    setItem: () => {
      throw new Error('Storage full');
    },
  } as unknown as Storage);
  const input = element.querySelector<HTMLInputElement>('.turn-panel input')!;
  await inputValue(input, preferences.url);
  expect(input.value).toBe(preferences.url);
  expect(element.textContent).toContain('Le navigateur ne permet pas d’enregistrer');
});
it('can reconnect after opening connection help while a join is still pending', async () => {
  history.replaceState(null, '', `/#room=${'b'.repeat(32)}`);
  const element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  let finishJoin!: () => void;
  mocked.joins.mockImplementationOnce(() => new Promise<void>((resolve) => (finishJoin = resolve)));
  const onSession = vi.fn();
  await act(() =>
    root.render(
      createElement(OnlineLobby, {
        open: true,
        defaults: { name: 'Camille', count: 2, teams: false, minutes: 20 },
        onClose: vi.fn(),
        onView: vi.fn(),
        onLeave: vi.fn(),
        onSession,
      }),
    ),
  );
  const submit = () =>
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await act(submit);
  await act(() =>
    mocked.instances[0]!.onChange({
      state: null,
      members: [],
      host: '',
      self: 'guest-id',
      connected: [],
      busy: false,
      status: 'Recherche de l’hôte…',
      incidents: [],
      hash: '',
      epoch: 0,
      events: [],
      blocked: false,
    }),
  );
  await act(() =>
    [...element.querySelectorAll('button')]
      .find((button) => button.textContent === 'Aide à la connexion')!
      .click(),
  );
  expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  await act(() => finishJoin());
  expect(onSession).not.toHaveBeenCalled();
  await act(submit);
  expect(mocked.joins).toHaveBeenCalledTimes(2);
  expect(onSession).toHaveBeenCalledTimes(1);
});
it('asks an invited player only for their name, joins the invitation, and can retry the same room', async () => {
  const code = 'a'.repeat(32);
  history.replaceState(null, '', `/#room=${code}`);
  const element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(() =>
    root.render(
      createElement(OnlineLobby, {
        open: true,
        onClose: vi.fn(),
        onView: vi.fn(),
        onLeave: vi.fn(),
        onSession: vi.fn(),
      }),
    ),
  );
  expect(element.querySelectorAll('input')).toHaveLength(1);
  expect(element.textContent).not.toContain('Créer un salon');
  const input = element.querySelector('input')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'Camille',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(() =>
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(mocked.joins).toHaveBeenCalledWith(code, 'Camille', false);
  const waiting = {
    state: null,
    members: [],
    host: '',
    self: 'guest-id',
    connected: [],
    busy: false,
    status: 'Recherche de l’hôte…',
    incidents: [],
    hash: '',
    epoch: 0,
    events: [],
    blocked: false,
  };
  await act(() => mocked.instances[0]!.onChange(waiting));
  expect(element.textContent).not.toContain('CODE D’INVITATION');
  await act(() =>
    [...element.querySelectorAll('button')]
      .find((b) => b.textContent === 'Réessayer la connexion')!
      .click(),
  );
  expect(mocked.closes).toHaveBeenCalledTimes(1);
  expect(mocked.joins).toHaveBeenCalledTimes(2);
  await act(() =>
    mocked.instances[1]!.onChange({
      ...waiting,
      host: 'host-id',
      members: [{ id: 'guest-id', name: 'Camille', key: {}, order: 1 }],
    }),
  );
  expect(element.textContent).toContain('Camille');
  expect(element.textContent).toContain('INVITEZ VOS AMIS');
  expect(element.textContent).not.toContain('Copier le code du salon');
  expect(element.querySelector('.invite-code code')).toBeNull();
});

it('accepts an invitation link instead of exposing a room code field', async () => {
  const code = 'e'.repeat(32);
  history.replaceState(null, '', '/');
  const element = await mountTurnLobby({ setupTurn: false });
  expect(element.textContent).not.toContain('Code du salon');
  const input = element.querySelector<HTMLInputElement>(
    'input[placeholder="Collez le lien envoyé par votre ami"]',
  )!;
  await inputValue(input, `https://example.test/money-tour/#room=${code}`);
  await act(() =>
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(mocked.joins).toHaveBeenCalledWith(code, 'Camille', false);
});

it.each(['close', 'escape'])(
  'cancels room creation with %s and removes its recovery and URL',
  async (action) => {
    history.replaceState(null, '', '/money-tour/?lang=fr');
    const onLeave = vi.fn();
    const onClose = vi.fn();
    const element = await mountTurnLobby({
      setupTurn: false,
      autoCreate: true,
      onLeave,
      onClose,
    });
    const room = 'f'.repeat(32);
    expect(loadOnlineResume()?.code).toBe(room);
    expect(location.hash).toBe(`#room=${room}`);
    await act(() =>
      mocked.instances[0]!.onChange({
        state: null,
        members: [{ id: 'guest-id', name: 'Camille', key: {}, order: 0 }],
        host: 'guest-id',
        self: 'guest-id',
        connected: ['guest-id'],
        busy: false,
        status: 'Salon prêt : invitez vos amis.',
        incidents: [],
        hash: '',
        epoch: 0,
        events: [],
        blocked: false,
      }),
    );
    await act(() => {
      if (action === 'escape')
        element.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
      else element.querySelector<HTMLButtonElement>('[aria-label="Fermer le salon"]')!.click();
    });
    expect(mocked.closes).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(location.pathname + location.search + location.hash).toBe('/money-tour/?lang=fr');
    expect(loadOnlineResume()).toBeNull();
    // A completed task from the cancelled session must not restore its resume entry.
    await act(() => mocked.instances[0]!.onPersist({ frames: [] }));
    expect(loadOnlineResume()).toBeNull();
  },
);

it('invalidates an unfinished join when creation is cancelled', async () => {
  history.replaceState(null, '', '/');
  let finishJoin!: () => void;
  mocked.joins.mockImplementationOnce(() => new Promise<void>((resolve) => (finishJoin = resolve)));
  const onSession = vi.fn();
  const onView = vi.fn();
  const onLeave = vi.fn();
  const element = await mountTurnLobby({
    setupTurn: false,
    autoCreate: true,
    onSession,
    onView,
    onLeave,
  });
  expect(mocked.joins).toHaveBeenCalledTimes(1);
  await act(() =>
    element.querySelector<HTMLButtonElement>('[aria-label="Fermer le salon"]')!.click(),
  );
  await act(() => finishJoin());
  expect(onSession).not.toHaveBeenCalled();
  expect(onView).not.toHaveBeenCalled();
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(loadOnlineResume()).toBeNull();
  expect(location.hash).toBe('');
});

it('dismisses a stale invitation after reload without leaving its room in the URL', async () => {
  history.replaceState(null, '', `/#room=${'e'.repeat(32)}&turn=manual&relay=1`);
  const onLeave = vi.fn();
  const element = await mountTurnLobby({ setupTurn: false, onLeave });
  expect(element.textContent).toContain('Vous êtes invité à une partie');
  await act(() =>
    element.querySelector<HTMLButtonElement>('[aria-label="Fermer le salon"]')!.click(),
  );
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(location.hash).toBe('');
  expect(mocked.joins).not.toHaveBeenCalled();
});

it('keeps a started game when its dialog closes and returns home only after leaving the room', async () => {
  history.replaceState(null, '', '/');
  const onClose = vi.fn();
  const onLeave = vi.fn();
  const element = await mountTurnLobby({ setupTurn: false, autoCreate: true, onClose, onLeave });
  const state = newLocal({
    players: [
      { id: 'guest-id', name: 'Camille' },
      { id: 'bot-id', name: 'Lou', bot: true },
    ],
  }).state;
  await act(() =>
    mocked.instances[0]!.onChange({
      state,
      members: [{ id: 'guest-id', name: 'Camille', key: {}, order: 0 }],
      host: 'guest-id',
      self: 'guest-id',
      connected: ['guest-id'],
      busy: false,
      status: 'Salon prêt',
      incidents: [],
      hash: '',
      epoch: 0,
      events: [],
      blocked: false,
    }),
  );
  await act(() =>
    element.querySelector<HTMLButtonElement>('[aria-label="Fermer le salon"]')!.click(),
  );
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onLeave).not.toHaveBeenCalled();
  expect(mocked.closes).not.toHaveBeenCalled();
  expect(loadOnlineResume()).not.toBeNull();
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  try {
    await act(() =>
      [...element.querySelectorAll('button')]
        .find((button) => button.textContent === 'Quitter ce salon')!
        .click(),
    );
  } finally {
    window.confirm = originalConfirm;
  }
  expect(onLeave).toHaveBeenCalledTimes(1);
  // App's onClose returns to the board, whereas onLeave returns to the home screen.
  expect(onClose.mock.invocationCallOrder.at(-1)).toBeLessThan(
    onLeave.mock.invocationCallOrder[0]!,
  );
  expect(mocked.closes).toHaveBeenCalledTimes(1);
  expect(location.hash).toBe('');
  expect(loadOnlineResume()).toBeNull();
});

it('shares only the complete invitation link and keeps the room alive while its dialog is closed', async () => {
  const code = 'f'.repeat(32);
  history.replaceState(null, '', '/');
  const onSession = vi.fn();
  const props = {
    open: true,
    autoCreate: true,
    defaults: { name: 'Camille', count: 2, teams: false, minutes: 20 },
    onClose: vi.fn(),
    onSession,
    onView: vi.fn(),
    onLeave: vi.fn(),
  };
  const element = document.body.appendChild(document.createElement('div'));
  root = createRoot(element);
  await act(() => root.render(createElement(OnlineLobby, props)));
  const host = {
    state: null,
    members: [{ id: 'guest-id', name: 'Camille', key: {}, order: 0 }],
    host: 'guest-id',
    self: 'guest-id',
    connected: ['guest-id'],
    busy: false,
    status: 'Salon prêt : invitez vos amis.',
    incidents: [],
    hash: '',
    epoch: 0,
    events: [],
    blocked: false,
  };
  await act(() => mocked.instances[0]!.onChange(host));
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  await act(() =>
    [...element.querySelectorAll('button')]
      .find((button) => button.textContent === 'Copier le lien d’invitation')!
      .click(),
  );
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`#room=${code}`));
  expect(writeText).not.toHaveBeenCalledWith(code);
  expect(element.textContent).toContain('Lien copié');
  expect(element.querySelector('.invite-code code')).toBeNull();
  await act(() => root.render(createElement(OnlineLobby, { ...props, open: false })));
  expect(mocked.closes).not.toHaveBeenCalled();
  expect(mocked.joins).toHaveBeenCalledTimes(1);
  await act(() => root.render(createElement(OnlineLobby, props)));
  expect(element.textContent).toContain('INVITEZ VOS AMIS');
  expect(onSession).toHaveBeenCalledTimes(1);
  await act(() => root.unmount());
  expect(mocked.closes).toHaveBeenCalledTimes(1);
});
