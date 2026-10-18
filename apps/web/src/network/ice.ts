/** The endpoint returns short-lived credentials; never ship a provider API key. */
export async function loadTurnServers(
  endpoint: string,
  signal: AbortSignal,
): Promise<RTCIceServer[]> {
  const response = await fetch(endpoint, { signal, cache: 'no-store', credentials: 'omit' });
  if (!response.ok)
    throw new Error('Le relais réseau est indisponible. Réessayez dans un instant.');
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('iceServers' in data) ||
    !Array.isArray(data.iceServers)
  )
    throw new Error('Configuration du relais réseau invalide.');
  const servers = data.iceServers as unknown[];
  if (
    !servers.length ||
    servers.length > 10 ||
    servers.some((server) => {
      if (!server || typeof server !== 'object' || !('urls' in server)) return true;
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return (
        !urls.length ||
        urls.some((url) => typeof url !== 'string' || !/^turns?:[^\s]+$/i.test(url)) ||
        !('username' in server) ||
        typeof server.username !== 'string' ||
        !('credential' in server) ||
        typeof server.credential !== 'string'
      );
    })
  )
    throw new Error('Configuration du relais réseau invalide.');
  return servers as RTCIceServer[];
}

export function manualTurnServers(
  url: string,
  username: string,
  credential: string,
): RTCIceServer[] {
  const urls = url
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!urls.length || urls.length > 10 || urls.some((item) => !/^turns?:[^\s]+$/i.test(item)))
    throw new Error('Utilisez une adresse turn: ou turns: pour le relais.');
  if (!username.trim() || !credential)
    throw new Error('Renseignez l’identifiant et le mot de passe TURN.');
  return [{ urls, username: username.trim(), credential }];
}

/** A relay candidate proves a TURN allocation, not a game across mobile networks. */
export async function probeTurn(iceServers: RTCIceServer[], signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new Error('Test annulé.');
  const peer = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'relay' });
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        peer.onicecandidate = null;
        peer.onicegatheringstatechange = null;
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish(new Error('Test annulé.'));
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              'Aucun relais TURN joignable. Vérifiez les paramètres, les ports et le pare-feu.',
            ),
          ),
        12000,
      );
      signal.addEventListener('abort', cancel, { once: true });
      peer.onicecandidate = ({ candidate }) => {
        if (candidate?.type === 'relay') finish();
      };
      peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === 'complete')
          finish(
            new Error(
              'Aucun relais TURN joignable. Vérifiez les paramètres, les ports et le pare-feu.',
            ),
          );
      };
      peer.createDataChannel('turn-check');
      void peer
        .createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .catch((error) => finish(error));
    });
  } finally {
    peer.close();
  }
}
