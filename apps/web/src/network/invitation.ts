/** Codes remain in the URL fragment so the static host never receives them. */
export function invitationCode(value: string): string | null {
  let raw = value.includes('#')
    ? (new URLSearchParams(value.slice(value.indexOf('#') + 1)).get('room') ?? '')
    : value;
  if (!value.includes('#') && value.startsWith('moneytour:')) {
    try {
      const url = new URL(value);
      raw = url.hostname === 'room' ? url.pathname.replace(/^\/+|\/+$/g, '') : '';
    } catch {
      return null;
    }
  }
  const code = raw.toLowerCase().replace(/[\s-]/g, '');
  return /^[a-f0-9]{32}$/.test(code) ? code : null;
}
