import { translate } from '../i18n/translate';
import { getLanguage } from '../i18n/language';
import { useEffect, useId, useRef, useState } from 'react';
import { GameIcon } from '../game/GameIcon';
import { restoreDialogFocus, trapDialogFocus } from '../game/dialogFocus';
import { identity, secret, type Identity } from './crypto';
import { Session, type SessionOptions, type SessionView } from './session';
import { PublicMatchmaker, type PublicMatch, type PublicRoomLease } from './matchmaking';
import {
  forgetOnlineResume,
  loadOnlineIdentity,
  loadOnlineSession,
  rememberOnline,
  type OnlineResume,
} from './storage';
import { TrysteroTransport } from './trystero';
import { invitationCode } from './invitation';
import {
  canShareInvitation,
  copyInvitation,
  invitationBase,
  shareInvitation,
  shareWasCancelled,
} from '../native/platform';
import { DurationPicker, validMinutes } from '../game/DurationPicker';
import { loadTurnServers, manualTurnServers, probeTurn } from './ice';
import { TurnPanel } from './TurnPanel';
import {
  invitationLink,
  invitationTurn,
  loadTurnPreferences,
  saveTurnPreferences,
  forgetTurnPreferences,
  rememberTurn,
  savedTurn,
  type TurnPreferences,
  type TurnSettings,
} from './turnSettings';

export default function OnlineLobby({
  open,
  onClose,
  onSession,
  onView,
  onLeave,
  autoCreate = false,
  publicMode,
  setupTurn = false,
  resume,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onSession: (session: Session) => void;
  onView: (view: SessionView) => void;
  onLeave: () => void;
  autoCreate?: boolean;
  publicMode?: 'find' | 'create';
  setupTurn?: boolean;
  resume?: OnlineResume;
  defaults?: {
    name: string;
    count: number;
    minutes: number;
    pace?: 'normal' | 'fast';
  };
}) {
  const [invited] = useState(() => invitationCode(location.hash));
  const titleId = useId();
  const [code, setCode] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get('room') ?? '',
  );
  const [name, setName] = useState(
    resume?.name ??
      (defaults?.name && !['vous', 'you'].includes(defaults.name.trim().toLowerCase())
        ? defaults.name
        : ''),
  );
  const [view, setView] = useState<SessionView | null>(null);
  const [publicPhase, setPublicPhase] = useState<'idle' | 'searching' | 'joining' | 'creating'>(
    'idle',
  );
  const publicRoom = Boolean(publicMode || view?.publicGame);
  const [joiningRunning, setJoiningRunning] = useState(false);
  const [initialTurn] = useState(() => {
    try {
      return {
        settings: invitationTurn(location.hash) ?? savedTurn(resume?.code ?? code),
        error: '',
      };
    } catch (error) {
      return {
        settings: null,
        error: error instanceof Error ? error.message : 'Configuration du relais réseau invalide.',
      };
    }
  });
  const [configurationError, setConfigurationError] = useState(initialTurn.error);
  const errorElement = useRef<HTMLParagraphElement>(null);
  const [error, setError] = useState(initialTurn.error),
    [working, setWorking] = useState(false),
    [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const [count, setCount] = useState(defaults?.count ?? 4),
    [minutes, setMinutes] = useState(defaults?.minutes ?? 20);
  const [initialPreferences] = useState(loadTurnPreferences);
  const [turnUrl, setTurnUrl] = useState(initialPreferences?.url ?? ''),
    [turnUser, setTurnUser] = useState(initialPreferences?.username ?? ''),
    [turnPassword, setTurnPassword] = useState(initialPreferences?.password ?? '');
  const [requiredTurn, setRequiredTurn] = useState(initialTurn.settings?.manual ?? false);
  const [relayOnly, setRelayOnly] = useState(
    initialTurn.settings?.relayOnly ?? initialPreferences?.relayOnly ?? setupTurn,
  );
  const [saveStatus, setSaveStatus] = useState(
    initialPreferences ? 'Paramètres TURN enregistrés sur cet appareil.' : '',
  );
  const [networkSettings, setNetworkSettings] = useState<TurnSettings>({
    relayOnly: false,
    manual: false,
  });
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const [pace, setPace] = useState<'normal' | 'fast'>(defaults?.pace ?? 'normal');
  const session = useRef<Session | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef(0);
  const joinedCode = useRef('');
  const connecting = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const directory = useRef<PublicMatchmaker | null>(null);
  const publicLease = useRef<PublicRoomLease | null>(null);
  const reservation = useRef<PublicMatch | null>(null);
  const callbacks = useRef({ onSession, onView, onLeave });
  callbacks.current = { onSession, onView, onLeave };
  useEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current;
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
    return () => {
      element?.close();
      restoreDialogFocus(opener);
    };
  }, [open]);
  useEffect(
    () => () => {
      attempt.current++;
      abort.current?.abort();
      publicLease.current?.close();
      if (reservation.current) void directory.current?.release(reservation.current).catch(() => {});
      session.current?.close();
    },
    [],
  );
  const created = useRef(false);
  useEffect(() => {
    if ((resume || autoCreate) && !created.current) {
      created.current = true;
      void connect(!resume);
    }
  }, [autoCreate, resume]);
  useEffect(() => {
    if (error && !view) errorElement.current?.focus();
  }, [error, view]);
  function selectedTurn(): TurnSettings {
    if (configurationError) throw new Error(configurationError);
    const configured = !!turnUrl.trim() || !!turnUser || !!turnPassword;
    if (!configured && (relayOnly || setupTurn || requiredTurn))
      throw new Error('Configurez un serveur TURN avant d’activer le relais obligatoire.');
    return {
      relayOnly,
      manual: configured,
    };
  }
  async function resolveTurn(settings: TurnSettings, controller: AbortController) {
    if (settings.manual) return manualTurnServers(turnUrl, turnUser, turnPassword);
    const endpoint = import.meta.env.VITE_TURN_CREDENTIALS_URL;
    if (!endpoint) return [];
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      return await loadTurnServers(endpoint, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }
  async function testTurn() {
    if (testing || connecting.current) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setTesting(true);
    setTestStatus('');
    setError('');
    try {
      const servers = await resolveTurn(selectedTurn(), controller);
      if (!servers.length) throw new Error('Renseignez les paramètres de votre serveur TURN.');
      await probeTurn(servers, controller.signal);
      setTestStatus(
        'Relais TURN joignable. Allocation réussie ; la connexion entre joueurs sera établie dans le salon.',
      );
    } catch (error) {
      setError(
        controller.signal.aborted
          ? 'Le relais met trop de temps à répondre. Réessayez.'
          : error instanceof Error
            ? error.message
            : 'Connexion impossible.',
      );
    } finally {
      setTesting(false);
    }
  }
  function changeTurn(update: Partial<TurnPreferences>) {
    setConfigurationError('');
    setTestStatus('');
    setError('');
    const next = { url: turnUrl, username: turnUser, password: turnPassword, relayOnly, ...update };
    setTurnUrl(next.url);
    setTurnUser(next.username);
    setTurnPassword(next.password);
    setRelayOnly(next.relayOnly);
    setSaveStatus(
      saveTurnPreferences(next)
        ? 'Paramètres TURN enregistrés sur cet appareil.'
        : 'Le navigateur ne permet pas d’enregistrer les paramètres TURN. Gardez cet onglet ouvert.',
    );
  }
  function forgetTurn() {
    setConfigurationError('');
    setTestStatus('');
    setError('');
    setTurnUrl('');
    setTurnUser('');
    setTurnPassword('');
    setRelayOnly(false);
    setSaveStatus(
      forgetTurnPreferences()
        ? 'Paramètres TURN effacés de cet appareil.'
        : 'Le navigateur ne permet pas d’effacer les paramètres TURN enregistrés.',
    );
  }
  function changeCode(value: string) {
    setCode(value);
    try {
      const enteredRoom = invitationCode(value);
      const settings = invitationTurn(value) ?? (enteredRoom ? savedTurn(enteredRoom) : null);
      if (settings) {
        setRequiredTurn(settings.manual);
        setRelayOnly(settings.relayOnly);
      }
      setError('');
      setConfigurationError('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Configuration du relais réseau invalide.';
      setConfigurationError(message);
      setError(message);
    }
  }
  const link = invitationLink(invitationBase(location.href), code, networkSettings);
  const shareData = { title: 'Money Tour', url: link };
  const canShare = canShareInvitation(shareData);
  const turnPanel = (
    <TurnPanel
      open={setupTurn || requiredTurn}
      url={turnUrl}
      onUrl={(url) => changeTurn({ url })}
      username={turnUser}
      onUsername={(username) => changeTurn({ username })}
      password={turnPassword}
      onPassword={(password) => changeTurn({ password })}
      relayOnly={relayOnly}
      onRelayOnly={(relayOnly) => changeTurn({ relayOnly })}
      onForget={forgetTurn}
      saveStatus={saveStatus}
      disabled={working}
      testing={testing}
      status={testStatus}
      onTest={() => void testTurn()}
    />
  );
  function matchmaker() {
    return (directory.current ??= new PublicMatchmaker());
  }
  async function connect(
    create: boolean,
    details?: {
      code?: string;
      publicGame?: boolean;
      match?: PublicMatch;
      controller?: AbortController;
      quiet?: boolean;
    },
  ): Promise<Session | undefined> {
    if (connecting.current || testing) return;
    connecting.current = true;
    const request = ++attempt.current;
    const controller = details?.controller ?? new AbortController();
    if (abort.current !== controller) abort.current?.abort();
    abort.current = controller;
    setWorking(true);
    setError('');
    const roomCode =
      details?.code ?? resume?.code ?? (create ? secret().slice(0, 32) : invitationCode(code));
    if (!roomCode) {
      setError('Collez le lien d’invitation complet envoyé par votre ami.');
      setWorking(false);
      connecting.current = false;
      return;
    }
    publicLease.current?.close();
    publicLease.current = null;
    session.current?.close();
    session.current = null;
    setView(null);
    try {
      let user: Identity | undefined = loadOnlineIdentity(roomCode);
      user ??= await identity();
      const saved = loadOnlineSession(roomCode);
      const settings = selectedTurn();
      const servers = await resolveTurn(settings, controller);
      if (request !== attempt.current) return;
      const transport = new TrysteroTransport(servers, settings.relayOnly);
      setNetworkSettings(settings);
      rememberTurn(settings, roomCode);
      const chosenName = name.trim().slice(0, 20);
      const publicName =
        !chosenName || ['vous', 'voyageur', 'you', 'traveller'].includes(chosenName.toLowerCase())
          ? `Voyageur ${user.id.slice(0, 4)}`
          : chosenName;
      setName(publicName);
      const creator = details ? create : (resume?.creator ?? create);
      const isPublic = details?.publicGame === true || resume?.publicGame === true;
      const recovery = {
        code: roomCode,
        name: publicName,
        creator,
        ...(isPublic ? { publicGame: true } : {}),
      };
      joinedCode.current = roomCode;
      if (!rememberOnline(recovery, user))
        setError('Stockage désactivé : votre siège ne pourra pas être repris après fermeture.');
      let lease: PublicRoomLease | null = null;
      const publicOptions: SessionOptions = isPublic
        ? {
            publicGame: true,
            authorizePublicJoin: (authorization) =>
              lease?.authorizePublicJoin(authorization) ?? Promise.resolve(false),
          }
        : {};
      const next = new Session(transport, user, publicName, creator, undefined, publicOptions);
      let publicReady = !isPublic;
      next.onChange = (value) => {
        if (request !== attempt.current) return;
        setView(value);
        if (!publicReady) return;
        if (
          isPublic &&
          !creator &&
          value.publicJoinStatus !== 'joined' &&
          !value.members.some((member) => member.id === user!.id)
        )
          return;
        callbacks.current.onView(value);
      };
      next.onPersist = (value) => {
        if (request !== attempt.current) return;
        if (!rememberOnline({ ...recovery, name: next.name }, user, value))
          setError(
            'Sauvegarde indisponible : gardez cet onglet ouvert pour conserver votre siège.',
          );
      };
      session.current = next;
      if (details?.match)
        await next.requestPublicSeat({
          seatId: details.match.seatId,
          reservationId: details.match.reservationId,
          reservationToken: details.match.reservationToken,
          expectedHostId: details.match.hostId,
        });
      setCode(roomCode);
      setCopied(false);
      history.replaceState(history.state, '', invitationLink(location.href, roomCode, settings));
      await next.join(roomCode, saved);
      if (request !== attempt.current) {
        next.close();
        return;
      }
      if (next.publicGame) {
        lease = matchmaker().watch(next, { code: roomCode, language: getLanguage() });
        publicLease.current = lease;
        await lease.ready();
        if (request !== attempt.current || controller.signal.aborted) {
          lease.close();
          next.close();
          return;
        }
      }
      callbacks.current.onSession(next);
      if (isPublic) {
        publicReady = true;
        const value = next.view;
        if (
          creator ||
          value.publicJoinStatus === 'joined' ||
          value.members.some((member) => member.id === user!.id)
        )
          callbacks.current.onView(value);
      }
      return next;
    } catch (e) {
      if (request !== attempt.current) return;
      publicLease.current?.close();
      publicLease.current = null;
      session.current?.close();
      session.current = null;
      setView(null);
      if (!details?.quiet || controller.signal.aborted)
        setError(
          controller.signal.aborted
            ? 'Le relais met trop de temps à répondre. Réessayez.'
            : e instanceof Error
              ? e.message
              : 'Connexion impossible.',
        );
    } finally {
      if (request === attempt.current) {
        setWorking(false);
        connecting.current = false;
      }
    }
  }
  async function waitForPublicSeat(next: Session, signal: AbortSignal) {
    const deadline = Date.now() + 40000;
    while (!signal.aborted && session.current === next && Date.now() < deadline) {
      if (next.view.publicJoinStatus === 'joined') return true;
      if (next.view.publicJoinStatus === 'rejected') return false;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }
  async function connectPublic() {
    if (!publicMode || !name.trim() || connecting.current || testing) return;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    const request = ++attempt.current;
    connecting.current = true;
    setWorking(true);
    setError('');
    const excluded: string[] = [];
    try {
      if (publicMode === 'find') {
        for (let retry = 0; retry < 2; retry++) {
          setPublicPhase('searching');
          const found = await matchmaker().find({
            language: getLanguage(),
            signal: controller.signal,
            excludeRoomIds: excluded,
          });
          if (controller.signal.aborted || (retry === 0 && request !== attempt.current)) return;
          if (!found) break;
          reservation.current = found;
          setJoiningRunning(found.phase === 'playing');
          setPublicPhase('joining');
          connecting.current = false;
          const next = await connect(false, {
            code: found.code,
            publicGame: true,
            match: found,
            controller,
            quiet: true,
          });
          if (next && !controller.signal.aborted) {
            connecting.current = true;
            setWorking(true);
          }
          if (next && (await waitForPublicSeat(next, controller.signal))) {
            reservation.current = null;
            return;
          }
          await matchmaker()
            .release(found)
            .catch(() => {});
          if (found.phase === 'playing' || retry > 0) excluded.push(found.roomId);
          reservation.current = null;
          publicLease.current?.close();
          publicLease.current = null;
          next?.close();
          session.current = null;
          setView(null);
          if (controller.signal.aborted) return;
          connecting.current = true;
          setWorking(true);
        }
      }
      if (controller.signal.aborted) return;
      setPublicPhase('creating');
      setJoiningRunning(false);
      connecting.current = false;
      const next = await connect(true, { publicGame: true, controller });
      if (!next || controller.signal.aborted || session.current !== next) return;
      if (publicMode === 'find') await next.start(4, false, 20 * 60000, 'normal');
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'La recherche est momentanément indisponible. Réessayez.',
        );
        publicLease.current?.close();
        publicLease.current = null;
        session.current?.close();
        session.current = null;
        setView(null);
      }
    } finally {
      if (abort.current === controller) {
        connecting.current = false;
        setWorking(false);
        setPublicPhase('idle');
      }
    }
  }
  function leave() {
    if (
      view?.state &&
      !view.state.winner &&
      !window.confirm(
        translate(
          'Quitter le salon ? Votre siège sera conservé pendant 90 secondes avant de passer en bot.',
        ),
      )
    )
      return;
    attempt.current++;
    abort.current?.abort();
    publicLease.current?.close();
    publicLease.current = null;
    if (reservation.current) void directory.current?.release(reservation.current).catch(() => {});
    reservation.current = null;
    connecting.current = false;
    setWorking(false);
    session.current?.close();
    session.current = null;
    setView(null);
    forgetOnlineResume(joinedCode.current || resume?.code || code);
    joinedCode.current = '';
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    onClose();
    callbacks.current.onLeave();
  }
  function close() {
    // Before the game starts, dismissing creation cancels the room and any pending join.
    if (!view?.state && !session.current?.state) leave();
    else onClose();
  }
  async function copy() {
    setCopied(false);
    setShareError('');
    if (error === 'Copiez le lien affiché ci-dessous.') setError('');
    try {
      await copyInvitation(link);
      setCopied(true);
    } catch {
      setError('Copiez le lien affiché ci-dessous.');
    }
  }
  async function share() {
    if (sharing) return;
    setSharing(true);
    setShareError('');
    try {
      // Keep the native sheet in this click's activation; copying must finish beforehand.
      await shareInvitation(shareData);
    } catch (error) {
      if (!shareWasCancelled(error))
        setShareError(
          'Le partage n’a pas pu être ouvert. Collez le lien copié dans votre application de messagerie.',
        );
    } finally {
      setSharing(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal online-modal"
      aria-labelledby={titleId}
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>
          {translate(
            setupTurn
              ? 'Configurer le serveur TURN'
              : publicRoom
                ? 'Le voyage en ligne'
                : 'Le voyage entre amis',
          )}
        </h2>
        <button className="icon-button" aria-label={translate('Fermer le salon')} onClick={close}>
          <GameIcon name="close" />
        </button>
      </div>
      <div className="modal-body" tabIndex={0}>
        {!view ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                if (publicMode) void connectPublic();
                else void connect(setupTurn);
              }
            }}
          >
            <p>
              {publicMode
                ? translate(
                    publicMode === 'find'
                      ? 'Choisissez un pseudo : nous cherchons une table disponible pour vous.'
                      : 'Ouvrez votre table à d’autres voyageurs. Vous choisissez la durée et le nombre de places.',
                  )
                : invited
                  ? translate(
                      'Vous êtes invité à une partie ! Choisissez votre nom pour rejoindre vos amis.',
                    )
                  : translate(
                      'Rejoignez vos amis avec leur lien d’invitation ou créez un salon. Jusqu’à quatre voyageurs, chacun sur son écran.',
                    )}
            </p>
            <label className="field">
              {translate('Votre nom')}
              <input
                autoComplete="nickname"
                required
                maxLength={20}
                placeholder={translate('Votre prénom ou pseudo')}
                value={name}
                disabled={working}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {setupTurn && turnPanel}
            {publicMode && (
              <>
                <p className="public-disclosure">
                  {translate(
                    'Les places libres peuvent être complétées par des joueurs IA en attendant d’autres voyageurs.',
                  )}
                </p>
                <button
                  className="primary"
                  type="submit"
                  disabled={working || testing || !name.trim()}
                >
                  {translate(
                    publicMode === 'find' ? 'Trouver une partie' : 'Créer un salon public',
                  )}
                </button>
                {working && (
                  <div className="public-match-status" role="status" aria-live="polite">
                    <h3>
                      {translate(
                        publicPhase === 'searching'
                          ? 'Recherche d’une table…'
                          : publicPhase === 'creating'
                            ? 'Votre table se prépare…'
                            : 'Connexion à votre table…',
                      )}
                    </h3>
                    <p>
                      {translate(
                        publicPhase === 'searching'
                          ? 'Priorité aux salons de votre langue, en attente ou encore assez tôt dans la partie.'
                          : publicPhase === 'creating'
                            ? 'Aucune table n’a été trouvée. Un salon ouvert est préparé avec des joueurs IA.'
                            : 'Nous réservons votre place et synchronisons le plateau.',
                      )}
                    </p>
                    <button type="button" className="secondary" onClick={leave}>
                      {translate('Annuler la recherche')}
                    </button>
                  </div>
                )}
              </>
            )}
            {!publicMode && !invited && (
              <>
                <button
                  type="button"
                  className="primary"
                  disabled={working || testing || !name.trim()}
                  onClick={() => void connect(true)}
                >
                  {working
                    ? translate('Connexion…')
                    : translate(setupTurn ? 'Créer le salon avec TURN' : 'Créer un salon')}
                </button>
                {!setupTurn && (
                  <>
                    <div className="divider">{translate('OU REJOINDRE')}</div>
                    <label className="field">
                      {translate('Lien d’invitation')}
                      <input
                        value={code}
                        onChange={(e) => changeCode(e.target.value)}
                        placeholder={translate('Collez le lien envoyé par votre ami')}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </label>
                  </>
                )}
              </>
            )}
            {!setupTurn && !publicMode && (
              <button
                type="submit"
                className="primary"
                disabled={working || testing || !name.trim()}
              >
                {working ? translate('Connexion…') : translate('Rejoindre le salon')}
              </button>
            )}
            {!setupTurn &&
              (!publicMode || error || requiredTurn) &&
              (!invited || error || requiredTurn) &&
              turnPanel}
          </form>
        ) : (
          <>
            {!view.host && (
              <div className="connection-wait" role="status">
                <h3>{translate('Connexion au salon…')}</h3>
                <p>{translate(view.status)}</p>
                {publicRoom && joiningRunning && (
                  <p>
                    {translate(
                      'Cette partie a déjà commencé : vous reprenez une place disponible avec son argent et ses propriétés.',
                    )}
                  </p>
                )}
                <p>
                  {translate(
                    publicRoom
                      ? 'Votre place est réservée. Gardez cette page ouverte pendant la connexion.'
                      : 'Gardez cette page ouverte, ainsi que le salon de votre ami. La connexion peut prendre quelques secondes.',
                  )}
                </p>
                <button className="primary" disabled={working} onClick={() => void connect(false)}>
                  {translate('Réessayer la connexion')}
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    attempt.current++;
                    abort.current?.abort();
                    publicLease.current?.close();
                    publicLease.current = null;
                    connecting.current = false;
                    setWorking(false);
                    session.current?.close();
                    session.current = null;
                    setView(null);
                    setError(
                      'Si le problème persiste en 4G/5G, essayez le Wi-Fi ou configurez un relais TURN dans l’aide à la connexion.',
                    );
                  }}
                >
                  {translate('Aide à la connexion')}
                </button>
              </div>
            )}
            {view.host && (
              <>
                <p className="eyebrow">
                  {translate(publicRoom ? 'SALON PUBLIC · ' : 'SALON PRIVÉ · ')}
                  {view.members.length}
                  {translate('/4 VOYAGEURS')}
                </p>
                <p className="network-status">
                  {translate(
                    networkSettings.relayOnly
                      ? 'Mode réseau : TURN obligatoire'
                      : import.meta.env.VITE_TURN_CREDENTIALS_URL || networkSettings.manual
                        ? 'Mode réseau : direct avec secours TURN'
                        : 'Mode réseau : connexion directe',
                  )}
                </p>
                {networkSettings.manual && (
                  <p className="setup-note">
                    {translate(
                      'Les invités devront saisir leurs paramètres TURN. Envoyez le lien complet pour conserver le mode réseau.',
                    )}
                  </p>
                )}
                {publicRoom ? (
                  <p className="public-disclosure">
                    {translate('Ce salon est ouvert aux voyageurs qui recherchent une partie.')}
                  </p>
                ) : (
                  <div className="invite-code">
                    <small>{translate('INVITEZ VOS AMIS')}</small>
                    <p>
                      {translate(
                        'Partagez ce lien avec vos amis. Le salon reste ouvert tant que vous gardez cette fenêtre ouverte.',
                      )}
                    </p>
                    <button className="primary" onClick={() => void copy()}>
                      {copied
                        ? translate('Lien copié ✓')
                        : translate('Copier le lien d’invitation')}
                    </button>
                    <input aria-label={translate('Lien d’invitation')} readOnly value={link} />
                    {copied && canShare && (
                      <button className="secondary" disabled={sharing} onClick={() => void share()}>
                        {translate(sharing ? 'Ouverture du partage…' : 'Partager le lien')}
                      </button>
                    )}
                    {shareError && (
                      <p role="alert" className="network-error invite-share-error">
                        {translate(shareError)}
                      </p>
                    )}
                  </div>
                )}
                {!view.state && (
                  <form
                    className="lobby-name"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void session.current?.rename(name);
                    }}
                  >
                    <label className="field">
                      {translate('Votre nom dans le salon')}
                      <input
                        maxLength={20}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <button className="secondary" disabled={!name.trim() || view.busy}>
                      {translate('Enregistrer mon nom')}
                    </button>
                  </form>
                )}
                <ul className="lobby-members">
                  {view.members.map((member, i) => (
                    <li key={member.id}>
                      <span className="seat-number">{i + 1}</span>
                      <strong>
                        {member.name}
                        {member.id === (view.selfIdentity ?? view.self) ? translate(' (vous)') : ''}
                      </strong>
                      <small>
                        {member.id === view.host
                          ? translate('HÔTE')
                          : view.connected.includes(member.id)
                            ? translate('CONNECTÉ')
                            : translate('ABSENT')}
                      </small>
                    </li>
                  ))}
                </ul>
                <p role="status" className="network-status">
                  {translate(view.status)}
                </p>
                {!view.state &&
                  view.host === (view.selfIdentity ?? view.self) &&
                  publicMode !== 'find' && (
                    <>
                      <div className="setup-options">
                        <label>
                          {translate('Sièges')}
                          <select
                            aria-label={translate('Sièges')}
                            value={count}
                            onChange={(e) => setCount(Number(e.target.value))}
                          >
                            {[2, 3, 4].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                        <DurationPicker value={minutes} onChange={setMinutes} />
                        <label className="field">
                          {translate('Rythme partagé')}
                          <select
                            value={pace}
                            onChange={(e) => setPace(e.target.value === 'fast' ? 'fast' : 'normal')}
                          >
                            <option value="normal">{translate('Animations normales')}</option>
                            <option value="fast">{translate('Animations rapides')}</option>
                          </select>
                        </label>
                      </div>
                      <p>
                        {translate(
                          publicRoom
                            ? 'Les places libres peuvent être complétées par des joueurs IA en attendant d’autres voyageurs.'
                            : 'Les sièges libres seront occupés par des bots.',
                        )}
                      </p>
                      <button
                        className="primary"
                        disabled={working || view.busy || view.blocked || !validMinutes(minutes)}
                        onClick={() =>
                          void session.current?.start(count, false, minutes * 60000, pace)
                        }
                      >
                        {view.busy
                          ? translate('Préparation du plateau…')
                          : translate('Lancer la partie')}
                      </button>
                    </>
                  )}
                {view.state && (
                  <button
                    className="primary"
                    onClick={() => {
                      callbacks.current.onView(view);
                      onClose();
                    }}
                  >
                    {translate('Retour au plateau')}
                  </button>
                )}
                <details className="advanced">
                  <summary>{translate('État de la connexion')}</summary>
                  <p>
                    {translate('Époque ')}
                    {view.epoch}
                    {translate(' · état ')}
                    {translate(view.hash.slice(0, 12))}
                  </p>
                  <ul>
                    {view.incidents.map((incident, i) => (
                      <li key={i}>{translate(incident)}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
            <button className="text-button" onClick={leave}>
              {translate('Quitter ce salon')}
            </button>
          </>
        )}
        {error && (
          <p ref={errorElement} tabIndex={-1} role="alert" className="network-error">
            {translate(error)}
          </p>
        )}
        <p className="setup-note">
          {translate(
            publicRoom
              ? 'Vous pouvez reprendre votre place sur cet appareil après une coupure. Gardez le jeu au premier plan.'
              : 'Vous pouvez reprendre votre siège sur cet appareil pendant 24 h. Après une coupure, la partie attend jusqu’à 90 secondes avant de confier votre siège à un bot. Une coupure de l’hôte déclenche une relève après 15 secondes. Certains réseaux nécessitent un TURN. Partagez le lien uniquement avec vos invités.',
          )}
        </p>
      </div>
    </dialog>
  );
}
