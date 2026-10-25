import { translate, formatText } from './i18n/translate';
import { LanguagePicker, useLanguage } from './i18n/LanguagePicker';
import { useAuctionDialog } from './game/useAuctionDialog';
import { StrategyProgress } from './game/StrategyProgress';
import { PropertyInsight } from './game/PropertyInsight';
import { GameIcon } from './game/GameIcon';
import { BuildingIllustration } from './game/BuildingIllustration';
import { architectureForCity, architectureLabels } from './game/architecture';
import { EventCelebration } from './game/EventCelebration';
import { loadComfort, saveComfort } from './game/comfort';
import { guardGameNavigation } from './game/navigationGuard';
import { loadOnlineResume, type OnlineResume } from './network/storage';
import { invitationCode } from './network/invitation';
import { cancelTopDialog } from './native/runtime';
import { useNativeRuntime } from './native/useNativeRuntime';
import { nativePlatform } from './native/platform';
import { SettingsPanel } from './game/SettingsPanel';
import { restoreDialogFocus, trapDialogFocus } from './game/dialogFocus';
import { ContextTip } from './game/ContextTip';
import { GameResults } from './game/GameResults';
import { rematchOptions } from './game/gameStats';
import { useAuctionReveal } from './game/useAuctionReveal';
import { useSpectatorDialog } from './game/useSpectatorDialog';
import { tileTitle, festivalText, propertyRulesText } from './game/tileTitle';
import { TauntMenu } from './game/TauntMenu';
import {
  TAUNT_COOLDOWN,
  TAUNT_DURATION,
  tauntPlayer,
  type Taunt,
  type TauntKind,
} from './game/taunts';
import { eventText } from './game/journal';
import type { BonusInfo } from './game/bonuses';
import { MobileTiles } from './game/MobileTiles';
import { useMobile } from './game/useMobile';
import { MobilePocket } from './game/MobilePocket';
import { AuctionView } from './game/AuctionView';
import { SharedGameInfo } from './game/AdventureHUD';
import { AdventureStart } from './game/AdventureStart';
import { prepareLocalAdventure, releaseLocalAdventure } from './game/adventureIntro';
import { PlayerProfiles } from './game/PlayerProfiles';
import { useOwnerInspectionDismissal } from './game/useOwnerInspectionDismissal';
import { ArchipelagoBackdrop } from './game/ArchipelagoBackdrop';
import { ActionClock, GameClockContext } from './game/ActionClock';
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import {
  chooseBotAction,
  config,
  createGame,
  getLegalActions,
  getDecisionPlayerId,
  getPropertyValue,
  adventureText,
  reservedCity,
  type GameAction,
  type GameState,
} from '@money-tour/engine';
const Board = lazy(() => import('./board/Board3D'));
import { usePresentation } from './game/usePresentation';
import { DurationPicker, validMinutes } from './game/DurationPicker';
import { previewScenario } from './game/preview';
import { Soundscape, loadAudio } from './audio/synth';
const OnlineLobby = lazy(() => import('./network/OnlineLobby'));
import type { Session, SessionView } from './network/session';
import './network/public.css';
import {
  applyLocal,
  colors,
  duration,
  loadLocal,
  money,
  newLocal,
  persistLocal,
  phaseText,
  victoryText,
  type LocalSave,
} from './game/local';
import { MoneyFlight, TurnBanner } from './game/GameFeedback';
import { purchaseOffer, PurchaseDetails } from './game/PurchaseOffer';
import { DuelCard, isDuelNotice, useDuelEncounterKey } from './game/DuelCard';
import { DrawnCard } from './game/DrawnCard';
import { ActionCard } from './game/ActionCard';
import { CasinoView } from './game/CasinoView';
import credits from '../../../CREDITS.md?raw';
import creditsEnglish from '../../../CREDITS.en.md?raw';

function Logo() {
  return (
    <span className="brand">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="18" fill="#142d3d" />
        <path d="M31 10v31H12z" fill="#fff6df" />
        <path d="M36 17v24h17z" fill="#e8725b" />
        <path d="M10 45h45l-10 9H20z" fill="#e6b94a" />
      </svg>
      <span>
        {translate('MONEY ')}
        <b>{translate('TOUR')}</b>
      </span>
    </span>
  );
}
function GameProviders({
  value,
  children,
}: {
  value: { state: GameState | null; held: boolean };
  children: React.ReactNode;
}) {
  return <GameClockContext.Provider value={value}>{translate(children)}</GameClockContext.Provider>;
}

function Modal({
  title,
  children,
  onClose,
  className = '',
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      restoreDialogFocus(opener);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      className={`modal ${className}`}
    >
      <div className="modal-countdown">
        <ActionClock full />
      </div>
      <div className="modal-heading">
        <h2 id={titleId}>{translate(title)}</h2>
        {onClose && (
          <button aria-label={translate('Fermer')} className="icon-button" onClick={onClose}>
            <GameIcon name="close" />
          </button>
        )}
      </div>
      <div className="modal-body" tabIndex={0}>
        {translate(children)}
      </div>
      {footer && <div className="modal-footer">{translate(footer)}</div>}
    </dialog>
  );
}
function TileDetailsDialog({
  property,
  cardKey,
  title,
  onClose,
  reducedMotion,
  children,
}: {
  property: boolean;
  cardKey: string;
  title: string;
  onClose: () => void;
  reducedMotion: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  return property ? (
    <Modal title={title} onClose={onClose}>
      {children(onClose)}
    </Modal>
  ) : (
    <ActionCard
      cardKey={cardKey}
      title={title}
      icon="map"
      onClose={onClose}
      reducedMotion={reducedMotion}
    >
      {(card) => children(() => card.run(onClose))}
    </ActionCard>
  );
}
const demo = createGame({
  config: { ...config, shuffleStreets: false },
  players: [
    { id: 'p1', name: 'Vous' },
    { id: 'p2', name: 'Sacha' },
    { id: 'p3', name: 'Lou' },
    { id: 'p4', name: 'Noa' },
  ],
  seed: 'menu',
});
demo.players.forEach((player, i) => {
  player.position = [5, 12, 19, 23][i]!;
});
for (const [id, ownerId, level] of [
  [1, 'p1', 2],
  [2, 'p1', 1],
  [9, 'p2', 3],
  [10, 'p2', 1],
  [17, 'p3', 2],
  [25, 'p4', 4],
] as const)
  demo.properties[id] = { ownerId, level, championships: 0 };

export default function App() {
  const language = useLanguage();
  useEffect(() => {
    document.title = translate('Money Tour — un archipel, mille fortunes');
    const descriptions = [
      [
        'meta[name="description"]',
        'Votre prochain empire tient sur un plateau. Un jeu de villes, de voyages et de fortunes à partager entre amis.',
      ],
      ['meta[property="og:title"]', 'Money Tour — un archipel, mille fortunes'],
      [
        'meta[property="og:description"]',
        'Achetez, construisez et faites le tour de la fortune. Un jeu de plateau original dans votre navigateur.',
      ],
    ];
    for (const [selector, source] of descriptions)
      document.querySelector(selector!)?.setAttribute('content', translate(source!));
  }, [language]);
  const mobile = useMobile();
  const [overview, setOverview] = useState(true);
  const [boardPanned, setBoardPanned] = useState(false);
  const [viewResetKey, setViewResetKey] = useState(0);
  const [strategicTiles, setStrategicTiles] = useState<number[]>([]);
  const [comfort, setComfort] = useState(loadComfort);
  const [journey, setJourney] = useState(0);
  useEffect(() => saveComfort(comfort), [comfort]);
  const [boardReady, setBoardReady] = useState(false);
  const [inspectedOwner, setInspectedOwner] = useState<string | null>(null);
  useOwnerInspectionDismissal(inspectedOwner, () => setInspectedOwner(null));
  const [save, setSave] = useState<LocalSave | null>(() => previewScenario() ?? loadLocal());
  const localSaveRef = useRef(save);
  localSaveRef.current = save;
  const [screen, setScreen] = useState<'menu' | 'game'>(() =>
    previewScenario() ? 'game' : 'menu',
  );
  const [modal, setModal] = useState<
    | 'local-setup'
    | 'credits'
    | 'settings'
    | 'insurance'
    | 'leave'
    | 'new-game'
    | 'invitation'
    | 'online'
    | 'pocket'
    | 'bonus'
    | 'journal'
    | 'strategy'
    | 'taunt'
    | null
  >(location.hash.includes('room=') ? 'online' : null);
  const [pendingInvitation, setPendingInvitation] = useState<string | null>(null);
  const [selectedBonus, setSelectedBonus] = useState<BonusInfo | null>(null);
  const [insuranceDecision, setInsuranceDecision] = useState('');
  const showBonus = (bonus: BonusInfo) => {
    setSelectedBonus(bonus);
    setModal('bonus');
  };
  const [tauntTarget, setTauntTarget] = useState('');
  const [tauntSender, setTauntSender] = useState<string>();
  const [visibleTaunt, setVisibleTaunt] = useState<Taunt | null>(null);
  const [tauntReadyAt, setTauntReadyAt] = useState(0);
  const seenTaunt = useRef('');
  const [createSalon, setCreateSalon] = useState(false);
  const [publicMode, setPublicMode] = useState<'find' | 'create'>();
  const [lobbyKey, setLobbyKey] = useState(0);
  const [setupTurn, setSetupTurn] = useState(false);
  const [online, setOnline] = useState<SessionView | null>(null);
  const localStartDeadline = online ? undefined : save?.adventureStartDeadline;
  const adventureHeld = screen === 'game' && Boolean(online?.startGate || localStartDeadline);
  const [onlineResume, setOnlineResume] = useState(() => loadOnlineResume());
  const [resumeRequest, setResumeRequest] = useState<OnlineResume | undefined>(() => {
    const code = invitationCode(location.hash);
    return code ? (loadOnlineResume(code) ?? undefined) : undefined;
  });
  useEffect(() => {
    if (screen !== 'game') return;
    return guardGameNavigation(() => setModal('leave'));
  }, [screen]);
  const onlineSession = useRef<Session | null>(null);
  const onlineSeq = useRef(-1);
  useEffect(() => {
    const taunt = online?.taunts?.at(-1);
    if (!taunt || seenTaunt.current === taunt.id) return;
    seenTaunt.current = taunt.id;
    setVisibleTaunt(taunt);
    if (taunt.playerId === online?.self) setTauntReadyAt(Date.now() + TAUNT_COOLDOWN);
  }, [online?.taunts, online?.self]);
  useEffect(() => {
    if (!visibleTaunt) return;
    const timer = setTimeout(() => setVisibleTaunt(null), TAUNT_DURATION);
    return () => clearTimeout(timer);
  }, [visibleTaunt]);
  useEffect(() => {
    if (!tauntReadyAt) return;
    const timer = setTimeout(() => setTauntReadyAt(0), Math.max(0, tauntReadyAt - Date.now()));
    return () => clearTimeout(timer);
  }, [tauntReadyAt]);
  const [audioPrefs, setAudioPrefs] = useState(loadAudio);
  const sound = useRef<Soundscape | null>(null);
  useEffect(() => {
    sound.current = new Soundscape();
    return () => sound.current?.close();
  }, []);
  useEffect(() => {
    sound.current?.configure(audioPrefs);
  }, [audioPrefs]);
  const [dismissedOffer, setDismissedOffer] = useState('');
  const [buyoutOfferKey, setBuyoutOfferKey] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [count, setCount] = useState(4),
    [mode, setMode] = useState<'solo' | 'local' | 'public'>('local');
  const [minutes, setMinutes] = useState(20),
    [names, setNames] = useState(() => [translate('Vous'), 'Sacha', 'Lou', 'Noa']);
  const firstNameEdited = useRef(false);
  useEffect(() => {
    if (!firstNameEdited.current) setNames((old) => [translate('Vous'), ...old.slice(1)]);
  }, [language]);
  const [bots, setBots] = useState([false, false, false, false]);
  const [paused, setPaused] = useState(false);
  const nativeForeground = useRef(true);
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [history, setHistory] = useState<string[]>(save?.history ?? []),
    [notice, setNotice] = useState('');
  const dispatchRef = useRef<(action: GameAction) => void>(() => {});
  const cinema = usePresentation(
    save?.state ?? demo,
    reduced,
    !!online,
    online ? (online.state?.presentationPace ?? 'normal') : comfort.pace,
    paused,
  );
  const rolling = cinema.busy;
  const presentedFrame = useRef(cinema.frame);
  presentedFrame.current = cinema.frame;
  const shownFrame = cinema.frame;
  const drawnCardKey = [
    save?.seed ?? journey,
    shownFrame.state.seq,
    shownFrame.state.turn,
    shownFrame.cue.kind,
    shownFrame.cue.reason,
    shownFrame.cue.message,
    shownFrame.cue.cardId ?? shownFrame.cue.tile,
    shownFrame.cue.playerId,
  ].join(':');
  const dismissDrawnCard = () => {
    // A late animation callback must never dismiss the next shared presentation.
    if (presentedFrame.current === shownFrame) cinema.dismiss();
  };
  const turnKey = (online?.state ?? save?.state)?.turn;
  useEffect(() => {
    setInspectedOwner(null);
    setStrategicTiles([]);
  }, [turnKey]);
  const display = cinema.frame.state;
  useEffect(() => {
    sound.current?.setScene(screen);
    if (screen === 'game') setOverview(true);
  }, [screen]);
  useEffect(() => {
    if (screen !== 'game' || paused) return;
    const kind = cinema.frame.cue.kind;
    if (cinema.frame.cue.sound) sound.current?.effect(cinema.frame.cue.sound);
    else if (kind !== 'settle' && kind !== 'money' && kind !== 'turn')
      sound.current?.effect(kind === 'hop' ? 'move' : kind);
  }, [cinema.frame, screen, paused]);
  const goHome = () => {
    sound.current?.stopEffects();
    cinema.reset(online?.state ?? save?.state ?? demo);
    // The next visit mounts a fresh renderer; shader/asset loading must not
    // spend a local player's decision time or let bots act behind the loader.
    setBoardReady(false);
    setScreen('menu');
    setPaused(true);
    setSelected(null);
    setModal(null);
  };
  const detachOnline = () => {
    // Starting another game releases this connection while retaining a valid saved seat.
    onlineSession.current?.close();
    onlineSession.current = null;
    setOnline(null);
    onlineSeq.current = -1;
    setOnlineResume(loadOnlineResume());
    setResumeRequest(undefined);
    setCreateSalon(false);
    setPublicMode(undefined);
    setSetupTurn(false);
    setLobbyKey((value) => value + 1);
    window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}`);
  };
  const rematch = () => {
    if (!current.winner) return;
    if (onlineSession.current) {
      void onlineSession.current.rematch();
      return;
    }
    const next = prepareLocalAdventure(
      newLocal({
        ...rematchOptions(current),
        presentationPace: comfort.pace,
      }),
    );
    cinema.reset(next.state);
    setSave(next);
    setHistory(['Nouveau voyage ! ' + adventureText(next.state)]);
    setJourney((value) => value + 1);
    setNotice('');
    setPaused(false);
    setScreen('game');
    setSelected(null);
    setStrategicTiles([]);
    setModal(null);
    setDismissedOffer('');
    setBuyoutOfferKey('');
  };
  const togglePause = () => {
    if (online) return;
    sound.current?.stopEffects();
    setPaused((value) => !value);
  };
  const openNativeInvitation = (hash: string) => {
    detachOnline();
    goHome();
    window.history.replaceState(
      window.history.state,
      '',
      `${location.pathname}${location.search}${hash}`,
    );
    const code = invitationCode(hash)!;
    setResumeRequest(loadOnlineResume(code) ?? undefined);
    setPendingInvitation(null);
    setModal('online');
  };
  useNativeRuntime({
    onBack: () => {
      if (cancelTopDialog()) return true;
      if (inspectedOwner) {
        setInspectedOwner(null);
        return true;
      }
      if (modal) {
        setModal(null);
        return true;
      }
      if (screen === 'game') {
        setModal('leave');
        return true;
      }
      return false;
    },
    onActiveChange: (active) => {
      nativeForeground.current = active;
      sound.current?.setAppActive(active);
      if (!active && !online) {
        const currentSave = localSaveRef.current;
        if (currentSave && !previewScenario()) persistLocal(currentSave);
        // Keep the local game paused on return so no decision expires while the player is away.
        if (screen === 'game') setPaused(true);
      }
    },
    onInvitation: (hash) => {
      if (online && invitationCode(location.hash) === invitationCode(hash)) return;
      if (screen === 'game' || online) {
        setPendingInvitation(hash);
        setModal('invitation');
      } else openNativeInvitation(hash);
    },
  });
  const current =
    screen === 'game' ? (rolling ? display : (online?.state ?? save?.state ?? demo)) : demo;
  const active = current.players[current.currentPlayer]!;
  const humans = current.players.filter((p) => !p.bot && !p.eliminated);
  const canTaunt =
    !paused &&
    !adventureHeld &&
    !current.winner &&
    (online ? humans.some((p) => p.id === online.self) : humans.length > 0);
  const openTaunt = (id: string) => {
    if (!canTaunt) return;
    const sender = tauntPlayer(current, online?.self, id);
    if (!sender) return;
    setTauntSender(sender);
    setTauntTarget(id);
    setSelected(null);
    setModal('taunt');
  };
  const sendTaunt = (kind: TauntKind) => {
    if (!tauntSender || tauntReadyAt || tauntPlayer(current, tauntSender) !== tauntSender) return;
    if (onlineSession.current)
      void onlineSession.current.taunt(kind, tauntTarget === tauntSender ? undefined : tauntTarget);
    else {
      const at = Date.now();
      setVisibleTaunt({
        id: crypto.randomUUID(),
        playerId: tauntSender,
        kind,
        targetId: tauntTarget,
        at,
      });
      setTauntReadyAt(at + TAUNT_COOLDOWN);
    }
    setModal(null);
  };
  const decisionPlayer = current.players.find((p) => p.id === getDecisionPlayerId(current))!;
  const duelEncounterKey = useDuelEncounterKey(save?.seed ?? journey, current);
  const sharedDialog = useSpectatorDialog(
    duelEncounterKey ??
      `${current.turn}:${current.phase}:${current.auction?.id ?? ''}:${current.auction?.stage ?? ''}:${decisionPlayer.id}`,
    !!online && online.self !== decisionPlayer.id,
  );
  const auctionDialog = useAuctionDialog(
    current.auction?.id,
    `${current.auction?.stage}:${decisionPlayer.id}`,
    boardReady &&
      screen === 'game' &&
      (!rolling || cinema.frame.cue.reason === 'auction_started') &&
      !paused &&
      !modal,
  );
  const legal = screen === 'game' ? getLegalActions(current) : [];
  const act = (action: GameAction) => {
    if (
      screen !== 'game' ||
      ((!nativeForeground.current || paused || adventureHeld) && action.type !== 'quit')
    )
      return;
    if (action.type !== 'tick') setInspectedOwner(null);
    if (['roll', 'attempt_escape', 'travel'].includes(action.type)) setOverview(false);
    if (onlineSession.current) {
      if (!('playerId' in action) || action.playerId !== online?.self) return;
      if (rolling && !['quit', 'set_control'].includes(action.type)) return;
      void onlineSession.current.intent(action);
      return;
    }
    const previous = localSaveRef.current;
    if (!previous) return;
    const { save: next, result } = applyLocal(previous, action);
    if (result.error) {
      setNotice('Cette action n’est plus disponible.');
      return;
    }
    // Timers can dispatch in the same React batch as the end of a card's flight.
    // Advance synchronously so the next tick cannot overwrite the chosen action.
    localSaveRef.current = next;
    cinema.present(next.state, result.events);
    const messages = result.events.map((e) => eventText(e, next.state)).filter(Boolean);
    next.history = [...messages.slice().reverse(), ...(previous.history ?? history)];
    setSave(next);
    if (messages.length) setHistory((old) => [...messages.reverse(), ...old]);
  };
  dispatchRef.current = act;
  // Countdown ticks may replace state while a card leaves. Dispatch against the
  // latest state, but never carry a choice into a different player's decision.
  const decisionKey = [
    save?.seed ?? journey,
    current.turn,
    current.phase,
    decisionPlayer.id,
    current.duel?.id,
    current.duel?.stage,
    current.phase === 'debt'
      ? `${active.cash}:${Object.entries(current.properties)
          .filter(([, property]) => property.ownerId === active.id)
          .map(([id]) => id)
          .join(',')}`
      : '',
  ].join(':');
  const debtDialog = useSpectatorDialog(decisionKey, current.phase === 'debt');
  const debtReopen = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (debtDialog.hidden && !modal && selected === null)
      debtReopen.current?.focus({ preventScroll: true });
  }, [debtDialog.hidden, modal, selected]);
  const currentDecision = useRef(decisionKey);
  currentDecision.current = decisionKey;
  const dispatchDecision = (action: GameAction) => {
    if (currentDecision.current === decisionKey) dispatchRef.current(action);
  };
  useEffect(() => {
    if (save && !previewScenario() && !persistLocal(save))
      setNotice('Le navigateur ne permet pas la sauvegarde locale. Gardez cet onglet ouvert.');
  }, [save]);
  const readyLocalAdventure = () => {
    const previous = localSaveRef.current;
    if (!previous?.adventureStartDeadline) return;
    const next = releaseLocalAdventure(previous);
    localSaveRef.current = next;
    setSave(next);
  };
  useEffect(() => {
    if (screen !== 'game' || !localStartDeadline) return;
    const timer = setTimeout(readyLocalAdventure, Math.max(0, localStartDeadline - Date.now()));
    return () => clearTimeout(timer);
  }, [screen, localStartDeadline]);
  useEffect(() => {
    if (
      (previewScenario() && new URLSearchParams(location.search).get('clock') !== '1') ||
      online ||
      screen !== 'game' ||
      !boardReady ||
      paused ||
      adventureHeld ||
      rolling ||
      current.winner
    )
      return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsedMs = Math.max(0, Math.round(now - last));
      last = now;
      dispatchRef.current({ type: 'tick', elapsedMs });
    }, 1000);
    return () => clearInterval(timer);
  }, [
    screen,
    boardReady,
    paused,
    adventureHeld,
    rolling,
    Boolean(current.winner),
    Boolean(online),
  ]);
  useEffect(() => {
    if (
      online ||
      screen !== 'game' ||
      !boardReady ||
      paused ||
      adventureHeld ||
      rolling ||
      current.winner ||
      !decisionPlayer.bot
    )
      return;
    const timer = setTimeout(() => dispatchRef.current(chooseBotAction(current)), 650);
    return () => clearTimeout(timer);
  }, [save, screen, boardReady, paused, adventureHeld, rolling, Boolean(online)]);
  const start = () => {
    if (!validMinutes(minutes)) return;
    detachOnline();
    const next = prepareLocalAdventure(
      newLocal({
        randomFirstPlayer: true,
        players: Array.from({ length: count }, (_, i) => ({
          id: `p${i + 1}`,
          name: names[i]!.trim() || `Joueur ${i + 1}`,
          bot: bots[i],
        })),
        mode: 'free-for-all',
        durationMs: minutes * 60000,
        presentationPace: comfort.pace,
      }),
    );
    cinema.reset(next.state);
    setSave(next);
    setHistory(['Bon voyage ! ' + adventureText(next.state)]);
    setNotice('');
    setPaused(false);
    setScreen('game');
    setSelected(null);
  };
  const chooseMode = (value: 'solo' | 'local' | 'public') => {
    setMode(value);
    setBots(value === 'solo' ? [false, true, true, true] : [false, false, false, false]);
  };
  const actionLabel = (action: GameAction): string => {
    const tile = current.config.board[active.position]!;
    switch (action.type) {
      case 'roll':
        return 'Lancer les dés';
      case 'attempt_escape':
        return 'Tenter un double';
      case 'pay_bail':
        return `Quitter l’île · ${money(config.islandFee, true)}`;
      case 'use_escape':
        return 'Utiliser mon billet de sortie';
      case 'buy':
        return `Acheter · ${money(tile.price ?? 0, true)}`;
      case 'buy_fraud':
        return `Fraude fiscale · ${money(Math.floor(tile.price! * (current.config.fraudDiscount ?? 0.5)), true)}`;
      case 'use_squatter':
        return 'Utiliser Squatteur · aucun loyer';
      case 'pay_rent':
        return `Payer le loyer · ${money(current.pendingRent?.amount ?? 0, true)}`;
      case 'casino_red':
        return 'Jouer rouge';
      case 'casino_black':
        return 'Jouer noir';
      case 'casino_spin':
        return 'Lancer les rouleaux';
      case 'insure':
        return `Assurer ${current.config.board[action.tile]?.name}`;
      case 'attack':
        return `Viser ${current.config.board[action.tile]?.name}`;
      case 'buyout':
        return `Racheter · ${money(getPropertyValue(current, tile.id) * config.buyoutMultiplier, true)}`;
      case 'upgrade':
        return current.config.singlePropertyDecision
          ? 'Choisir mes constructions'
          : `Construire · ${money(tile.buildCosts?.[(current.properties[tile.id]?.level ?? 0) + 1] ?? 0, true)}`;
      case 'finish':
        if (current.phase === 'championship') return 'Ne pas organiser le Festival';
        if (current.extraRoll && current.config.travelOnDouble && active.travelPending)
          return 'Continuer · Voyage disponible';
        return current.extraRoll
          ? 'Continuer · double !'
          : current.phase === 'property'
            ? 'Passer / terminer'
            : 'Fin du tour';
      case 'decline_travel':
        return 'Rester et lancer les dés';
      case 'sell':
        return `Vendre ${current.config.board[action.tile]?.name} · ${money(getPropertyValue(current, action.tile) * current.config.resaleRate)}`;
      case 'travel':
        return `Voyager à ${current.config.board[action.tile]?.name}`;
      case 'place_championship':
        return `Choisir ${current.config.board[action.tile]?.name}`;
      default:
        return action.type;
    }
  };
  const tile = selected === null ? null : current.config.board[selected]!;
  const property = selected === null ? undefined : current.properties[selected];
  const interactionDisabled =
    paused ||
    adventureHeld ||
    rolling ||
    decisionPlayer.bot ||
    Boolean(current.winner) ||
    Boolean(online && (online.self !== decisionPlayer.id || online.busy || online.blocked));
  useAuctionReveal(
    current,
    online?.self,
    act,
    screen !== 'game' || interactionDisabled,
    online?.self ?? save?.seed,
  );
  const offerKey = [online ? journey : save?.seed, active.id, current.turn, active.position].join(
    ':',
  );
  const eligibleOffer =
    screen === 'game' && !interactionDisabled && !modal
      ? purchaseOffer(current, online?.self, buyoutOfferKey === offerKey)
      : null;
  const offer = eligibleOffer && dismissedOffer !== offerKey ? eligibleOffer : null;
  const chooseTile = (id: number) => {
    setInspectedOwner(null);
    if (current.phase === 'debt' && debtDialog.hidden) {
      if (!rolling) setSelected(id);
      return;
    }
    const action = options.find((a) => a.tile === id);
    if (action && !interactionDisabled) act(action);
    else if (current.phase === 'championship') return;
    else if (purchaseOffer(current, online?.self)?.tile.id === id) {
      setSelected(null);
      setDismissedOffer('');
    } else if (!rolling) setSelected(id);
  };
  const available = legal.filter(
    (a) =>
      !a.type.startsWith('auction_') &&
      !a.type.startsWith('duel_') &&
      !['alliance', 'quit', 'travel', 'place_championship', 'insure', 'attack'].includes(a.type),
  );
  const options = legal.filter((a): a is Extract<GameAction, { tile: number }> =>
    ['travel', 'place_championship', 'insure', 'attack', 'sell'].includes(a.type),
  );
  const boardOptions = current.phase === 'debt' && debtDialog.hidden ? [] : options;
  const phaseCardOpen =
    screen === 'game' &&
    !interactionDisabled &&
    !modal &&
    !tile &&
    (current.phase === 'island' || (current.phase === 'debt' && !debtDialog.hidden));
  const festivalDescription = options.length
    ? translate('Choisissez directement une propriété éclairée sur le plateau.') +
      ' ' +
      translate(money(current.config.championshipFee, true))
    : current.config.board.some((t) => current.properties[t.id]?.ownerId === active.id)
      ? translate('Il vous faut ') +
        translate(money(current.config.championshipFee, true)) +
        translate(' pour organiser le Festival.')
      : translate('Achetez d’abord une ville ou une île pour y organiser le Festival.');
  const travelDescription =
    translate(
      options.length
        ? 'Choisissez directement une case éclairée sur le plateau.'
        : 'Voyage · fonds insuffisants',
    ) +
    ' · ' +
    translate(money(current.config.travelFee, true));
  const insuranceAvailable = !interactionDisabled && options.some((a) => a.type === 'insure');
  useEffect(() => {
    if (modal === 'insurance' && (!insuranceAvailable || insuranceDecision !== decisionKey))
      setModal(null);
  }, [modal, insuranceAvailable, insuranceDecision, decisionKey]);
  const browseTile = (id: number) => {
    const boardOnly =
      ['championship', 'travel'].includes(current.phase) ||
      (current.phase === 'debt' && debtDialog.hidden);
    const actionable = !interactionDisabled && options.some((action) => action.tile === id);
    if (!boardOnly && (actionable || purchaseOffer(current, online?.self)?.tile.id === id)) {
      setModal(null);
      chooseTile(id);
    } else if (!rolling) {
      setInspectedOwner(null);
      setSelected(id);
    }
  };
  const actionDescription =
    current.phase === 'auction'
      ? 'Une ville neutre attend vos offres secrètes. Suivez la fenêtre d’enchère.'
      : current.phase === 'duel'
        ? 'La fenêtre de duel indique qui doit miser ou choisir sa main. Les choix sont ensuite révélés automatiquement.'
        : current.phase === 'alliance'
          ? 'Choisissez le joueur avec qui partager les prochains gains.'
          : current.phase === 'casino'
            ? 'Roulette ou machine à sous : tentez le jackpot dans la fenêtre du casino.'
            : current.phase === 'attack'
              ? 'Choisissez une propriété adverse en surbrillance sur le plateau. Une assurance bloque l’expropriation, mais pas les cafards.'
              : active.insurance?.tile === null &&
                  ['roll', 'end', 'property'].includes(current.phase)
                ? 'Votre jeton assurance est disponible : cliquez sur une de vos propriétés en surbrillance pour la protéger.'
                : current.phase === 'debt'
                  ? `Il vous manque ${money(Math.max(0, (current.debt?.amount ?? 0) - active.cash))}. Vendez un bien pour régler votre dette.`
                  : current.phase === 'island'
                    ? 'Payez le voyage de retour, utilisez un billet ou tentez un double. Vous sortirez au plus tard à la troisième tentative.'
                    : current.phase === 'travel'
                      ? current.config.travelToRivals
                        ? `Choisissez une destination, même chez un adversaire. Le voyage coûte ${money(current.config.travelFee, true)} et remplace les dés, même après un double.`
                        : `Choisissez une case libre ou alliée. Le voyage coûte ${money(current.config.travelFee, true)} et remplace les dés, même après un double.`
                      : current.phase === 'championship'
                        ? `Choisissez une ville éclairée : ${money(current.config.championshipFee, true)}, loyer ×2 pendant quatre de vos tours.`
                        : current.phase === 'property'
                          ? current.properties[active.position]?.ownerId &&
                            current.properties[active.position]?.ownerId !== active.id
                            ? `${current.config.board[active.position]!.name} · le loyer adverse est prélevé automatiquement. Vous pouvez poursuivre ou proposer un rachat.`
                            : `${current.config.board[active.position]!.name} vous accueille. Achetez, construisez ou poursuivez votre voyage.`
                          : 'Deux dés. Une destination. Une nouvelle opportunité.';

  const localSetup = (
    <>
      <div className="setup-options">
        <label>
          {translate('Voyageurs')}
          <select
            aria-label={translate('Voyageurs')}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
                {translate(' joueurs')}
              </option>
            ))}
          </select>
        </label>
        <DurationPicker value={minutes} onChange={setMinutes} />
      </div>
      <div className="seat-list">
        {Array.from({ length: count }, (_, i) => (
          <div className="seat" key={i}>
            <span className="seat-number" style={{ background: colors[i] }}>
              {i + 1}
            </span>
            <input
              aria-label={formatText('Nom du joueur {0}', i + 1)}
              maxLength={20}
              value={names[i]}
              onChange={(e) => {
                if (i === 0) firstNameEdited.current = true;
                setNames((old) => old.map((n, j) => (j === i ? e.target.value : n)));
              }}
            />
            <select
              aria-label={formatText('Type du joueur {0}', i + 1)}
              value={bots[i] ? 'bot' : 'human'}
              onChange={(e) =>
                setBots((old) => old.map((b, j) => (j === i ? e.target.value === 'bot' : b)))
              }
            >
              <option value="human">{translate('Humain')}</option>
              <option value="bot">{translate('Bot')}</option>
            </select>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <GameProviders
      value={{
        state: screen === 'game' ? current : null,
        held: paused || adventureHeld || rolling,
      }}
    >
      <div
        className={`app${comfort.largeText ? ' text-large' : ''}`}
        style={{ '--ui-text-scale': comfort.largeText ? 1.15 : 1 } as React.CSSProperties}
        onPointerDownCapture={() => void sound.current?.unlock()}
        onClickCapture={(event) => {
          // Safari does not focus buttons on pointer activation; remember the invoking control.
          const button = event.target instanceof Element ? event.target.closest('button') : null;
          button?.focus({ preventScroll: true });
        }}
        onKeyDownCapture={() => void sound.current?.unlock()}
      >
        <header className="topbar">
          <button
            className="brand-button"
            aria-label={translate('Money Tour, accueil')}
            onClick={() => (screen === 'game' ? setModal('leave') : goHome())}
          >
            <Logo />
          </button>
          <nav>
            <LanguagePicker compact />
            <button
              onClick={() => {
                setCreateSalon(false);
                if (!online) setResumeRequest(undefined);
                setModal('online');
              }}
            >
              {translate('Rejoindre un salon')}
            </button>
            <button
              className="icon-button"
              aria-label={translate('Réglages')}
              onClick={() => setModal('settings')}
            >
              <GameIcon name="settings" />
            </button>
          </nav>
        </header>
        {screen === 'menu' ? (
          <main className="landing">
            <section className="intro">
              <div className="eyebrow">
                <i />
                {translate(' LE GRAND TOUR DES BONNES AFFAIRES')}
              </div>
              <h1>
                {translate('Un archipel.')}
                <br />
                {translate('Mille ')}
                <em>{translate('fortunes.')}</em>
              </h1>
              <p className="intro-copy">
                {translate('Des villes à conquérir, des amis à défier.')}
                <br />
                {translate('Prenez les dés, votre prochaine aventure commence ici.')}
              </p>
              <div className="setup">
                <div className="setup-heading">
                  <h2>{translate('Votre billet pour l’aventure')}</h2>
                  <span>{translate('01 / DÉPART')}</span>
                </div>
                <div className="mode-tabs" role="group" aria-label={translate('Mode de jeu')}>
                  {(
                    [
                      ['local', 'Entre amis'],
                      ['public', 'En ligne'],
                      ['solo', 'Solo & bots'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={mode === value}
                      onClick={() => chooseMode(value)}
                    >
                      {translate(label)}
                    </button>
                  ))}
                </div>
                {mode === 'solo' && localSetup}
                {mode === 'public' ? (
                  <div className="public-home-actions">
                    <p className="public-home-intro">
                      {translate(
                        'Une table vous attend. Retrouvez des voyageurs et jouez sans invitation.',
                      )}
                    </p>
                    {(['find', 'create'] as const).map((target) => (
                      <button
                        key={target}
                        className={target === 'find' ? 'primary launch' : 'secondary local-launch'}
                        onClick={() => {
                          detachOnline();
                          setPublicMode(target);
                          setModal('online');
                        }}
                      >
                        {translate(
                          target === 'find' ? 'Trouver une partie' : 'Créer un salon public',
                        )}
                        {target === 'find' && <span aria-hidden="true"> →</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  (mode === 'solo' ? ['local', 'online'] : ['online', 'local']).map(
                    (target, index) => (
                      <button
                        key={target}
                        className={index === 0 ? 'primary launch' : 'secondary local-launch'}
                        onClick={() => {
                          if (target === 'local') {
                            if (mode === 'local') setModal('local-setup');
                            else if (save && !save.state.winner) setModal('new-game');
                            else start();
                          } else {
                            detachOnline();
                            setResumeRequest(undefined);
                            setSetupTurn(false);
                            setCreateSalon(true);
                            setModal('online');
                          }
                        }}
                        disabled={target === 'local' && mode === 'solo' && !validMinutes(minutes)}
                      >
                        {target === 'online'
                          ? translate('Créer un salon en ligne')
                          : save && !save.state.winner
                            ? translate('Nouvelle partie sur cet appareil')
                            : translate('Jouer sur cet appareil')}
                        {index === 0 && <span aria-hidden="true"> →</span>}
                      </button>
                    ),
                  )
                )}
                {mode !== 'public' && (
                  <button
                    className="secondary local-launch"
                    onClick={() => {
                      detachOnline();
                      setResumeRequest(undefined);
                      setCreateSalon(false);
                      setSetupTurn(true);
                      setModal('online');
                    }}
                  >
                    {translate('Configurer le serveur TURN')}
                  </button>
                )}
                {(online?.state || onlineResume) && (
                  <>
                    <button
                      className="resume"
                      onClick={() => {
                        if (online?.state) {
                          cinema.reset(online.state);
                          setScreen('game');
                          setPaused(false);
                        } else if (onlineResume) {
                          setResumeRequest(onlineResume);
                          setCreateSalon(false);
                          setModal('online');
                        }
                      }}
                    >
                      {translate('Reprendre ma partie en ligne')}
                    </button>
                    <p className="saved-progress">
                      {translate('Votre siège est conservé sur cet appareil pendant 24 h.')}
                    </p>
                  </>
                )}
                {save && (
                  <>
                    <button
                      className="resume"
                      onClick={() => {
                        detachOnline();
                        cinema.reset(save.state);
                        setScreen('game');
                        setPaused(false);
                      }}
                    >
                      ↻{' '}
                      {save.state.winner
                        ? translate('Revoir le dernier résultat')
                        : translate('Reprendre ma partie')}
                    </button>
                    <p className="saved-progress">
                      {translate('Partie conservée · tour ')}
                      {save.state.turn} ·{' '}
                      {translate(duration(save.state.durationMs - save.state.elapsedMs))}
                      {translate(' restantes')}
                    </p>
                  </>
                )}
                <p className="setup-note">
                  {mode === 'solo'
                    ? translate('Changez les sièges en bots pour observer une partie.')
                    : mode === 'public'
                      ? translate(
                          'Les places libres peuvent être complétées par des joueurs IA en attendant d’autres voyageurs.',
                        )
                      : translate(
                          'Invitez vos amis avec le lien du salon, chacun sur son écran.',
                        )}{' '}
                  {translate('Sauvegarde sur cet appareil.')}
                </p>
              </div>
            </section>
            {!nativePlatform() && (
              <section className="hero-map" aria-label={translate('Aperçu du plateau')}>
                <span className="map-stamp">
                  {translate('32 ESCALES')}
                  <br />
                  <b>{translate('∞ POSSIBILITÉS')}</b>
                </span>
                <Suspense
                  fallback={
                    <div className="board-shell">{translate('Préparation de l’archipel…')}</div>
                  }
                >
                  <Board state={demo} onTile={setSelected} reducedMotion demo />
                </Suspense>
                <div className="map-caption">
                  <span>{translate('✦ Créé pour les bons moments')}</span>
                  <span>{translate('2–4 voyageurs · dès maintenant')}</span>
                </div>
              </section>
            )}
            <div className="features">
              <div>
                <b>01</b>
                <span>
                  <strong>{translate('Tracez votre route')}</strong>
                  {translate('Achetez des villes et des îles privées.')}
                </span>
              </div>
              <div>
                <b>02</b>
                <span>
                  <strong>{translate('Voyez plus grand')}</strong>
                  {translate('Maisons, hôtels et festivals.')}
                </span>
              </div>
              <div>
                <b>03</b>
                <span>
                  <strong>{translate('Changez la donne')}</strong>
                  {translate('Une collection complète peut tout gagner.')}
                </span>
              </div>
            </div>
          </main>
        ) : (
          <main
            className={`game-layout play-scene ${!interactionDisabled && options.some((a) => a.type === 'insure') ? 'insurance-selecting' : ''}`}
          >
            <ArchipelagoBackdrop />
            {!paused && (
              <TurnBanner
                key={`${current.turn}-${active.id}`}
                player={active}
                self={online?.self}
                local={!online}
                color={colors[current.currentPlayer]!}
              />
            )}
            {!paused && !cinema.dismissed && cinema.frame.cue.kind === 'money' && (
              <MoneyFlight
                cue={cinema.frame.cue}
                state={current}
                reduced={reduced}
                onClose={cinema.dismiss}
              />
            )}
            <div className="game-top">
              <div>
                <span className="eyebrow">
                  {current.mode === 'teams'
                    ? translate('EXPÉDITION EN ÉQUIPE')
                    : online
                      ? translate(online.publicGame ? 'SALON PUBLIC' : 'SALON EN LIGNE')
                      : translate('PARTIE LOCALE')}{' '}
                  {translate('· TOUR DE JEU ')}
                  {current.turn}
                </span>
                <h1 className="game-title">{translate('Le tour de la fortune')}</h1>
                {online?.publicGame && current.players.some((player) => player.bot) && (
                  <p className="public-game-note">
                    {translate('Salon complété par des joueurs IA')}
                  </p>
                )}
              </div>
              <div className="game-tools">
                <button
                  className="icon-button"
                  aria-label={translate('Réglages de la partie')}
                  onClick={() => setModal('settings')}
                >
                  <GameIcon name="settings" />
                </button>
                <span className="clock" aria-label={translate('Temps restant')}>
                  <GameIcon name="clock" />{' '}
                  {translate(duration(current.durationMs - current.elapsedMs))}
                </span>
                <button
                  className="icon-button board-view-control"
                  aria-label={
                    inspectedOwner
                      ? translate('Tout afficher')
                      : mobile && boardPanned
                        ? translate('Recentrer mon pion')
                        : mobile && overview
                          ? translate('Suivre mon pion')
                          : translate('Vue globale')
                  }
                  title={
                    inspectedOwner
                      ? translate('Tout afficher')
                      : mobile && boardPanned
                        ? translate('Recentrer mon pion')
                        : mobile && overview
                          ? translate('Suivre mon pion')
                          : translate('Vue globale')
                  }
                  aria-pressed={mobile ? overview || boardPanned : undefined}
                  onClick={() => {
                    if (inspectedOwner) setInspectedOwner(null);
                    else if (mobile && boardPanned) {
                      setOverview(false);
                      setViewResetKey((key) => key + 1);
                    } else if (mobile) setOverview(!overview);
                    else {
                      setComfort((old) => ({ ...old, boardZoom: 100 }));
                      setViewResetKey((key) => key + 1);
                    }
                  }}
                >
                  <GameIcon name={mobile && boardPanned ? 'target' : 'compass'} />
                </button>
                <button
                  className="subtle"
                  onClick={togglePause}
                  aria-pressed={paused}
                  title={
                    online
                      ? translate('La pause est réservée au solo et au jeu local')
                      : translate('Suspendre le chrono et les bots')
                  }
                  disabled={!!current.winner || !!online}
                >
                  {paused ? translate('Reprendre') : translate('Pause')}
                </button>
                <button
                  className="icon-button"
                  aria-label={translate('Quitter la partie')}
                  onClick={() => setModal('leave')}
                >
                  <GameIcon name="exit" />
                </button>
              </div>
            </div>
            <SharedGameInfo key={online ? journey : save?.seed} state={current} mobile={mobile} />
            <PlayerProfiles
              state={current}
              self={online?.self}
              publicGame={online?.publicGame}
              mobile={mobile}
              inspectedOwner={inspectedOwner}
              onInspectOwner={setInspectedOwner}
              onTile={browseTile}
              onBonus={showBonus}
              onTaunt={canTaunt ? openTaunt : undefined}
            />
            <section className="board-area">
              <div className="board-viewport">
                <Suspense
                  fallback={
                    <div className="board-shell">{translate('Préparation du plateau…')}</div>
                  }
                >
                  <Board
                    state={display}
                    zoomPercent={comfort.boardZoom}
                    onReady={() => setBoardReady(true)}
                    auctionTile={current.auction?.tile}
                    strategicTiles={strategicTiles}
                    onPlayer={canTaunt ? openTaunt : undefined}
                    taunt={visibleTaunt ?? undefined}
                    mobile={mobile}
                    onZoomChange={(boardZoom) => setComfort((old) => ({ ...old, boardZoom }))}
                    onPanChange={setBoardPanned}
                    viewResetKey={viewResetKey}
                    overview={
                      (mobile && overview) ||
                      paused ||
                      Boolean(inspectedOwner) ||
                      !!current.auction ||
                      strategicTiles.length > 0
                    }
                    inspectedOwner={inspectedOwner}
                    self={online?.self}
                    insuranceFocus={
                      !interactionDisabled && options.some((a) => a.type === 'insure')
                    }
                    selecting={
                      !interactionDisabled &&
                      !(current.phase === 'debt' && debtDialog.hidden) &&
                      (options.some((a) => a.type === 'insure') ||
                        ['championship', 'attack', 'travel', 'debt'].includes(current.phase))
                    }
                    cue={cinema.frame.cue}
                    choices={interactionDisabled ? [] : boardOptions.map((a) => a.tile)}
                    onTile={chooseTile}
                    reducedMotion={reduced || paused}
                  />
                </Suspense>
                {strategicTiles.length > 0 && (
                  <div className="strategy-board-note" role="status">
                    <GameIcon name="target" />
                    <span>
                      {strategicTiles.length}
                      {translate(' cases repérées')}
                    </span>
                    <button
                      aria-label={translate('Effacer le repérage')}
                      onClick={() => setStrategicTiles([])}
                    >
                      <GameIcon name="close" />
                    </button>
                  </div>
                )}
                <EventCelebration
                  key={online ? journey : save?.seed}
                  cue={cinema.frame.cue}
                  state={current}
                  reduced={reduced}
                  paused={paused}
                />
              </div>
              <div className="roll-status" role="status">
                {inspectedOwner
                  ? formatText(
                      '{0} · {1} propriété(s)',
                      current.players.find((p) => p.id === inspectedOwner)?.name,
                      Object.values(current.properties).filter((p) => p.ownerId === inspectedOwner)
                        .length,
                    )
                  : cinema.frame.cue.kind === 'dice'
                    ? translate('Les dés roulent…')
                    : rolling
                      ? cinema.frame.cue.kind === 'hop'
                        ? translate('En route…')
                        : translate('Votre aventure continue…')
                      : mobile && boardOptions.length && !interactionDisabled
                        ? current.phase === 'championship'
                          ? translate('Touchez une propriété éclairée · Festival 50')
                          : translate('Touchez une case éclairée pour la choisir')
                        : display.dice.length
                          ? translate(
                              'Dés : ' +
                                display.dice.join(' + ') +
                                ' · ' +
                                display.dice.reduce((a, b) => a + b, 0) +
                                ' cases',
                            )
                          : formatText('Au tour de {0}', active.name)}
                {inspectedOwner && (
                  <button className="clear-owner" onClick={() => setInspectedOwner(null)}>
                    {translate('Tout afficher')}
                  </button>
                )}
              </div>
            </section>
            <aside className="game-sidebar">
              <ContextTip
                state={current}
                self={online?.self ?? active.id}
                disabled={
                  rolling ||
                  paused ||
                  !!modal ||
                  !!offer ||
                  !!tile ||
                  ['debt', 'island', 'championship', 'travel'].includes(current.phase)
                }
              />
              {sharedDialog.hidden && current.phase === 'duel' && (
                <button className="secondary" onClick={sharedDialog.reopen}>
                  {translate('Revoir le duel')}
                </button>
              )}
              {current.auction && auctionDialog.hidden && (
                <div className="auction-board-prompt">
                  <p role="status">
                    {translate(current.config.board[current.auction.tile]!.name)}
                    {translate(' est surlignée sur le plateau.')}
                  </p>
                  <button
                    className="primary"
                    onClick={auctionDialog.reopen}
                    disabled={rolling || paused}
                  >
                    {current.auction.stage === 'commit'
                      ? translate('Enchérir sur ')
                      : translate('Revoir les enchères · ')}
                    {translate(current.config.board[current.auction.tile]!.name)}
                  </button>
                </div>
              )}
              <section
                className={`action-card${current.phase === 'debt' && debtDialog.hidden ? ' debt-minimized' : ''}`}
                hidden={phaseCardOpen}
              >
                <span className="eyebrow">
                  {paused
                    ? translate('PARTIE EN PAUSE')
                    : decisionPlayer.bot
                      ? online?.publicGame
                        ? formatText('{0} réfléchit…', decisionPlayer.name)
                        : translate('UN BOT RÉFLÉCHIT…')
                      : online && online.self !== decisionPlayer.id
                        ? formatText('TOUR DE {0}', decisionPlayer.name.toUpperCase())
                        : formatText('À VOUS, {0}', decisionPlayer.name.toUpperCase())}
                </span>
                <h2>
                  {paused
                    ? translate('Une petite escale ?')
                    : decisionPlayer.bot || (online && online.self !== decisionPlayer.id)
                      ? formatText('{0} joue', decisionPlayer.name)
                      : translate(phaseText[current.phase])}
                </h2>
                <p
                  className={
                    (['championship', 'travel'].includes(current.phase) ||
                      (current.phase === 'debt' && debtDialog.hidden)) &&
                    !interactionDisabled
                      ? 'board-choice-hint'
                      : undefined
                  }
                >
                  {paused
                    ? translate('Le chrono et les bots vous attendent.')
                    : decisionPlayer.bot || (online && online.self !== decisionPlayer.id)
                      ? translate(
                          'Suivez son déplacement. Vos commandes seront disponibles à votre tour.',
                        )
                      : current.phase === 'championship'
                        ? festivalDescription
                        : current.phase === 'travel'
                          ? travelDescription
                          : current.phase === 'debt' && debtDialog.hidden
                            ? translate(
                                'La vente est réduite. Consultez vos propriétés sur le plateau, puis reprenez la vente.',
                              )
                            : translate(actionDescription)}
                </p>
                <div className="decision-time">
                  <span
                    style={{
                      width: `${Math.max(0, 100 - (current.decisionElapsedMs / config.actionTimeoutMs) * 100)}%`,
                    }}
                  />
                </div>
                {current.lastCard && !rolling && (
                  <div className="chance-card">
                    <small>{translate('✦ LA BONNE ÉTOILE')}</small>
                    <strong>
                      {translate(
                        festivalText(
                          current.config.cards.find((c) => c.id === current.lastCard)?.title,
                        ),
                      )}
                    </strong>
                    <p>
                      {translate(
                        propertyRulesText(
                          current.config.cards.find((c) => c.id === current.lastCard)?.description,
                        ),
                      )}
                    </p>
                  </div>
                )}
                {options.length > 0 &&
                  !['championship', 'travel'].includes(current.phase) &&
                  !(current.phase === 'debt' && debtDialog.hidden) &&
                  !interactionDisabled && (
                    <p className="board-choice-hint">
                      {translate('Cliquez directement sur une case dorée du plateau pour')}{' '}
                      {current.phase === 'travel'
                        ? translate('vous y déplacer')
                        : current.phase === 'attack'
                          ? translate('choisir votre cible')
                          : current.phase === 'debt'
                            ? translate('la vendre et régler votre dette')
                            : translate('l’assurer')}
                      .
                    </p>
                  )}
                {current.phase === 'property' &&
                  current.properties[active.position]?.ownerId === active.id &&
                  current.properties[active.position]?.level === 3 &&
                  current.config.hotelUnlockLaps !== undefined &&
                  active.laps < current.config.hotelUnlockLaps && (
                    <p className="board-choice-hint hotel-unlock-hint">
                      {translate('Hôtel après ')}
                      {current.config.hotelUnlockLaps}
                      {translate(' tours du plateau · ')}
                      {active.laps}/{current.config.hotelUnlockLaps}
                      {translate(' terminés.')}
                    </p>
                  )}
                <div className="actions">
                  {current.phase === 'debt' && debtDialog.hidden && !interactionDisabled && (
                    <button className="primary" ref={debtReopen} onClick={debtDialog.reopen}>
                      {translate('Reprendre la vente')}
                      <ActionClock />
                    </button>
                  )}
                  {options.some((a) => a.type === 'insure') && !interactionDisabled && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setInsuranceDecision(decisionKey);
                        setModal('insurance');
                      }}
                    >
                      <GameIcon name="shield" />
                      {translate('Choisir un bien à assurer')}
                    </button>
                  )}

                  {!active.bot &&
                    (!online || online.self === active.id) &&
                    available
                      .filter(
                        (a) =>
                          (current.phase !== 'debt' || a.type !== 'sell') &&
                          (!mobile || a.type !== 'sell'),
                      )
                      .map((a, i) => (
                        <button
                          key={`${a.type}-${'tile' in a ? a.tile : ''}`}
                          className={
                            i === 0 && a.type !== 'finish' && a.type !== 'decline_travel'
                              ? 'primary'
                              : 'secondary'
                          }
                          disabled={interactionDisabled}
                          onClick={() => {
                            if (!interactionDisabled) {
                              if (a.type === 'buyout') {
                                setBuyoutOfferKey(offerKey);
                                setDismissedOffer('');
                              } else if (
                                (a.type === 'buy' || a.type === 'upgrade') &&
                                eligibleOffer
                              )
                                setDismissedOffer('');
                              else act(a);
                            }
                          }}
                        >
                          <span>{translate(actionLabel(a))}</span>
                          <ActionClock />
                          {a.type === 'roll' && <GameIcon name="dice" />}
                        </button>
                      ))}
                </div>
                {online && (
                  <>
                    <p
                      className={`network-status ${online.blocked ? 'connection-blocked' : ''}`}
                      role="status"
                    >
                      {translate(online.status)}
                    </p>
                    {online.state?.players.find((p) => p.id === online.self)?.bot &&
                      !current.winner && (
                        <button
                          className="secondary reclaim-seat"
                          onClick={() =>
                            act({ type: 'set_control', playerId: online.self, bot: false })
                          }
                        >
                          {translate('Reprendre mon siège')}
                        </button>
                      )}
                  </>
                )}
                {active.bot && !current.winner && !online && (
                  <button
                    className="text-button"
                    onClick={() => act({ type: 'set_control', playerId: active.id, bot: false })}
                  >
                    {translate('Prendre la main sur ce bot')}
                  </button>
                )}
                {current.crisis && (
                  <p className="world-event-status">
                    {translate('📉 Crise économique · loyers −50 % · ')}
                    {current.crisis.remaining.length}
                    {translate(' joueur(s) doivent encore terminer leur tour')}
                  </p>
                )}
                {current.alliance && (
                  <p className="world-event-status">
                    🤝 {current.players.find((p) => p.id === current.alliance!.beneficiaryId)!.name}{' '}
                    {translate('reçoit 50 % des gains de')}{' '}
                    {current.players.find((p) => p.id === current.alliance!.targetId)!.name}
                  </p>
                )}
                <small className="action-help">
                  {translate('Retrouvez la règle spéciale de cette partie dans votre profil.')}
                </small>
              </section>
              <details className="live-actions">
                <summary>{translate('Historique de la partie')}</summary>
                <ol aria-live="polite">
                  {history.slice(0, 3).map((entry, i) => (
                    <li key={i}>{translate(entry)}</li>
                  ))}
                </ol>
                <button onClick={() => setModal('journal')}>
                  {translate('Toutes les actions ↗')}
                </button>
              </details>
              <div className="tip">
                <b>{translate('Le saviez-vous ?')}</b>
                <p>
                  {translate(
                    'Les quatre îles réunies rapportent 500 de loyer à chaque visite adverse.',
                  )}
                </p>
              </div>
            </aside>
          </main>
        )}
        <footer>
          <span>{translate('© Money Tour · Un jeu original, de bonnes histoires.')}</span>
          <div>
            <button onClick={() => setModal('credits')}>{translate('Crédits')}</button>
            <a href="https://github.com/Virtuel21/money-tour" target="_blank" rel="noreferrer">
              {translate('Le projet ↗')}
            </a>
          </div>
        </footer>
        {notice && (
          <div className="notice" role="status">
            {translate(notice)}
            <button aria-label={translate('Fermer le message')} onClick={() => setNotice('')}>
              {translate('×')}
            </button>
          </div>
        )}
        {modal === 'bonus' && selectedBonus && (
          <ActionCard
            cardKey={`bonus:${selectedBonus.title}`}
            title={translate(selectedBonus.title)}
            icon={selectedBonus.icon ?? 'card'}
            reducedMotion={reduced}
            onClose={() => setModal(null)}
            footer={(card) => (
              <button className="primary" onClick={() => card.run(() => setModal(null))}>
                {translate('Compris')}
              </button>
            )}
          >
            <p className="bonus-description">{translate(selectedBonus.description)}</p>
          </ActionCard>
        )}
        {modal === 'journal' && (
          <Modal title={translate('Journal des actions')} onClose={() => setModal(null)}>
            <p>
              {translate(
                'Les actions les plus récentes sont en haut. Les offres secrètes et les choix du duel restent cachés jusqu’au résultat.',
              )}
            </p>
            <ol className="action-history">
              {history.map((entry, i) => (
                <li key={i}>{translate(entry)}</li>
              ))}
            </ol>
            {!history.length && (
              <p>{translate('Les prochaines actions de cette session apparaîtront ici.')}</p>
            )}
          </Modal>
        )}
        {modal === 'pocket' && (
          <Modal title={translate('Mon carnet de voyage')} onClose={() => setModal(null)}>
            <MobilePocket
              onBonus={showBonus}
              key={current.turn}
              state={current}
              self={online?.self}
              onHighlight={(ids) => {
                setStrategicTiles(ids);
                setOverview(true);
                setInspectedOwner(null);
                setModal(null);
              }}
              onTile={browseTile}
            />
          </Modal>
        )}
        {modal === 'strategy' && (
          <Modal title={translate('Le cap vers la victoire')} onClose={() => setModal(null)}>
            <StrategyProgress
              state={current}
              playerId={online?.self ?? active.id}
              expanded
              onHighlight={(ids) => {
                setStrategicTiles(ids);
                setOverview(true);
                setInspectedOwner(null);
                setModal(null);
              }}
              onTile={(id) => {
                setSelected(id);
              }}
            />
          </Modal>
        )}
        {modal === 'credits' && (
          <Modal title={translate('Le carnet des créateurs')} onClose={() => setModal(null)}>
            <pre className="credits-text">
              {language === 'en' ? translate(creditsEnglish) : translate(credits)}
            </pre>
          </Modal>
        )}
        {modal === 'settings' && (
          <Modal
            title={translate('Votre confort de voyage')}
            onClose={() => setModal(null)}
            footer={
              <button className="primary" onClick={() => setModal(null)}>
                {translate('Terminé')}
              </button>
            }
          >
            <SettingsPanel
              comfort={comfort}
              setComfort={setComfort}
              audio={audioPrefs}
              setAudio={setAudioPrefs}
              reduced={reduced}
              setReduced={setReduced}
              sharedPace={online ? (online.state?.presentationPace ?? 'normal') : undefined}
              onPreview={() => {
                void sound.current?.unlock().then(() => sound.current?.effect('victory'));
              }}
            />
          </Modal>
        )}
        {modal === 'insurance' && insuranceAvailable && insuranceDecision === decisionKey && (
          <ActionCard
            cardKey={`${decisionKey}:${modal}`}
            title={translate('Choisir un bien à assurer')}
            ownerLabel={active.name}
            icon="shield"
            status={<ActionClock full />}
            reducedMotion={reduced}
            onClose={() => setModal(null)}
            footer={(card) => (
              <button className="secondary" onClick={() => card.run(() => setModal(null))}>
                {translate('Retour au plateau')}
              </button>
            )}
          >
            {(card) => (
              <MobileTiles
                state={current}
                choices={options.filter((a) => a.type === 'insure').map((a) => a.tile)}
                onTile={(id) => {
                  const action = options.find((a) => a.tile === id && a.type === 'insure');
                  if (action && !interactionDisabled)
                    card.run(() => {
                      dispatchDecision(action);
                      setModal(null);
                    });
                }}
              />
            )}
          </ActionCard>
        )}
        {modal === 'local-setup' && (
          <Modal
            title={translate('Jouer sur cet appareil')}
            onClose={() => setModal(null)}
            footer={
              <button
                className="primary"
                disabled={!validMinutes(minutes)}
                onClick={() => {
                  if (save && !save.state.winner) setModal('new-game');
                  else {
                    setModal(null);
                    start();
                  }
                }}
              >
                {translate('Lancer la partie')}
              </button>
            }
          >
            {localSetup}
          </Modal>
        )}
        {modal === 'new-game' && save && (
          <Modal
            title={translate('Commencer une nouvelle partie ?')}
            onClose={() => setModal(null)}
          >
            <p>
              {translate('Votre partie locale du tour ')}
              {save.state.turn}
              {translate(
                ' est conservée. Commencer une nouvelle partie remplacera cette sauvegarde sur cet appareil.',
              )}
            </p>
            <button
              className="primary"
              onClick={() => {
                detachOnline();
                cinema.reset(save.state);
                setScreen('game');
                setPaused(false);
                setModal(null);
              }}
            >
              {translate('Reprendre la partie conservée')}
            </button>
            <button className="secondary" onClick={() => setModal(null)}>
              {translate('Annuler')}
            </button>
            <button
              className="secondary danger-action"
              onClick={() => {
                setModal(null);
                start();
              }}
            >
              {translate('Remplacer et commencer')}
            </button>
          </Modal>
        )}
        {modal === 'invitation' && pendingInvitation && (
          <Modal
            title={translate('Une invitation vous attend')}
            onClose={() => {
              setPendingInvitation(null);
              setModal(null);
            }}
          >
            <p>
              {translate(
                'Votre partie locale reste sauvegardée. Une partie en ligne déjà lancée continue sans vous.',
              )}
            </p>
            <button className="primary" onClick={() => openNativeInvitation(pendingInvitation)}>
              {translate('Ouvrir l’invitation')}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setPendingInvitation(null);
                setModal(null);
              }}
            >
              {translate('Continuer la partie')}
            </button>
          </Modal>
        )}
        {modal === 'leave' && (
          <Modal
            title={translate('Voulez-vous quitter la partie ?')}
            onClose={() => setModal(null)}
          >
            <p>
              {online
                ? translate(
                    'La partie en ligne continue lorsque vous revenez à l’accueil. Abandonner élimine votre joueur.',
                  )
                : translate(
                    'Revenir à l’accueil conserve votre partie. Abandonner élimine le joueur actif de cette partie.',
                  )}
            </p>
            <button className="primary" onClick={() => setModal(null)}>
              {translate('Continuer la partie')}
            </button>
            <button
              className="secondary"
              onClick={() => {
                goHome();
                setModal(null);
              }}
            >
              {translate('Accueil et sauvegarde')}
            </button>
            <button
              className="secondary danger-action"
              onClick={() => {
                act({ type: 'quit', playerId: online?.self ?? active.id });
                setModal(null);
              }}
            >
              {online
                ? translate('Abandonner ma partie')
                : formatText('Abandonner pour {0}', active.name)}
            </button>
          </Modal>
        )}
        {offer && (
          <Modal title={translate(offer.tile.name)} onClose={() => setDismissedOffer(offerKey)}>
            <PurchaseDetails
              state={current}
              buyout={offer.buyout}
              onBuy={(level) =>
                act({
                  type: offer.buyout
                    ? 'buyout'
                    : current.properties[active.position]?.ownerId === active.id
                      ? 'upgrade'
                      : 'buy',
                  playerId: active.id,
                  level,
                })
              }
              onFraud={(level) => act({ type: 'buy_fraud', playerId: active.id, level })}
              onPass={() =>
                offer.buyout
                  ? setDismissedOffer(offerKey)
                  : act({ type: 'finish', playerId: active.id })
              }
            />
          </Modal>
        )}
        {screen === 'game' && !modal && !paused && (
          <DuelCard
            journey={save?.seed ?? journey}
            state={current}
            liveState={online?.state ?? save?.state ?? current}
            cue={cinema.frame.cue}
            busy={rolling}
            disabled={Boolean(online?.busy || online?.blocked)}
            self={online?.self}
            hidden={sharedDialog.hidden}
            reducedMotion={reduced}
            onClose={sharedDialog.onClose}
            act={dispatchDecision}
            dismissResult={dismissDrawnCard}
          />
        )}
        {screen === 'game' &&
          !interactionDisabled &&
          !modal &&
          !tile &&
          ['island', 'attack'].includes(current.phase) && (
            <ActionCard
              cardKey={decisionKey}
              title={translate(
                current.phase === 'island' ? 'Île perdue' : 'Choisir une propriété adverse',
              )}
              ownerLabel={active.name}
              icon={current.phase === 'island' ? 'island' : 'target'}
              status={<ActionClock full />}
              reducedMotion={reduced}
              footer={(card) => {
                const skip = legal.find((a) => a.type === 'finish');
                return skip ? (
                  <button
                    className="secondary"
                    onClick={() => card.run(() => dispatchDecision(skip))}
                  >
                    {translate(actionLabel(skip))}
                  </button>
                ) : null;
              }}
            >
              {(card) => (
                <>
                  <p>{translate(actionDescription)}</p>
                  <div className="decision-actions">
                    {legal
                      .filter((a) =>
                        ['attack', 'pay_bail', 'use_escape', 'attempt_escape'].includes(a.type),
                      )
                      .map((action, i) => (
                        <button
                          className={i === 0 ? 'primary' : 'secondary'}
                          key={`${action.type}:${'tile' in action ? action.tile : ''}`}
                          onClick={() => card.run(() => dispatchDecision(action))}
                        >
                          {translate(actionLabel(action))}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </ActionCard>
          )}
        {screen === 'game' &&
          !tile &&
          !interactionDisabled &&
          !modal &&
          current.phase === 'alliance' && (
            <ActionCard
              cardKey={decisionKey}
              reducedMotion={reduced}
              ownerLabel={decisionPlayer.name}
              icon="people"
              status={<ActionClock full />}
              title={translate('Choisissez votre alliance')}
            >
              {(card) => (
                <>
                  <p>
                    {translate(
                      'Recevez 50 % des gains du joueur choisi jusqu’à la fin de son prochain tour. Cette part est prélevée sur ses gains.',
                    )}
                  </p>
                  <div className="decision-actions">
                    {legal
                      .filter((a) => a.type === 'alliance')
                      .map(
                        (a) =>
                          a.type === 'alliance' && (
                            <button
                              className="primary"
                              key={a.targetId}
                              onClick={() => card.run(() => dispatchDecision(a))}
                            >
                              {translate('Choisir ')}
                              {current.players.find((p) => p.id === a.targetId)!.name}
                              <ActionClock />
                            </button>
                          ),
                      )}
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      card.run(() => dispatchDecision({ type: 'finish', playerId: active.id }))
                    }
                  >
                    {translate('Passer ')}
                    <ActionClock />
                  </button>
                </>
              )}
            </ActionCard>
          )}
        {screen === 'game' &&
          !rolling &&
          !paused &&
          !modal &&
          current.phase === 'auction' &&
          !auctionDialog.hidden &&
          current.auction && (
            <Modal
              onClose={auctionDialog.close}
              title={
                current.auction.kind === 'market'
                  ? translate('Le marché flottant')
                  : translate('Les appels d’offres')
              }
            >
              <AuctionView
                key={current.auction.id}
                gameKey={online?.self ?? save?.seed}
                state={current}
                self={online?.self}
                act={act}
                disabled={Boolean(online?.busy || online?.blocked)}
              />
            </Modal>
          )}
        {screen === 'game' &&
          !tile &&
          !modal &&
          !paused &&
          ((current.phase === 'casino' &&
            !rolling &&
            !decisionPlayer.bot &&
            !current.winner &&
            (!online || online.self === decisionPlayer.id)) ||
            (!cinema.dismissed && cinema.frame.cue.kind === 'casino')) && (
            <ActionCard
              cardKey={[
                save?.seed ?? journey,
                current.turn,
                active.id,
                active.position,
                'casino',
              ].join(':')}
              reducedMotion={reduced}
              ownerLabel={active.name}
              icon="dice"
              status={cinema.frame.cue.kind !== 'casino' && <ActionClock full />}
              title={translate(
                cinema.frame.cue.kind === 'casino'
                  ? 'Le casino joue pour vous'
                  : 'Bienvenue au casino',
              )}
              onClose={cinema.frame.cue.kind === 'casino' ? dismissDrawnCard : undefined}
              footer={
                cinema.frame.cue.kind === 'casino'
                  ? (card) => (
                      <button className="secondary" onClick={() => card.run(dismissDrawnCard)}>
                        {translate('Passer l’animation')}
                      </button>
                    )
                  : undefined
              }
            >
              {(card) => (
                <CasinoView
                  state={current}
                  cue={cinema.frame.cue.kind === 'casino' ? cinema.frame.cue : undefined}
                  disabled={Boolean(online?.busy || online?.blocked)}
                  act={(action) =>
                    action.type === 'finish'
                      ? card.run(() => dispatchDecision(action))
                      : dispatchDecision(action)
                  }
                />
              )}
            </ActionCard>
          )}
        {screen === 'game' && !paused && cinema.notice && (
          <aside
            className={`routine-notice ${cinema.notice.reason === 'duel_cancelled' ? 'passive-duel-notice' : 'passive-insurance-notice'}`}
            role="status"
          >
            <GameIcon name={cinema.notice.reason === 'duel_cancelled' ? 'target' : 'shield'} />
            <p>{translate(cinema.notice.message)}</p>
            <button aria-label={translate('Masquer l’information')} onClick={cinema.dismissNotice}>
              <GameIcon name="close" />
            </button>
          </aside>
        )}
        {screen === 'game' &&
          !modal &&
          !tile &&
          !paused &&
          !cinema.dismissed &&
          cinema.frame.cue.kind === 'notice' &&
          cinema.frame.cue.reason !== 'auction_started' &&
          !isDuelNotice(cinema.frame.cue) &&
          (['insured_tile', 'alliance_expired', 'crisis_expired', 'roaches_expired'].includes(
            cinema.frame.cue.reason ?? '',
          ) ? (
            <div className="routine-notice" role="status">
              <GameIcon name="info" />
              <p>{translate(cinema.frame.cue.message)}</p>
              <button
                onClick={() => {
                  cinema.dismiss();
                  setModal('journal');
                }}
              >
                {translate('Journal')}
              </button>
              <button aria-label={translate('Masquer l’information')} onClick={cinema.dismiss}>
                <GameIcon name="close" />
              </button>
            </div>
          ) : (
            <ActionCard
              cardKey={drawnCardKey}
              reducedMotion={reduced}
              icon={cinema.frame.cue.reason === 'insured' ? 'shield' : 'sparkles'}
              onClose={dismissDrawnCard}
              footer={(card) => (
                <button className="primary" onClick={() => card.run(dismissDrawnCard)}>
                  {translate('Continuer')}
                </button>
              )}
              title={
                cinema.frame.cue.reason === 'victory_warning'
                  ? translate('Monopole en vue !')
                  : cinema.frame.cue.reason === 'earthquake'
                    ? translate('Tremblement de terre !')
                    : cinema.frame.cue.reason === 'quest_completed'
                      ? translate('Palier Mystère accompli !')
                      : cinema.frame.cue.reason === 'capital_revealed'
                        ? translate('La Capitale est révélée !')
                        : cinema.frame.cue.reason === 'auction_started'
                          ? translate('Préparez vos enveloppes !')
                          : cinema.frame.cue.reason === 'auction_result'
                            ? translate('Le résultat des enchères')
                            : cinema.frame.cue.reason === 'duel_result'
                              ? translate('Le duel est joué !')
                              : cinema.frame.cue.reason === 'crisis'
                                ? translate('Crise économique')
                                : cinema.frame.cue.reason === 'alliance'
                                  ? translate('Une alliance est née')
                                  : translate('Votre aventure continue')
              }
            >
              <p className="event-notice">{translate(cinema.frame.cue.message)}</p>
            </ActionCard>
          ))}
        {screen === 'game' &&
          !tile &&
          !interactionDisabled &&
          !modal &&
          current.phase === 'rent' && (
            <ActionCard
              cardKey={decisionKey}
              reducedMotion={reduced}
              ownerLabel={decisionPlayer.name}
              icon="card"
              status={<ActionClock full />}
              title={translate('Un loyer… ou votre carte Squatteur ?')}
            >
              {(card) => (
                <>
                  <p>
                    {translate('Vous arrivez à ')}
                    {translate(current.config.board[active.position]?.name)}
                    {translate('. Le loyer est de')}{' '}
                    {translate(money(current.pendingRent?.amount ?? 0))}.
                  </p>
                  <p>{translate('La carte Squatteur annule ce paiement et sera défaussée.')}</p>
                  <div className="decision-actions">
                    {available
                      .filter((a) => ['use_squatter', 'pay_rent'].includes(a.type))
                      .map((a) => (
                        <button
                          className={a.type === 'use_squatter' ? 'primary' : 'secondary'}
                          key={a.type}
                          onClick={() => card.run(() => dispatchDecision(a))}
                        >
                          {translate(actionLabel(a))}
                          <ActionClock />
                        </button>
                      ))}
                  </div>
                </>
              )}
            </ActionCard>
          )}
        {screen === 'game' &&
          !tile &&
          !interactionDisabled &&
          !modal &&
          current.phase === 'debt' &&
          !debtDialog.hidden && (
            <ActionCard
              cardKey={decisionKey}
              reducedMotion={reduced}
              ownerLabel={decisionPlayer.name}
              icon="coin"
              status={<ActionClock full />}
              title={translate('Réglons cette dette ensemble')}
              onMinimize={() => {
                setOverview(true);
                debtDialog.onClose?.();
              }}
            >
              {(card) => (
                <div className="debt-card-layout">
                  <div className="debt-card-summary">
                    <p>
                      {translate('À payer : ')}
                      <strong>{translate(money(current.debt!.amount))}</strong>
                      {translate(' · En banque :')} {translate(money(active.cash))}.
                    </p>
                    <p>
                      {translate('Il manque ')}
                      <strong>{translate(money(current.debt!.amount - active.cash))}</strong>
                      {translate(
                        '. Choisissez les biens à vendre. Le paiement se règle dès que le total suffit.',
                      )}
                    </p>
                    <p>
                      {translate('Valeur vendable totale :')}{' '}
                      <strong>
                        {translate(
                          money(
                            legal
                              .filter((a) => a.type === 'sell')
                              .reduce(
                                (sum, a) =>
                                  sum +
                                  Math.floor(
                                    getPropertyValue(current, 'tile' in a ? a.tile : 0) *
                                      current.config.resaleRate,
                                  ),
                                0,
                              ),
                          ),
                        )}
                      </strong>
                      .
                    </p>
                  </div>
                  <div className="debt-card-choices">
                    {mobile ? (
                      <MobileTiles
                        state={current}
                        choices={options.map((a) => a.tile)}
                        onTile={(id) => {
                          const action = options.find((a) => a.tile === id);
                          if (action) card.run(() => dispatchDecision(action));
                        }}
                      />
                    ) : (
                      <div className="decision-actions">
                        {available
                          .filter((a) => a.type === 'sell')
                          .map((a) => (
                            <button
                              className="secondary"
                              key={'tile' in a ? a.tile : a.type}
                              onClick={() => card.run(() => dispatchDecision(a))}
                            >
                              {translate(actionLabel(a))}
                              <ActionClock />
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </ActionCard>
          )}
        {modal === 'taunt' && tauntSender && screen === 'game' && (
          <ActionCard
            cardKey={`taunt:${tauntSender}:${tauntTarget}`}
            reducedMotion={reduced}
            icon="people"
            title={translate('À vous de taquiner !')}
            onClose={() => setModal(null)}
          >
            {(card) => (
              <TauntMenu
                state={current}
                playerId={tauntSender}
                targetId={tauntTarget}
                cooling={!!tauntReadyAt}
                onSend={(kind) => card.run(() => sendTaunt(kind))}
              />
            )}
          </ActionCard>
        )}
        {tile && !offer && (
          <TileDetailsDialog
            property={!!tile.price}
            cardKey={`tile:${tile.id}`}
            title={translate(tileTitle(tile))}
            onClose={() => setSelected(null)}
            reducedMotion={reduced}
          >
            {(close) => (
              <>
                <div className="property-hero" style={{ background: tile.color ?? '#e6b94a' }}>
                  {tile.type === 'city' ? (
                    <BuildingIllustration level={property?.level || 1} cityName={tile.name} />
                  ) : (
                    <span>{tile.type === 'resort' ? '☀' : '✦'}</span>
                  )}
                  <p>
                    {property?.ownerId
                      ? formatText(
                          'Propriété de {0}',
                          current.players.find((p) => p.id === property.ownerId)?.name,
                        )
                      : tile.price
                        ? translate('Cette escale attend son propriétaire.')
                        : translate('Une escale spéciale de votre voyage.')}
                  </p>
                </div>
                {tile.type === 'city' && (
                  <p className="architecture-name">
                    {translate(architectureLabels[architectureForCity(tile.name)])}
                  </p>
                )}
                {!!tile.price && (
                  <PropertyInsight
                    state={current}
                    tileId={tile.id}
                    playerId={online?.self ?? active.id}
                    onTile={setSelected}
                  />
                )}
                {!!property?.roachTurns && (
                  <p className="roach-warning">
                    {translate('🪳 Hôtel de ')}
                    {translate(tile.name)}
                    {translate(' infesté · loyer −50 % · encore ')}
                    {property.roachTurns}
                    {translate(' retours du tour de son propriétaire.')}
                  </p>
                )}
                {tile.price ? (
                  <>
                    <div className="property-stats">
                      <div>
                        <small>{translate('Terrain')}</small>
                        <strong>{translate(money(tile.price))}</strong>
                      </div>
                    </div>
                    {tile.type === 'resort' && (
                      <p>
                        {translate(
                          'Collection d’îles : 1 → 50 · 2 → 100 · 3 → 200 · 4 → 500 de loyer.',
                        )}
                      </p>
                    )}
                    {tile.rents && (
                      <div className="rent-table">
                        {tile.rents.map((rent, level) => (
                          <div
                            key={level}
                            className={
                              property?.ownerId && property.level === level ? 'selected' : ''
                            }
                          >
                            <span>
                              {translate(
                                ['Terrain', 'Maison 1', 'Maison 2', 'Maison 3', 'Hôtel'][level],
                              )}
                            </span>
                            <b>{translate(money(rent, true))}</b>
                          </div>
                        ))}
                      </div>
                    )}
                    <p>
                      {reservedCity(current, tile.id)
                        ? translate('Ville réservée au Marché flottant du tour de table 10. ')
                        : ''}
                    </p>
                  </>
                ) : (
                  <p>
                    {tile.type === 'start'
                      ? translate('Chaque passage en avant rapporte 300.')
                      : tile.type === 'island'
                        ? translate(
                            'Jusqu’à trois tours sur l’île. Sortez par un double, un billet ou 200.',
                          )
                        : tile.type === 'championship'
                          ? translate(
                              'Pour 50, doublez le loyer d’une de vos villes ou îles pendant 4 de vos tours. Un nouveau Festival renouvelle la durée, sans cumuler le bonus.',
                            )
                          : tile.type === 'travel'
                            ? translate(
                                current.config.travelToRivals
                                  ? 'Au prochain tour, voyagez pour 50 vers n’importe quelle case, y compris chez un adversaire.'
                                  : 'Au prochain tour, voyagez pour 50 vers une case libre ou alliée.',
                              )
                            : tile.type === 'tax'
                              ? translate(
                                  'Vous payez 50 plus 10 % de la valeur foncière de vos propriétés.',
                                )
                              : translate(
                                  'Une des dix-huit cartes peut transformer votre voyage, y compris des attaques contre vos adversaires.',
                                )}
                  </p>
                )}
                <button className="secondary" onClick={close}>
                  {modal === 'pocket'
                    ? translate('Retour au carnet')
                    : modal === 'strategy'
                      ? translate('Retour à ma stratégie')
                      : translate('Retour au plateau')}
                </button>
              </>
            )}
          </TileDetailsDialog>
        )}
        {screen === 'game' &&
          !modal &&
          !tile &&
          !cinema.dismissed &&
          cinema.frame.cue.kind === 'tax' && (
            <DrawnCard
              cardKey={drawnCardKey}
              tone="tax"
              reducedMotion={reduced}
              ownerLabel={
                translate('Carte de ') +
                (current.players.find((p) => p.id === cinema.frame.cue.playerId)?.name ??
                  active.name)
              }
              title={translate('Avis de taxe')}
              artwork={import.meta.env.BASE_URL + 'textures/tax-tile-v2.webp'}
              actionLabel={translate('Aïe, j’ai compris !')}
              onDismiss={dismissDrawnCard}
            >
              <p>
                {current.players.find((p) => p.id === cinema.frame.cue.playerId)?.name}
                {translate(' · somme à régler')}
              </p>
              <strong className="tax-amount">
                {translate(money(cinema.frame.cue.amount ?? 0))}
              </strong>
              <p className="drawn-card-news">
                {translate(
                  [
                    'Le président augmente encore le prix de l’essence. Même votre pion fait le plein !',
                    'Oups, dissolution de l’assemblée ! L’inflation explose… votre portefeuille demande des vacances.',
                    'Le président américain augmente les droits de douane. Vos souvenirs passent à la caisse !',
                  ][(current.turn + (cinema.frame.cue.tile ?? 0)) % 3],
                )}
              </p>
              <p>
                {cinema.frame.cue.reason === 'fraud' ? (
                  'Contrôle fiscal ! Votre achat à prix réduit entraîne une taxe égale à deux fois le prix normal de la propriété. Le contrôle clôt ce risque.'
                ) : (
                  <>
                    {translate('Taxe : ')}
                    {translate(money(current.config.taxBase ?? 0, true))} +{' '}
                    {current.config.taxRate * 100}
                    {translate(' % de votre patrimoine immobilier.')}
                  </>
                )}
              </p>
            </DrawnCard>
          )}
        {screen === 'game' &&
          !modal &&
          !tile &&
          !cinema.dismissed &&
          cinema.frame.cue.kind === 'card' && (
            <DrawnCard
              cardKey={drawnCardKey}
              reducedMotion={reduced}
              ownerLabel={
                translate('Carte de ') +
                (current.players.find((p) => p.id === cinema.frame.cue.playerId)?.name ??
                  active.name)
              }
              title={translate(
                festivalText(
                  current.config.cards.find((c) => c.id === cinema.frame.cue.cardId)?.title,
                ),
              )}
              description={translate(
                propertyRulesText(
                  current.config.cards.find((c) => c.id === cinema.frame.cue.cardId)?.description,
                ),
              )}
              artworkAlt={translate('Une enveloppe pleine de surprises')}
              actionLabel={translate('J’ai lu · continuer')}
              onDismiss={dismissDrawnCard}
            />
          )}
        <Suspense fallback={<div className="notice">{translate('Ouverture du salon…')}</div>}>
          {(modal === 'online' || online) && (
            <OnlineLobby
              key={lobbyKey}
              open={modal === 'online'}
              autoCreate={createSalon}
              publicMode={publicMode}
              setupTurn={setupTurn}
              resume={resumeRequest}
              defaults={{
                name: names[0]!,
                count,
                minutes,
                pace: comfort.pace,
              }}
              onClose={() => {
                setSetupTurn(false);
                setModal(null);
                if (online?.state) setScreen('game');
              }}
              onSession={(session) => {
                onlineSession.current = session;
              }}
              onLeave={() => {
                setOnlineResume(loadOnlineResume());
                setResumeRequest(undefined);
                setCreateSalon(false);
                setPublicMode(undefined);
                onlineSession.current = null;
                setOnline(null);
                onlineSeq.current = -1;
                goHome();
                setHistory([]);
              }}
              onView={(view) => {
                setOnline(view);
                if (view.state && view.state.seq !== onlineSeq.current) {
                  const newJourney = onlineSeq.current < 0 || view.state.seq < onlineSeq.current;
                  if (newJourney) {
                    cinema.reset(view.state);
                    setJourney((value) => value + 1);
                    setDismissedOffer('');
                    setBuyoutOfferKey('');
                    setHistory([]);
                    setSelected(null);
                    setStrategicTiles([]);
                    setScreen('game');
                    setModal(null);
                    setPaused(false);
                  }
                  onlineSeq.current = view.state.seq;
                  if (!newJourney && screen === 'game') cinema.present(view.state, view.events);
                  else cinema.reset(view.state);
                  const messages = view.events
                    .map((event) => eventText(event, view.state!))
                    .filter(Boolean);
                  if (messages.length) setHistory((old) => [...messages.reverse(), ...old]);
                }
              }}
            />
          )}
        </Suspense>
        {adventureHeld && (
          <AdventureStart
            key={online?.startGate?.id ?? save?.seed}
            state={online?.state ?? save!.state}
            deadline={online?.startGate?.deadline ?? localStartDeadline!}
            participants={online?.startGate?.participants}
            participantNames={
              online
                ? Object.fromEntries(online.members.map((member) => [member.id, member.name]))
                : undefined
            }
            ready={online?.startGate?.ready}
            self={online?.selfIdentity ?? online?.self}
            onReady={() => {
              if (onlineSession.current) void onlineSession.current.readyAdventure();
              else readyLocalAdventure();
            }}
          />
        )}
        {screen === 'game' && current.winner && !rolling && (
          <ActionCard
            cardKey={`winner:${current.turn}`}
            reducedMotion={reduced}
            icon="trophy"
            title={translate('Une fortune à célébrer !')}
            onClose={goHome}
          >
            {(card) => (
              <>
                <div className="victory-art">
                  ✦<span>♜</span>✦
                </div>
                <p className="winner-name">
                  {current
                    .winner!.playerIds.map((id) => current.players.find((p) => p.id === id)?.name)
                    .join(' & ')}
                </p>
                <p className="winner-reason">
                  {current.winner!.reasons.map((r) => translate(victoryText[r] ?? r)).join(' · ')}
                </p>
                <GameResults
                  state={current}
                  stats={online ? online.stats : save?.stats}
                  onRematch={
                    !online || (online.selfIdentity ?? online.self) === online.host
                      ? () => card.run(rematch)
                      : undefined
                  }
                  rematchDisabled={!!online && (online.busy || online.blocked)}
                  rematchLabel={
                    online && (online.selfIdentity ?? online.self) !== online.host
                      ? 'L’hôte peut lancer la revanche dans ce salon.'
                      : undefined
                  }
                />
                <button className="secondary" onClick={() => card.run(goHome)}>
                  {translate('Retour à l’accueil')}
                </button>
              </>
            )}
          </ActionCard>
        )}
      </div>
    </GameProviders>
  );
}
