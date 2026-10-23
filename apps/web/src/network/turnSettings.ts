export interface TurnSettings {
  relayOnly: boolean;
  manual: boolean;
}

/** Invitations share only the requested mode, never TURN credentials. */
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

export interface TurnPreferences {
  url: string;
  username: string;
  password: string;
  relayOnly: boolean;
}

const preferencesKey = 'money-tour.turn-settings.v1';

/** Manual settings belong to this browser and have no room or 24-hour expiry. */
export function loadTurnPreferences(): TurnPreferences | null {
  try {
    const data = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null');
    if (
      !data ||
      typeof data.url !== 'string' ||
      typeof data.username !== 'string' ||
      typeof data.password !== 'string' ||
      typeof data.relayOnly !== 'boolean'
    )
      return null;
    return {
      url: data.url,
      username: data.username,
      password: data.password,
      relayOnly: data.relayOnly,
    };
  } catch {
    return null;
  }
}

export function saveTurnPreferences(preferences: TurnPreferences): boolean {
  try {
    const { url, username, password, relayOnly } = preferences;
    localStorage.setItem(preferencesKey, JSON.stringify({ url, username, password, relayOnly }));
    return true;
  } catch {
    return false;
  }
}

export function forgetTurnPreferences(): boolean {
  try {
    localStorage.removeItem(preferencesKey);
    return true;
  } catch {
    return false;
  }
}
