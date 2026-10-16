import { useEffect, useId, useRef, useState } from 'react';
import { GameIcon } from '../game/GameIcon';
import { restoreDialogFocus, trapDialogFocus } from '../game/dialogFocus';
import { identity, secret, type Identity } from './crypto';
import { Session, type SessionView } from './session';
import {
  forgetOnlineResume,
  loadOnlineIdentity,
  loadOnlineSession,
  rememberOnline,
  type OnlineResume,
} from './storage';
import { TrysteroTransport } from './trystero';
import { invitationCode } from './invitation';
import { DurationPicker, validMinutes } from '../game/DurationPicker';
import { loadTurnServers } from './ice';

export default function OnlineLobby({
  open,
  onClose,
  onSession,
  onView,
  onLeave,
  autoCreate = false,
  resume,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onSession: (session: Session) => void;
  onView: (view: SessionView) => void;
  onLeave: () => void;
  autoCreate?: boolean;
  resume?: OnlineResume;
  defaults?: {
    name: string;
    count: number;
    teams: boolean;
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
    resume?.name ?? (defaults?.name && defaults.name !== 'Vous' ? defaults.name : ''),
  );
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState(''),
    [working, setWorking] = useState(false),
    [copied, setCopied] = useState(false);
  const [count, setCount] = useState(defaults?.count ?? 4),
    [teams, setTeams] = useState(defaults?.teams ?? false),
    [minutes, setMinutes] = useState(defaults?.minutes ?? 20);
  const [turnUrl, setTurnUrl] = useState(''),
    [turnUser, setTurnUser] = useState(''),
    [turnPassword, setTurnPassword] = useState('');
  const [pace, setPace] = useState<'normal' | 'fast'>(defaults?.pace ?? 'normal');
  const session = useRef<Session | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef(0);
  const connecting = useRef(false);
  const abort = useRef<AbortController | null>(null);
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
  async function connect(create: boolean) {
    if (connecting.current) return;
    connecting.current = true;
    const request = ++attempt.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setWorking(true);
    setError('');
    const roomCode = resume?.code ?? (create ? secret().slice(0, 32) : invitationCode(code));
    if (!roomCode) {
      setError('Le code doit contenir 32 caractères. Copiez le code complet de votre ami.');
      setWorking(false);
      connecting.current = false;
      return;
    }
    session.current?.close();
    session.current = null;
    setView(null);
    try {
      let user: Identity | undefined = loadOnlineIdentity(roomCode);
      user ??= await identity();
      const saved = loadOnlineSession(roomCode);
      let servers: RTCIceServer[] = [];
      if (turnUrl.trim()) {
        const urls = turnUrl
          .split(',')
          .map((url) => url.trim())
          .filter(Boolean);
        if (urls.some((url) => !/^turns?:[^\s]+$/i.test(url)))
          throw new Error('Utilisez une adresse turn: ou turns: pour le relais.');
        servers = [{ urls, username: turnUser, credential: turnPassword }];
      } else if (import.meta.env.VITE_TURN_CREDENTIALS_URL) {
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          servers = await loadTurnServers(
            import.meta.env.VITE_TURN_CREDENTIALS_URL,
            controller.signal,
          );
        } finally {
          clearTimeout(timeout);
        }
      }
      if (request !== attempt.current) return;
      const transport = new TrysteroTransport(servers);
      const chosenName = name.trim().slice(0, 20);
      const publicName =
        !chosenName || ['vous', 'voyageur'].includes(chosenName.toLowerCase())
          ? `Voyageur ${user.id.slice(0, 4)}`
          : chosenName;
      setName(publicName);
      const creator = resume?.creator ?? create;
      const recovery = { code: roomCode, name: publicName, creator };
      if (!rememberOnline(recovery, user))
        setError('Stockage désactivé : votre siège ne pourra pas être repris après fermeture.');
      const next = new Session(transport, user, publicName, creator);
      next.onChange = (value) => {
        if (request !== attempt.current) return;
        setView(value);
        callbacks.current.onView(value);
      };
      next.onPersist = (value) => {
        if (!rememberOnline({ ...recovery, name: next.name }, user, value))
          setError(
            'Sauvegarde indisponible : gardez cet onglet ouvert pour conserver votre siège.',
          );
      };
      session.current = next;
      setCode(roomCode);
      history.replaceState(
        history.state,
        '',
        `${location.pathname}${location.search}#room=${roomCode}`,
      );
      await next.join(roomCode, saved);
      if (request !== attempt.current) {
        next.close();
        return;
      }
      callbacks.current.onSession(next);
    } catch (e) {
      if (request !== attempt.current) return;
      session.current?.close();
      session.current = null;
      setView(null);
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
  function leave() {
    if (
      view?.state &&
      !view.state.winner &&
      !window.confirm(
        'Quitter le salon ? Votre siège sera conservé pendant 90 secondes avant de passer en bot.',
      )
    )
      return;
    attempt.current++;
    abort.current?.abort();
    connecting.current = false;
    setWorking(false);
    session.current?.close();
    session.current = null;
    setView(null);
    forgetOnlineResume(code);
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    callbacks.current.onLeave();
    onClose();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#room=${code}`);
      setCopied(true);
    } catch {
      setError('Copiez le lien affiché ci-dessous.');
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
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>Le voyage entre amis</h2>
        <button className="icon-button" aria-label="Fermer le salon" onClick={onClose}>
          <GameIcon name="close" />
        </button>
      </div>
      <div className="modal-body" tabIndex={0}>
        {!view ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) void connect(false);
            }}
          >
            <p>
              {invited
                ? 'Vous êtes invité à une partie ! Choisissez votre nom pour rejoindre vos amis.'
                : 'Rejoignez vos amis avec leur code ou créez un salon. Jusqu’à quatre voyageurs, chacun sur son écran.'}
            </p>
            <label className="field">
              Votre nom
              <input
                autoComplete="nickname"
                required
                maxLength={20}
                placeholder="Votre prénom ou pseudo"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {!invited && (
              <>
                <button
                  type="button"
                  className="primary"
                  disabled={working || !name.trim()}
                  onClick={() => void connect(true)}
                >
                  Créer un salon
                </button>
                <div className="divider">OU REJOINDRE</div>
                <label className="field">
                  Code du salon
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Code de 32 caractères"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
              </>
            )}
            <button type="submit" className="primary" disabled={working || !name.trim()}>
              {working ? 'Connexion…' : 'Rejoindre le salon'}
            </button>
            {(!invited || error) && (
              <details className="advanced">
                <summary>Aide à la connexion · serveur TURN</summary>
                <p>
                  Facultatif, pour les réseaux qui bloquent la connexion directe. Ces paramètres
                  restent dans cet onglet.
                </p>
                <label className="field">
                  Adresse TURN
                  <input
                    value={turnUrl}
                    onChange={(e) => setTurnUrl(e.target.value)}
                    placeholder="turn:serveur:3478"
                  />
                </label>
                <label className="field">
                  Identifiant
                  <input value={turnUser} onChange={(e) => setTurnUser(e.target.value)} />
                </label>
                <label className="field">
                  Mot de passe TURN
                  <input
                    type="password"
                    value={turnPassword}
                    onChange={(e) => setTurnPassword(e.target.value)}
                  />
                </label>
              </details>
            )}
          </form>
        ) : (
          <>
            {!view.host && (
              <div className="connection-wait" role="status">
                <h3>Connexion au salon…</h3>
                <p>{view.status}</p>
                <p>
                  Gardez cette page ouverte, ainsi que le salon de votre ami. La connexion peut
                  prendre quelques secondes.
                </p>
                <button className="primary" disabled={working} onClick={() => void connect(false)}>
                  Réessayer la connexion
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    attempt.current++;
                    abort.current?.abort();
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
                  Aide à la connexion
                </button>
              </div>
            )}
            {view.host && (
              <>
                <p className="eyebrow">SALON PRIVÉ · {view.members.length}/4 VOYAGEURS</p>
                <div className="invite-code">
                  <small>CODE D’INVITATION</small>
                  <code>{code.match(/.{1,8}/g)?.join(' ')}</code>
                  <button className="secondary" onClick={() => void copy()}>
                    {copied ? 'Lien copié ✓' : 'Copier le lien d’invitation'}
                  </button>
                  <input
                    aria-label="Lien d’invitation"
                    readOnly
                    value={`${location.origin}${location.pathname}#room=${code}`}
                  />
                  <button
                    className="secondary"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(code)
                        .then(() => setCopied(true))
                        .catch(() => setError('Copiez le code affiché ci-dessus.'));
                    }}
                  >
                    Copier le code du salon
                  </button>
                </div>
                {!view.state && (
                  <form
                    className="lobby-name"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void session.current?.rename(name);
                    }}
                  >
                    <label className="field">
                      Votre nom dans le salon
                      <input
                        maxLength={20}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <button className="secondary" disabled={!name.trim() || view.busy}>
                      Enregistrer mon nom
                    </button>
                  </form>
                )}
                <ul className="lobby-members">
                  {view.members.map((member, i) => (
                    <li key={member.id}>
                      <span className="seat-number">{i + 1}</span>
                      <strong>
                        {member.name}
                        {member.id === view.self ? ' (vous)' : ''}
                      </strong>
                      <small>
                        {member.id === view.host
                          ? 'HÔTE'
                          : view.connected.includes(member.id)
                            ? 'CONNECTÉ'
                            : 'ABSENT'}
                      </small>
                    </li>
                  ))}
                </ul>
                <p role="status" className="network-status">
                  {view.status}
                </p>
                {!view.state && view.host === view.self && (
                  <>
                    <div className="setup-options">
                      <label>
                        Sièges
                        <select
                          value={count}
                          disabled={teams}
                          onChange={(e) => setCount(Number(e.target.value))}
                        >
                          {[2, 3, 4].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <DurationPicker value={minutes} onChange={setMinutes} />
                      <label className="field">
                        Rythme partagé
                        <select
                          value={pace}
                          onChange={(e) => setPace(e.target.value === 'fast' ? 'fast' : 'normal')}
                        >
                          <option value="normal">Animations normales</option>
                          <option value="fast">Animations rapides</option>
                        </select>
                      </label>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={teams}
                        onChange={(e) => {
                          setTeams(e.target.checked);
                          if (e.target.checked) setCount(4);
                        }}
                      />{' '}
                      Équipes 2v2 · sièges 1 et 3 contre 2 et 4
                    </label>
                    <p>Les sièges libres seront occupés par des bots.</p>
                    <button
                      className="primary"
                      disabled={view.busy || view.blocked || !validMinutes(minutes)}
                      onClick={() =>
                        void session.current?.start(count, teams, minutes * 60000, pace)
                      }
                    >
                      {view.busy ? 'Préparation du plateau…' : 'Lancer la partie'}
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
                    Retour au plateau
                  </button>
                )}
                <details className="advanced">
                  <summary>État de la connexion</summary>
                  <p>
                    Époque {view.epoch} · état {view.hash.slice(0, 12)}
                  </p>
                  <ul>
                    {view.incidents.map((incident, i) => (
                      <li key={i}>{incident}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
            <button className="text-button" onClick={leave}>
              Quitter ce salon
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="network-error">
            {error}
          </p>
        )}
        <p className="setup-note">
          Vous pouvez reprendre votre siège sur cet appareil pendant 24 h. Après une coupure, la
          partie attend jusqu’à 90 secondes avant de confier votre siège à un bot. Une coupure de
          l’hôte déclenche une relève après 15 secondes. Certains réseaux nécessitent un TURN.
          Partagez le lien uniquement avec vos invités.
        </p>
      </div>
    </dialog>
  );
}
