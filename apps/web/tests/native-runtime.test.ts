// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cancelTopDialog, installNativeRuntime, nativeInvitation } from '../src/native/runtime';
import {
  canShareInvitation,
  copyInvitation,
  invitationBase,
  PUBLIC_GAME_URL,
  shareInvitation,
  shareWasCancelled,
} from '../src/native/platform';

const native = vi.hoisted(() => ({
  active: true,
  listeners: new Map<string, (event: unknown) => void>(),
  handles: [] as { remove: ReturnType<typeof vi.fn> }[],
  addListener: vi.fn(),
  getState: vi.fn(),
  getLaunchUrl: vi.fn(),
  minimizeApp: vi.fn(),
  write: vi.fn(),
  share: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.active },
}));
vi.mock('@capacitor/app', () => ({ App: native }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: { write: native.write } }));
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }));

beforeEach(() => {
  native.active = true;
  native.listeners.clear();
  native.handles.length = 0;
  native.getState.mockResolvedValue({ isActive: true });
  native.getLaunchUrl.mockResolvedValue(undefined);
  native.minimizeApp.mockResolvedValue(undefined);
  native.write.mockResolvedValue(undefined);
  native.share.mockResolvedValue({ activityType: 'test' });
  native.addListener.mockImplementation((event: string, callback: (value: unknown) => void) => {
    native.listeners.set(event, callback);
    const handle = { remove: vi.fn().mockResolvedValue(undefined) };
    native.handles.push(handle);
    return Promise.resolve(handle);
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
const callbacks = () => ({
  onBack: vi.fn().mockReturnValue(true),
  onActiveChange: vi.fn(),
  onInvitation: vi.fn(),
});
const room = 'a'.repeat(32);

it('accepts native and web invitations while stripping unrelated data', () => {
  expect(nativeInvitation(`moneytour://room/${room}`)).toBe(`#room=${room}`);
  expect(nativeInvitation(`moneytour://room/${room.toUpperCase()}#turn=manual&relay=1`)).toBe(
    `#room=${room}&turn=manual&relay=1`,
  );
  expect(
    nativeInvitation(`moneytour://room/#room=${room}&turn=manual&relay=1&password=private`),
  ).toBe(`#room=${room}&turn=manual&relay=1`);
  expect(nativeInvitation(`${PUBLIC_GAME_URL}#room=${room}`)).toBe(`#room=${room}`);
});

it.each([
  'javascript:alert(1)',
  `file:///private/data#room=${room}`,
  `moneytour://other/${room}`,
  'moneytour://room/not-a-room',
  `moneytour://room/${room}/extra`,
  `moneytour://room/${room}#room=${'b'.repeat(32)}`,
  `moneytour://room/#room=${room}&turn=unrecognized`,
])('rejects malformed or unsupported launch URLs: %s', (url) => {
  expect(nativeInvitation(url)).toBeNull();
});

it('routes hardware Back through the current screen and minimizes only at home', async () => {
  const handlers = callbacks();
  const dispose = installNativeRuntime(handlers);
  await Promise.resolve();
  native.listeners.get('backButton')!({});
  expect(handlers.onBack).toHaveBeenCalledOnce();
  expect(native.minimizeApp).not.toHaveBeenCalled();
  handlers.onBack.mockReturnValue(false);
  native.listeners.get('backButton')!({});
  expect(native.minimizeApp).toHaveBeenCalledOnce();
  dispose();
  native.handles.forEach((handle) => expect(handle.remove).toHaveBeenCalledOnce());
  native.listeners.get('backButton')!({});
  expect(handlers.onBack).toHaveBeenCalledTimes(2);
});

it('intakes a cold launch invitation and Activity state, then receives warm links and state changes', async () => {
  native.getLaunchUrl.mockResolvedValue({ url: `moneytour://room/${room}` });
  const handlers = callbacks();
  const dispose = installNativeRuntime(handlers);
  await Promise.resolve();
  expect(handlers.onInvitation).toHaveBeenCalledWith(`#room=${room}`);
  expect(handlers.onActiveChange).toHaveBeenCalledWith(true);
  native.listeners.get('appStateChange')!({ isActive: false });
  expect(handlers.onActiveChange).toHaveBeenLastCalledWith(false);
  native.listeners.get('appUrlOpen')!({ url: `moneytour://room/${'b'.repeat(32)}` });
  expect(handlers.onInvitation).toHaveBeenLastCalledWith(`#room=${'b'.repeat(32)}`);
  dispose();
});

it('does not overwrite a recent lifecycle event or warm invitation with stale launch results', async () => {
  let resolveState!: (value: { isActive: boolean }) => void;
  let resolveUrl!: (value: { url: string }) => void;
  native.getState.mockReturnValue(new Promise((resolve) => (resolveState = resolve)));
  native.getLaunchUrl.mockReturnValue(new Promise((resolve) => (resolveUrl = resolve)));
  const handlers = callbacks();
  const dispose = installNativeRuntime(handlers);
  native.listeners.get('appStateChange')!({ isActive: false });
  native.listeners.get('appUrlOpen')!({ url: `moneytour://room/${'b'.repeat(32)}` });
  resolveState({ isActive: true });
  resolveUrl({ url: `moneytour://room/${room}` });
  await Promise.resolve();
  expect(handlers.onActiveChange).toHaveBeenCalledExactlyOnceWith(false);
  expect(handlers.onInvitation).toHaveBeenCalledExactlyOnceWith(`#room=${'b'.repeat(32)}`);
  dispose();
});

it('removes listener handles that finish registering after teardown and ignores pending launch work', async () => {
  const registrations: ((value: { remove: () => Promise<void> }) => void)[] = [];
  native.addListener.mockImplementation(
    () => new Promise((resolve) => registrations.push(resolve)),
  );
  const handlers = callbacks();
  const dispose = installNativeRuntime(handlers);
  dispose();
  const remove = vi.fn().mockResolvedValue(undefined);
  registrations.forEach((resolve) => resolve({ remove }));
  await Promise.resolve();
  expect(remove).toHaveBeenCalledTimes(3);
  expect(handlers.onActiveChange).not.toHaveBeenCalled();
  expect(handlers.onInvitation).not.toHaveBeenCalled();
});

it('preserves a mandatory decision when its cancel handler prevents dismissal', () => {
  const dialog = document.body.appendChild(document.createElement('dialog'));
  dialog.showModal();
  const cancel = vi.fn((event: Event) => event.preventDefault());
  dialog.addEventListener('cancel', cancel);
  expect(cancelTopDialog()).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  expect(dialog.open).toBe(true);
  dialog.removeEventListener('cancel', cancel);
  expect(cancelTopDialog()).toBe(true);
  expect(dialog.open).toBe(false);
  expect(cancelTopDialog()).toBe(false);
});

it('uses the public game origin and native sharing/clipboard instead of localhost browser APIs', async () => {
  const data = { title: 'Money Tour', url: `${PUBLIC_GAME_URL}#room=${room}` };
  expect(invitationBase('https://localhost/')).toBe(PUBLIC_GAME_URL);
  expect(canShareInvitation(data)).toBe(true);
  await copyInvitation(data.url);
  expect(native.write).toHaveBeenCalledExactlyOnceWith({ string: data.url });
  await shareInvitation(data);
  expect(native.share).toHaveBeenCalledExactlyOnceWith(data);
  expect(shareWasCancelled(new Error('Share canceled'))).toBe(true);
  expect(shareWasCancelled(new Error('Share unavailable'))).toBe(false);
});

it('keeps browser fallbacks and does not register Activity listeners in the web build', async () => {
  native.active = false;
  const data = { title: 'Money Tour', url: `${PUBLIC_GAME_URL}#room=${room}` };
  const writeText = vi.fn().mockResolvedValue(undefined);
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText }, share });
  expect(invitationBase('https://localhost/')).toBe('https://localhost/');
  expect(canShareInvitation(data)).toBe(true);
  await copyInvitation(data.url);
  await shareInvitation(data);
  expect(writeText).toHaveBeenCalledWith(data.url);
  expect(share).toHaveBeenCalledWith(data);
  expect(native.write).not.toHaveBeenCalled();
  expect(native.share).not.toHaveBeenCalled();
  installNativeRuntime(callbacks())();
  expect(native.addListener).not.toHaveBeenCalled();
});
