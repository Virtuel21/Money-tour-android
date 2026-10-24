import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { invitationCode } from '../network/invitation';
import { invitationTurn } from '../network/turnSettings';
import { nativePlatform } from './platform';
import { installFocusedFieldReveal } from './focusedField';

/** Normalize only room/mode data; never navigate the WebView to an incoming URL. */
export function nativeInvitation(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['moneytour:', 'https:', 'http:'].includes(url.protocol)) return null;
    if (url.protocol === 'moneytour:' && url.hostname !== 'room') return null;
    const path = url.protocol === 'moneytour:' ? url.pathname.replace(/^\/+|\/+$/g, '') : '';
    const pathCode = path ? invitationCode(path) : null;
    const hashCode = invitationCode(url.hash);
    const code = hashCode ?? pathCode;
    if (!code || (path && (!pathCode || pathCode !== code))) return null;
    const settings = invitationTurn(url.hash);
    const params = new URLSearchParams({ room: code });
    if (settings?.manual) {
      params.set('turn', 'manual');
      if (settings.relayOnly) params.set('relay', '1');
    }
    return `#${params}`;
  } catch {
    return null;
  }
}

/** A Back press follows the same cancellation path as Escape, including mandatory decisions. */
export function cancelTopDialog(): boolean {
  const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
  const focused = document.activeElement?.closest<HTMLDialogElement>('dialog[open]');
  const dialog = focused ?? dialogs.at(-1);
  if (!dialog) return false;
  const event = new Event('cancel', { cancelable: true });
  if (dialog.dispatchEvent(event)) dialog.close();
  return true;
}

export interface NativeRuntimeCallbacks {
  /** True means an in-app surface handled Back; false minimizes from the home screen. */
  onBack: () => boolean;
  onActiveChange: (active: boolean) => void;
  onInvitation: (hash: string) => void;
}

/** Listener promises may resolve after React unmount; remove those handles as well. */
export function installNativeRuntime(callbacks: NativeRuntimeCallbacks): () => void {
  if (!nativePlatform()) return () => {};
  const removeFieldReveal = installFocusedFieldReveal();
  let disposed = false;
  let stateRevision = 0;
  let receivedUrl = false;
  const handles: PluginListenerHandle[] = [];
  const listen = (pending: Promise<PluginListenerHandle>) => {
    void pending
      .then((handle) => {
        if (disposed) void handle.remove().catch(() => {});
        else handles.push(handle);
      })
      .catch(() => {});
  };
  const receive = (value: string) => {
    if (disposed) return;
    const hash = nativeInvitation(value);
    if (hash) callbacks.onInvitation(hash);
  };
  listen(
    App.addListener('backButton', () => {
      if (!disposed && !callbacks.onBack()) void App.minimizeApp().catch(() => {});
    }),
  );
  listen(
    App.addListener('appStateChange', ({ isActive }) => {
      stateRevision++;
      if (!disposed) callbacks.onActiveChange(isActive);
    }),
  );
  listen(
    App.addListener('appUrlOpen', ({ url }) => {
      receivedUrl = true;
      receive(url);
    }),
  );
  const initialRevision = stateRevision;
  void App.getState()
    .then(({ isActive }) => {
      if (!disposed && stateRevision === initialRevision) callbacks.onActiveChange(isActive);
    })
    .catch(() => {});
  void App.getLaunchUrl()
    .then((launch) => {
      if (!receivedUrl && launch?.url) receive(launch.url);
    })
    .catch(() => {});
  return () => {
    disposed = true;
    removeFieldReveal();
    for (const handle of handles) void handle.remove().catch(() => {});
  };
}
