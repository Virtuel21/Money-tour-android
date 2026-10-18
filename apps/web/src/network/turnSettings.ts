export interface TurnSettings {
  relayOnly: boolean;
  manual: boolean;
}

/** Invitations share only the requested mode. TURN credentials stay in memory. */
export function invitationTurn(value: string): TurnSettings | null {
  const hash = value.includes('#') ? value.slice(value.indexOf('#') + 1) : '';
  const params = new URLSearchParams(hash);
  if (!params.has('turn')) return null;
  if (params.get('turn') !== 'manual') throw new Error('Configuration du relais réseau invalide.');
  return { manual: true, relayOnly: params.get('relay') === '1' };
}

export function invitationLink(base: string, code: string, settings: TurnSettings): string {
  const url = new URL(base);
  const params = new URLSearchParams({ room: code });
  if (settings.manual) {
    params.set('turn', 'manual');
    if (settings.relayOnly) params.set('relay', '1');
  }
  url.hash = params.toString();
  return url.href;
}

const key = 'money-tour.turn.v1';
export function savedTurn(room = ''): TurnSettings | null {
  try {
    const data = JSON.parse(localStorage.getItem(key + room) ?? 'null');
    if (
      !data ||
      typeof data.manual !== 'boolean' ||
      typeof data.relayOnly !== 'boolean' ||
      typeof data.at !== 'number' ||
      Date.now() - data.at > 86400000
    )
      return null;
    return { manual: data.manual, relayOnly: data.relayOnly };
  } catch {
    return null;
  }
}

export function rememberTurn(settings: TurnSettings, room = ''): void {
  try {
    localStorage.setItem(
      key + room,
      JSON.stringify({ manual: settings.manual, relayOnly: settings.relayOnly, at: Date.now() }),
    );
  } catch {
    /* Private browsing may disable optional preferences. */
  }
}
