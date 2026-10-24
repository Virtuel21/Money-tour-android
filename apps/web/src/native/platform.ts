import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';

/** A local WebView origin cannot be opened by another player. */
export const PUBLIC_GAME_URL = 'https://virtuel21.github.io/money-tour/';

export const nativePlatform = () => Capacitor.isNativePlatform();

export function invitationBase(browserUrl: string): string {
  return nativePlatform() ? PUBLIC_GAME_URL : browserUrl;
}

export function canShareInvitation(data: ShareData): boolean {
  return (
    nativePlatform() ||
    (typeof navigator.share === 'function' &&
      (typeof navigator.canShare !== 'function' || navigator.canShare(data)))
  );
}

export function copyInvitation(text: string): Promise<void> {
  if (nativePlatform()) return Clipboard.write({ string: text });
  return navigator.clipboard.writeText(text);
}

/** Call immediately from the tap handler, preserving browser share activation. */
export function shareInvitation(data: { title: string; url: string }): Promise<unknown> {
  if (nativePlatform()) return Share.share(data);
  return navigator.share(data);
}

export function shareWasCancelled(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  // Android's Sharesheet reports cancellation as a plugin Error rather than a DOMException.
  return nativePlatform() && error instanceof Error && /cancel(?:led|ed)?/i.test(error.message);
}
