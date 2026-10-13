import { useAuctionDialog } from './game/useAuctionDialog';
import { StrategyProgress } from './game/StrategyProgress';
import { publicVictoryProgress } from './game/strategy';
import { PropertyInsight } from './game/PropertyInsight';
import { GameIcon } from './game/GameIcon';
import { BuildingIllustration } from './game/BuildingIllustration';
import { architectureForCity, architectureLabels } from './game/architecture';
import { EventCelebration } from './game/EventCelebration';
import { loadComfort, saveComfort } from './game/comfort';
import { guardGameNavigation } from './game/navigationGuard';
import { loadOnlineResume, type OnlineResume } from './network/storage';
import { invitationCode } from './network/invitation';
import { MIN_BOARD_ZOOM, MAX_BOARD_ZOOM, normalizeBoardZoom } from './board/camera';
import { ContextTip } from './game/ContextTip';
import { GameResults } from './game/GameResults';
import { rematchOptions } from './game/gameStats';
import { useAuctionReveal } from './game/useAuctionReveal';
import { useSpectatorDialog } from './game/useSpectatorDialog';
import { victoryThreats } from '@money-tour/engine';
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
import { AdventureBanner, PrivateQuest, PlayerInventory } from './game/AdventureHUD';
import { ActionClock, GameClockContext } from './game/ActionClock';
import { createContext, useContext, lazy, Suspense, useEffect, useRef, useState } from 'react';
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
  type GameEvent,
} from '@money-tour/engine';
const Board = lazy(() => import('./board/Board3D'));
import { usePresentation } from './game/usePresentation';
import { DurationPicker, validMinutes } from './game/DurationPicker';
import { previewScenario } from './game/preview';
import { Soundscape, loadAudio } from './audio/synth';
const OnlineLobby = lazy(() => import('./network/OnlineLobby'));
const GuidedTutorial = lazy(() => import('./game/GuidedTutorial'));
const DebugPanel = lazy(() =>
  import('./game/DebugPanel').then((module) => ({ default: module.DebugPanel })),
);
import { applyDebug, loadDebug, newDebug, persistDebug, type DebugCommand } from './game/debug';
import './game/debug.css';
import type { Session, SessionView } from './network/session';
import {
  applyLocal,
  colors,
  duration,
  loadLocal,
  money,
  newLocal,
  pawnNames,
  persistLocal,
  phaseText,
  victoryText,
  type LocalSave,
} from './game/local';
import { MoneyFlight, TurnBanner } from './game/GameFeedback';
import { purchaseOffer, PurchaseDetails } from './game/PurchaseOffer';
import { DuelView } from './game/DuelView';
import { CasinoView } from './game/CasinoView';
import credits from '../../../CREDITS.md?raw';

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
        MONEY <b>TOUR</b>
      </span>
    </span>
  );
}
const DebugAccessContext = createContext<(() => void) | null>(null);

function GameProviders({
  value,
  onDebug,
  children,
}: {
  value: { state: GameState | null; held: boolean };
  onDebug: (() => void) | null;
  children: React.ReactNode;
}) {
  return (
    <DebugAccessContext.Provider value={onDebug}>
      <GameClockContext.Provider value={value}>{children}</GameClockContext.Provider>
    </DebugAccessContext.Provider>
  );
}

function Modal({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openDebug = useContext(DebugAccessContext);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
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
        <h2>{title}</h2>
        {openDebug && className !== 'debug-modal' && (
          <button className="debug-access" onClick={openDebug}>
            Debug
          </button>
        )}
        {onClose && (
          <button aria-label="Fermer" className="icon-button" onClick={onClose}>
            <GameIcon name="close" />
          </button>
        )}
      </div>
      {children}
    </dialog>
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
  const mobile = useMobile();
  const [overview, setOverview] = useState(false);
  const [boardPanned, setBoardPanned] = useState(false);
  const [viewResetKey, setViewResetKey] = useState(0);
  const [strategicTiles, setStrategicTiles] = useState<number[]>([]);
  const [comfort, setComfort] = useState(loadComfort);
  const [journey, setJourney] = useState(0);
  useEffect(() => saveComfort(comfort), [comfort]);
  const [boardReady, setBoardReady] = useState(false);
  const [inspectedOwner, setInspectedOwner] = useState<string | null>(null);
  const [collapsedPlayers, setCollapsedPlayers] = useState<Record<string, boolean>>({});
  const [save, setSave] = useState<LocalSave | null>(() => previewScenario() ?? loadLocal());
  const [debugResume, setDebugResume] = useState(loadDebug);
  const [debugUndo, setDebugUndo] = useState<LocalSave[]>([]);
  const [screen, setScreen] = useState<'menu' | 'game'>(() =>
    previewScenario() ? 'game' : 'menu',
  );
  const [modal, setModal] = useState<
    | 'tutorial'
    | 'rules'
    | 'credits'
    | 'settings'
    | 'tiles'
    | 'leave'
    | 'online'
    | 'pocket'
    | 'bonus'
    | 'journal'
    | 'strategy'
    | 'taunt'
    | 'debug'
    | null
  >(location.hash.includes('room=') ? 'online' : null);
  const [selectedBonus, setSelectedBonus] = useState<BonusInfo | null>(null);
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
  const [online, setOnline] = useState<SessionView | null>(null);
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
    [mode, setMode] = useState<'solo' | 'local' | 'teams'>('solo');
  const [minutes, setMinutes] = useState(20),
    [names, setNames] = useState(['Vous', 'Sacha', 'Lou', 'Noa']);
  const [bots, setBots] = useState([false, true, true, true]);
  const tutorialPause = useRef(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [history, setHistory] = useState<string[]>(save?.history ?? []),
    [notice, setNotice] = useState('');
  const debugging = !!save?.debug && !online;
  const debugOpen = debugging && modal === 'debug';
  const debugFreezeTime = debugging && !!save?.debug?.freezeTime;
  const debugFreezeBots = debugging && !!save?.debug?.freezeBots;
  const openDebug = () => {
    setSelected(null);
    setModal('debug');
  };
  useEffect(() => {
    if (!debugging || screen !== 'game') return;
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return;
      event.preventDefault();
      setSelected(null);
      setModal((previous) => (previous === 'debug' ? null : 'debug'));
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [debugging, screen]);
  const dispatchRef = useRef<(action: GameAction) => void>(() => {});
  const cinema = usePresentation(
    save?.state ?? demo,
    reduced,
    !!online,
    online ? (online.state?.presentationPace ?? 'normal') : comfort.pace,
    paused || debugOpen,
  );
  const rolling = cinema.busy;
  const turnKey = (online?.state ?? save?.state)?.turn;
  useEffect(() => {
    setOverview(false);
    setInspectedOwner(null);
    setStrategicTiles([]);
  }, [turnKey]);
  const display = cinema.frame.state;
  useEffect(() => {
    sound.current?.setScene(screen);
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
    setScreen('menu');
    setPaused(true);
    setSelected(null);
    setModal(null);
    if (debugging) {
      const normal = loadLocal();
      setSave(normal);
      setHistory(normal?.history ?? []);
    }
  };
  const rematch = () => {
    if (!current.winner) return;
    if (onlineSession.current) {
      void onlineSession.current.rematch();
      return;
    }
    const fresh = newLocal({
      ...rematchOptions(current),
      presentationPace: comfort.pace,
      ...(debugging ? { config: current.config } : {}),
    });
    const next = debugging ? newDebug(fresh) : fresh;
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
  const current =
    screen === 'game' ? (rolling ? display : (online?.state ?? save?.state ?? demo)) : demo;
  const active = current.players[current.currentPlayer]!;
  const victoryProgress = publicVictoryProgress(current, online?.self ?? active.id);
  const warnings = victoryThreats(current);
  const humans = current.players.filter((p) => !p.bot && !p.eliminated);
  const canTaunt =
    !paused &&
    !current.winner &&
    (online ? humans.some((p) => p.id === online.self) : humans.length > 0);
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
  const sharedDialog = useSpectatorDialog(
    `${current.turn}:${current.phase}:${current.duel?.id ?? current.auction?.id ?? ''}:${current.duel?.stage ?? current.auction?.stage ?? ''}:${decisionPlayer.id}`,
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
    if (screen !== 'game' || debugOpen || (paused && action.type !== 'quit')) return;
    if (action.type !== 'tick') setInspectedOwner(null);
    if (['roll', 'attempt_escape', 'travel'].includes(action.type)) setOverview(false);
    if (onlineSession.current) {
      if (!('playerId' in action) || action.playerId !== online?.self) return;
      if (rolling && !['quit', 'set_control'].includes(action.type)) return;
      void onlineSession.current.intent(action);
      return;
    }
    if (!save) return;
    const { save: next, result } = applyLocal(save, action);
    if (result.error) {
      setNotice('Cette action n’est plus disponible.');
      return;
    }
    if (debugging && action.type !== 'tick') setDebugUndo((old) => [...old.slice(-19), save]);
    cinema.present(next.state, result.events);
    const messages = result.events.map((e) => eventText(e, next.state)).filter(Boolean);
    next.history = [...messages.slice().reverse(), ...history];
    setSave(next);
    if (messages.length) setHistory((old) => [...messages.reverse(), ...old]);
  };
  dispatchRef.current = act;
  useEffect(() => {
    if (save?.debug) {
      setDebugResume(save);
      if (!persistDebug(save))
        setNotice('Le scénario debug ne peut pas être sauvegardé. Exportez-le avant de fermer.');
    } else if (save && !previewScenario() && !persistLocal(save))
      setNotice('Le navigateur ne permet pas la sauvegarde locale. Gardez cet onglet ouvert.');
  }, [save]);
  useEffect(() => {
    if (
      (previewScenario() && new URLSearchParams(location.search).get('clock') !== '1') ||
      online ||
      debugOpen ||
      debugFreezeTime ||
      screen !== 'game' ||
      paused ||
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
    paused,
    rolling,
    Boolean(current.winner),
    Boolean(online),
    debugOpen,
    debugFreezeTime,
  ]);
  useEffect(() => {
    if (
      online ||
      debugOpen ||
      debugFreezeBots ||
      screen !== 'game' ||
      paused ||
      rolling ||
      current.winner ||
      !decisionPlayer.bot
    )
      return;
    const timer = setTimeout(() => dispatchRef.current(chooseBotAction(current)), 650);
    return () => clearTimeout(timer);
  }, [save, screen, paused, rolling, Boolean(online), debugOpen, debugFreezeBots]);
  const installDebug = (next: LocalSave) => {
    cinema.reset(next.state);
    setSave(next);
    setHistory(next.history ?? []);
    setSelected(null);
    setNotice('');
    setDismissedOffer('');
    setBuyoutOfferKey('');
  };
  const startDebug = (source?: LocalSave) => {
    if (online) return;
    try {
      installDebug(source?.debug ? structuredClone(source) : newDebug(source));
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : 'Cette sauvegarde ne peut pas être ouverte en mode debug.',
      );
      return;
    }
    setDebugUndo([]);
    setPaused(false);
    setScreen('game');
    setModal('debug');
  };
  const debugCommand = (command: DebugCommand) => {
    if (!debugging || !save) throw new Error('Le mode debug est réservé au bac à sable local.');
    let presentation: { before: GameState; events: GameEvent[] } | undefined;
    const next = applyDebug(save, command, (before, events) => {
      presentation = { before, events };
    });
    setDebugUndo((old) => [...old.slice(-19), save]);
    installDebug(next);
    if (presentation?.events.length) {
      cinema.reset(presentation.before);
      cinema.present(next.state, presentation.events);
    }
    if (command.type === 'dice' || (command.type === 'move' && command.resolve)) {
      setModal(null);
      setPaused(false);
    }
  };
  const start = () => {
    if (!validMinutes(minutes)) return;
    const next = newLocal({
      players: Array.from({ length: count }, (_, i) => ({
        id: `p${i + 1}`,
        name: names[i]!.trim() || `Joueur ${i + 1}`,
        bot: bots[i],
        ...(mode === 'teams' ? { team: i % 2 } : {}),
      })),
      mode: mode === 'teams' ? 'teams' : 'free-for-all',
      durationMs: minutes * 60000,
      presentationPace: comfort.pace,
    });
    cinema.reset(next.state);
    setSave(next);
    setHistory(['Bon voyage ! ' + adventureText(next.state)]);
    setNotice('');
    setPaused(false);
    setScreen('game');
    setSelected(null);
  };
  const chooseMode = (value: 'solo' | 'local' | 'teams') => {
    setMode(value);
    if (value === 'teams') setCount(4);
    setBots(value === 'local' ? [false, false, false, false] : [false, true, true, true]);
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
    rolling ||
    decisionPlayer.bot ||
    Boolean(current.winner) ||
    Boolean(online && (online.self !== decisionPlayer.id || online.busy || online.blocked));
  useAuctionReveal(
    current,
    online?.self,
    act,
    screen !== 'game' || interactionDisabled || debugOpen,
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
                      ? `Choisissez une case libre ou alliée. Le voyage coûte ${money(current.config.travelFee, true)} et remplace les dés, même après un double.`
                      : current.phase === 'championship'
                        ? `Choisissez une ville éclairée : ${money(current.config.championshipFee, true)}, loyer ×2 pendant quatre de vos tours.`
                        : current.phase === 'property'
                          ? current.properties[active.position]?.ownerId &&
                            current.properties[active.position]?.ownerId !== active.id
                            ? `${current.config.board[active.position]!.name} · le loyer adverse est prélevé automatiquement. Vous pouvez poursuivre ou proposer un rachat.`
                            : `${current.config.board[active.position]!.name} vous accueille. Achetez, construisez ou poursuivez votre voyage.`
                          : 'Deux dés. Une destination. Une nouvelle opportunité.';

  if (modal === 'tutorial')
    return (
      <Suspense fallback={<p>Préparation de votre partie guidée…</p>}>
        <GuidedTutorial
          onClose={() => {
            setPaused(tutorialPause.current);
            setModal('rules');
          }}
        />
      </Suspense>
    );

  return (
    <GameProviders
      onDebug={debugging && screen === 'game' ? openDebug : null}
      value={{
        state: screen === 'game' ? current : null,
        held: paused || rolling || debugOpen || debugFreezeTime,
      }}
    >
      <div
        className={`app${comfort.largeText ? ' text-large' : ''}`}
        style={{ '--ui-text-scale': comfort.largeText ? 1.15 : 1 } as React.CSSProperties}
        onPointerDownCapture={() => void sound.current?.unlock()}
        onKeyDownCapture={() => void sound.current?.unlock()}
      >
        <header className="topbar">
          <button
            className="brand-button"
            aria-label="Money Tour, accueil"
            onClick={() => (screen === 'game' ? setModal('leave') : goHome())}
          >
            <Logo />
          </button>
          <nav>
            <button
              onClick={() => {
                setCreateSalon(false);
                if (!online) setResumeRequest(undefined);
                setModal('online');
              }}
            >
              Rejoindre un salon
            </button>
            <button onClick={() => setModal('rules')}>
              Comment jouer <span>↗</span>
            </button>
            <button
              className="icon-button"
              aria-label="Réglages"
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
                <i /> LE GRAND TOUR DES BONNES AFFAIRES
              </div>
              <h1>
                Un archipel.
                <br />
                Mille <em>fortunes.</em>
              </h1>
              <p className="intro-copy">
                Des villes à conquérir, des amis à défier.
                <br />
                Prenez les dés, votre prochaine aventure commence ici.
              </p>
              <div className="setup">
                <div className="setup-heading">
                  <h2>Votre billet pour l’aventure</h2>
                  <span>01 / DÉPART</span>
                </div>
                <div className="mode-tabs" role="group" aria-label="Mode de jeu">
                  {(
                    [
                      ['solo', 'Solo & bots'],
                      ['local', 'Entre amis'],
                      ['teams', 'Équipes 2v2'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={mode === value}
                      onClick={() => chooseMode(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="setup-options">
                  <label>
                    Voyageurs
                    <select
                      value={count}
                      disabled={mode === 'teams'}
                      onChange={(e) => setCount(Number(e.target.value))}
                    >
                      {[2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} joueurs
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
                        aria-label={`Nom du joueur ${i + 1}`}
                        maxLength={20}
                        value={names[i]}
                        onChange={(e) =>
                          setNames((old) => old.map((n, j) => (j === i ? e.target.value : n)))
                        }
                      />
                      <select
                        aria-label={`Type du joueur ${i + 1}`}
                        value={bots[i] ? 'bot' : 'human'}
                        onChange={(e) =>
                          setBots((old) =>
                            old.map((b, j) => (j === i ? e.target.value === 'bot' : b)),
                          )
                        }
                      >
                        <option value="human">Humain</option>
                        <option value="bot">Bot</option>
                      </select>
                      {mode === 'teams' && <span className="team-tag">{i % 2 ? 'B' : 'A'}</span>}
                    </div>
                  ))}
                </div>
                <button
                  className="primary launch"
                  onClick={() => {
                    setResumeRequest(undefined);
                    setCreateSalon(true);
                    setModal('online');
                  }}
                  disabled={!!online || !validMinutes(minutes)}
                >
                  Embarquer <span>→</span>
                </button>
                <button
                  className="secondary local-launch"
                  onClick={start}
                  disabled={!!online || !validMinutes(minutes)}
                >
                  Jouer sur cet appareil · solo / local
                </button>
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
                      Reprendre ma partie en ligne
                    </button>
                    <p className="saved-progress">
                      Votre siège est conservé sur cet appareil pendant 24 h.
                    </p>
                  </>
                )}
                {save && (
                  <>
                    <button
                      className="resume"
                      disabled={!!online || !validMinutes(minutes)}
                      onClick={() => {
                        cinema.reset(save.state);
                        setScreen('game');
                        setPaused(false);
                      }}
                    >
                      ↻ {save.state.winner ? 'Revoir le dernier résultat' : 'Reprendre ma partie'}
                    </button>
                    <p className="saved-progress">
                      Partie conservée · tour {save.state.turn} ·{' '}
                      {duration(save.state.durationMs - save.state.elapsedMs)} restantes
                    </p>
                  </>
                )}
                <p className="setup-note">
                  {mode === 'local'
                    ? 'Passez l’écran au joueur suivant.'
                    : 'Changez les sièges en bots pour observer une partie.'}{' '}
                  Sauvegarde sur cet appareil.
                </p>
                <button className="debug-launch" disabled={!!online} onClick={() => startDebug()}>
                  Mode debug · nouveau bac à sable
                </button>
                {debugResume && (
                  <button
                    className="debug-launch"
                    disabled={!!online}
                    onClick={() => startDebug(debugResume)}
                  >
                    Reprendre mon scénario debug
                  </button>
                )}
              </div>
            </section>
            <section className="hero-map" aria-label="Aperçu du plateau">
              <span className="map-stamp">
                32 ESCALES
                <br />
                <b>∞ POSSIBILITÉS</b>
              </span>
              <Suspense fallback={<div className="board-shell">Préparation de l’archipel…</div>}>
                <Board
                  state={demo}
                  onTile={setSelected}
                  reducedMotion
                  demo
                  zoomPercent={comfort.boardZoom}
                />
              </Suspense>
              <div className="map-caption">
                <span>✦ Créé pour les bons moments</span>
                <span>2–4 voyageurs · dès maintenant</span>
              </div>
            </section>
            <div className="features">
              <div>
                <b>01</b>
                <span>
                  <strong>Tracez votre route</strong>Achetez des villes et des îles privées.
                </span>
              </div>
              <div>
                <b>02</b>
                <span>
                  <strong>Voyez plus grand</strong>Maisons, hôtels et festivals.
                </span>
              </div>
              <div>
                <b>03</b>
                <span>
                  <strong>Changez la donne</strong>Une collection complète peut tout gagner.
                </span>
              </div>
            </div>
          </main>
        ) : (
          <main
            className={`game-layout ${!interactionDisabled && options.some((a) => a.type === 'insure') ? 'insurance-selecting' : ''}`}
          >
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
                    ? 'EXPÉDITION EN ÉQUIPE'
                    : online
                      ? 'SALON EN LIGNE'
                      : 'PARTIE LOCALE'}{' '}
                  · TOUR DE JEU {current.turn}
                </span>
                <h1>Le tour de la fortune</h1>
              </div>
              <div className="game-tools">
                <button
                  className="icon-button"
                  aria-label="Réglages de la partie"
                  onClick={() => setModal('settings')}
                >
                  <GameIcon name="settings" />
                </button>
                <span className="clock" aria-label="Temps restant">
                  <GameIcon name="clock" /> {duration(current.durationMs - current.elapsedMs)}
                </span>
                <button
                  className="subtle"
                  onClick={togglePause}
                  aria-pressed={paused}
                  title={
                    online
                      ? 'La pause est réservée au solo et au jeu local'
                      : 'Suspendre le chrono et les bots'
                  }
                  disabled={!!current.winner || !!online}
                >
                  {paused ? 'Reprendre' : 'Pause'}
                </button>
                <button
                  className="icon-button"
                  aria-label="Quitter la partie"
                  onClick={() => setModal('leave')}
                >
                  <GameIcon name="exit" />
                </button>
              </div>
            </div>
            {!mobile && (
              <div className="shared-game-info">
                <AdventureBanner state={current} />
                {!!warnings.length && (
                  <div className="victory-watch" role="status">
                    {warnings.map((w) => (
                      <p key={w.key}>⚠ {w.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="players">
              {current.players.map((p, i) => (
                <article
                  key={p.id}
                  data-bank={p.id}
                  className={`player-card ${current.currentPlayer === i ? 'active' : ''} ${p.eliminated ? 'eliminated' : ''} ${!mobile && collapsedPlayers[p.id] ? 'player-collapsed' : ''}`}
                  style={{ '--player-color': colors[i] } as React.CSSProperties}
                >
                  <button
                    className="player-profile"
                    aria-label={`Voir les propriétés de ${p.name}`}
                    aria-pressed={inspectedOwner === p.id}
                    onClick={() => setInspectedOwner(inspectedOwner === p.id ? null : p.id)}
                  />
                  {!mobile && (
                    <button
                      className="player-collapse"
                      aria-label={`${collapsedPlayers[p.id] ? 'Développer' : 'Réduire'} le volet de ${p.name}`}
                      aria-expanded={!collapsedPlayers[p.id]}
                      title={
                        collapsedPlayers[p.id]
                          ? 'Afficher les propriétés et les bonus'
                          : 'Garder seulement le nom et le solde'
                      }
                      onClick={() =>
                        setCollapsedPlayers((previous) => ({
                          ...previous,
                          [p.id]: !previous[p.id],
                        }))
                      }
                    >
                      <span aria-hidden="true">{collapsedPlayers[p.id] ? '+' : '−'}</span>
                    </button>
                  )}
                  <span className={`avatar portrait portrait-${i}`} aria-label={pawnNames[i]} />
                  <div className="player-summary">
                    <span className="player-name">
                      {p.name === 'Vous' && online ? `Joueur ${i + 1}` : p.name}{' '}
                      {p.insurance && (
                        <span
                          className="inventory-token"
                          title={
                            p.insurance.tile === null
                              ? 'Assurance disponible'
                              : `Assurance : ${current.config.board[p.insurance.tile]?.name}`
                          }
                        >
                          <GameIcon name="shield" />
                        </span>
                      )}
                      <small className="player-seat-label">
                        {online?.self === p.id
                          ? 'VOUS'
                          : p.bot
                            ? 'BOT'
                            : current.mode === 'teams'
                              ? `ÉQ. ${p.team === 0 ? 'A' : 'B'}`
                              : pawnNames[i]}
                      </small>
                    </span>
                    <strong>{p.eliminated ? 'Faillite' : money(p.cash, true)}</strong>
                  </div>
                  {(mobile || !collapsedPlayers[p.id]) && (
                    <>
                      <span className="property-count" title="Propriétés">
                        <GameIcon name="house" />{' '}
                        {Object.values(current.properties).filter((v) => v.ownerId === p.id).length}{' '}
                        · {p.laps} tour(s) du plateau terminé(s)
                      </span>
                      {p.islandTurns !== null && !p.eliminated && (
                        <span
                          className="island-remaining"
                          title="Île perdue : un double, un billet ou la caution permettent de sortir plus tôt."
                        >
                          <span className="island-label">Île perdue · </span>
                          {Math.max(0, current.config.maxIslandTurns - p.islandTurns)} tour(s) max
                        </span>
                      )}
                      {!!p.fraudLiability && (
                        <small className="fraud-risk" title="Jusqu’au prochain passage par Départ">
                          ⚠ Taxe : {money(p.fraudLiability, true)}
                        </small>
                      )}
                      <PlayerInventory
                        state={current}
                        player={p}
                        onTile={chooseTile}
                        onBonus={showBonus}
                      />
                      {p.id === (online?.self ?? active.id) && (
                        <PrivateQuest
                          key={p.id + current.turn}
                          state={current}
                          player={p}
                          self={online?.self}
                        />
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>
            <section className="board-area">
              {mobile && (
                <div className="mobile-shared-info">
                  <AdventureBanner state={current} />
                  {!!warnings.length && (
                    <div className="victory-watch" role="status">
                      {warnings.map((w) => (
                        <p key={w.key}>⚠ {w.message}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="board-viewport">
                <Suspense fallback={<div className="board-shell">Préparation du plateau…</div>}>
                  <Board
                    state={display}
                    zoomPercent={comfort.boardZoom}
                    onReady={() => setBoardReady(true)}
                    auctionTile={current.auction?.tile}
                    strategicTiles={strategicTiles}
                    onPlayer={
                      canTaunt
                        ? (id) => {
                            const sender = tauntPlayer(current, online?.self, id);
                            if (!sender) return;
                            setTauntSender(sender);
                            setTauntTarget(id);
                            setSelected(null);
                            setModal('taunt');
                          }
                        : undefined
                    }
                    taunt={visibleTaunt ?? undefined}
                    mobile={mobile}
                    onZoomChange={(boardZoom) => setComfort((old) => ({ ...old, boardZoom }))}
                    onPanChange={setBoardPanned}
                    viewResetKey={viewResetKey}
                    overview={
                      overview ||
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
                      (options.some((a) => a.type === 'insure') ||
                        ['championship', 'attack', 'travel', 'debt'].includes(current.phase))
                    }
                    cue={cinema.frame.cue}
                    choices={interactionDisabled ? [] : options.map((a) => a.tile)}
                    onTile={chooseTile}
                    reducedMotion={reduced || paused}
                  />
                </Suspense>
                {strategicTiles.length > 0 && (
                  <div className="strategy-board-note" role="status">
                    <GameIcon name="target" />
                    <span>{strategicTiles.length} cases repérées</span>
                    <button aria-label="Effacer le repérage" onClick={() => setStrategicTiles([])}>
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
                  ? `${current.players.find((p) => p.id === inspectedOwner)?.name} · ${Object.values(current.properties).filter((p) => p.ownerId === inspectedOwner).length} propriété(s)`
                  : cinema.frame.cue.kind === 'dice'
                    ? 'Les dés roulent…'
                    : rolling
                      ? cinema.frame.cue.kind === 'hop'
                        ? 'En route…'
                        : 'Votre aventure continue…'
                      : mobile && options.length && !interactionDisabled
                        ? current.phase === 'championship'
                          ? 'Touchez une propriété éclairée · Festival 50'
                          : 'Touchez une case éclairée pour la choisir'
                        : display.dice.length
                          ? 'Dés : ' +
                            display.dice.join(' + ') +
                            ' · ' +
                            display.dice.reduce((a, b) => a + b, 0) +
                            ' cases'
                          : `Au tour de ${active.name}`}
                {inspectedOwner && (
                  <button className="clear-owner" onClick={() => setInspectedOwner(null)}>
                    Tout afficher
                  </button>
                )}
              </div>
              <div className="board-controls">
                <button className="strategy-button icon-label" onClick={() => setModal('strategy')}>
                  <GameIcon name="target" />
                  Ma stratégie{' '}
                  <small>
                    {victoryProgress.completed}/{victoryProgress.target}
                  </small>
                </button>
                <button className="icon-label" onClick={() => setModal('journal')}>
                  <GameIcon name="journal" />
                  Journal des actions
                </button>
                <button className="icon-label" onClick={() => setModal('tiles')}>
                  <GameIcon name="map" />
                  {mobile && options.length && !interactionDisabled
                    ? 'Choisir une case'
                    : 'Explorer les cases'}
                </button>
                {mobile ? (
                  <>
                    <button
                      aria-pressed={overview || boardPanned}
                      onClick={() => {
                        if (inspectedOwner) setInspectedOwner(null);
                        else if (boardPanned) {
                          setOverview(false);
                          setViewResetKey((key) => key + 1);
                        } else setOverview(!overview);
                      }}
                    >
                      {inspectedOwner
                        ? 'Tout afficher'
                        : boardPanned
                          ? 'Recentrer mon pion'
                          : overview
                            ? 'Suivre mon pion'
                            : 'Vue globale'}
                    </button>
                    <button className="icon-label" onClick={() => setModal('pocket')}>
                      <GameIcon name="book" />
                      Mon carnet
                    </button>
                  </>
                ) : (
                  <>
                    <button className="icon-label" onClick={() => setInspectedOwner(null)}>
                      <GameIcon name="map" />
                      Vue globale
                    </button>
                  </>
                )}
              </div>
            </section>
            <aside className="game-sidebar">
              <ContextTip
                state={current}
                self={online?.self ?? active.id}
                disabled={rolling || paused || !!modal || !!offer || !!tile}
              />
              {current.phase === 'championship' && !interactionDisabled && (
                <section className="mondial-picker" aria-label="Choisir la propriété du Festival">
                  <strong>🎸 Où accueillir le Festival ?</strong>
                  {options.length ? (
                    <>
                      <p>
                        Vos propriétés sont éclairées. Cliquez sur une case ou une carte ci-dessous.
                      </p>
                      <div>
                        {options.map((a) => (
                          <button className="primary" key={a.tile} onClick={() => act(a)}>
                            {current.config.board[a.tile]!.name} ·{' '}
                            {money(current.config.championshipFee, true)} <ActionClock />
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>
                      {current.config.board.some(
                        (t) => current.properties[t.id]?.ownerId === active.id,
                      )
                        ? 'Il vous faut ' +
                          money(current.config.championshipFee, true) +
                          ' pour organiser le Festival.'
                        : 'Achetez d’abord une ville ou une île pour y organiser le Festival.'}
                    </p>
                  )}
                </section>
              )}

              {sharedDialog.hidden && current.phase === 'duel' && (
                <button className="secondary" onClick={sharedDialog.reopen}>
                  Revoir le duel
                </button>
              )}
              {current.auction && auctionDialog.hidden && (
                <div className="auction-board-prompt">
                  <p role="status">
                    {current.config.board[current.auction.tile]!.name} est surlignée sur le plateau.
                  </p>
                  <button
                    className="primary"
                    onClick={auctionDialog.reopen}
                    disabled={rolling || paused}
                  >
                    {current.auction.stage === 'commit'
                      ? 'Enchérir sur '
                      : 'Revoir les enchères · '}
                    {current.config.board[current.auction.tile]!.name}
                  </button>
                </div>
              )}
              <section className="action-card">
                <span className="eyebrow">
                  {paused
                    ? 'PARTIE EN PAUSE'
                    : decisionPlayer.bot
                      ? 'UN BOT RÉFLÉCHIT…'
                      : online && online.self !== decisionPlayer.id
                        ? `TOUR DE ${decisionPlayer.name.toUpperCase()}`
                        : `À VOUS, ${decisionPlayer.name.toUpperCase()}`}
                </span>
                <h2>
                  {paused
                    ? 'Une petite escale ?'
                    : decisionPlayer.bot || (online && online.self !== decisionPlayer.id)
                      ? `${decisionPlayer.name} joue`
                      : phaseText[current.phase]}
                </h2>
                <p>
                  {paused
                    ? 'Le chrono et les bots vous attendent.'
                    : decisionPlayer.bot || (online && online.self !== decisionPlayer.id)
                      ? 'Suivez son déplacement. Vos commandes seront disponibles à votre tour.'
                      : actionDescription}
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
                    <small>✦ LA BONNE ÉTOILE</small>
                    <strong>
                      {festivalText(
                        current.config.cards.find((c) => c.id === current.lastCard)?.title,
                      )}
                    </strong>
                    <p>
                      {propertyRulesText(
                        current.config.cards.find((c) => c.id === current.lastCard)?.description,
                      )}
                    </p>
                  </div>
                )}
                {options.length > 0 && current.phase !== 'championship' && !interactionDisabled && (
                  <p className="board-choice-hint">
                    Cliquez directement sur une case dorée du plateau pour{' '}
                    {current.phase === 'travel'
                      ? 'vous y déplacer'
                      : current.phase === 'attack'
                        ? 'choisir votre cible'
                        : current.phase === 'debt'
                          ? 'la vendre et régler votre dette'
                          : 'l’assurer'}
                    .
                  </p>
                )}
                {current.phase === 'property' &&
                  current.properties[active.position]?.ownerId === active.id &&
                  current.properties[active.position]?.level === 3 &&
                  current.config.hotelUnlockLaps !== undefined &&
                  active.laps < current.config.hotelUnlockLaps && (
                    <p className="board-choice-hint hotel-unlock-hint">
                      Hôtel après {current.config.hotelUnlockLaps} tours du plateau · {active.laps}/
                      {current.config.hotelUnlockLaps} terminés.
                    </p>
                  )}
                <div className="actions">
                  {current.phase === 'travel' &&
                    !active.bot &&
                    (!online || online.self === active.id) && (
                      <button
                        className="primary travel-destination"
                        disabled={interactionDisabled || !options.length}
                        onClick={() => setModal('tiles')}
                      >
                        <span>
                          {options.length
                            ? 'Choisir ma destination'
                            : 'Voyage · fonds insuffisants'}{' '}
                          · {money(current.config.travelFee, true)}
                        </span>
                        <ActionClock />
                      </button>
                    )}
                  {!active.bot &&
                    (!online || online.self === active.id) &&
                    available
                      .filter((a) => !mobile || a.type !== 'sell')
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
                          <span>{actionLabel(a)}</span>
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
                      {online.status}
                    </p>
                    {online.state?.players.find((p) => p.id === online.self)?.bot &&
                      !current.winner && (
                        <button
                          className="secondary reclaim-seat"
                          onClick={() =>
                            act({ type: 'set_control', playerId: online.self, bot: false })
                          }
                        >
                          Reprendre mon siège
                        </button>
                      )}
                  </>
                )}
                {active.bot && !current.winner && !online && (
                  <button
                    className="text-button"
                    onClick={() => act({ type: 'set_control', playerId: active.id, bot: false })}
                  >
                    Prendre la main sur ce bot
                  </button>
                )}
                {current.crisis && (
                  <p className="world-event-status">
                    📉 Crise économique · loyers −50 % · {current.crisis.remaining.length} joueur(s)
                    doivent encore terminer leur tour
                  </p>
                )}
                {current.alliance && (
                  <p className="world-event-status">
                    🤝 {current.players.find((p) => p.id === current.alliance!.beneficiaryId)!.name}{' '}
                    reçoit 50 % des gains de{' '}
                    {current.players.find((p) => p.id === current.alliance!.targetId)!.name}
                  </p>
                )}
                <small className="action-help">
                  La règle spéciale de cette partie est affichée au-dessus du plateau.
                </small>
              </section>
              <details className="live-actions">
                <summary>Historique de la partie</summary>
                <ol aria-live="polite">
                  {history.slice(0, 3).map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ol>
                <button onClick={() => setModal('journal')}>Toutes les actions ↗</button>
              </details>
              <div className="tip">
                <b>Le saviez-vous ?</b>
                <p>Les quatre îles réunies rapportent 500 de loyer à chaque visite adverse.</p>
              </div>
            </aside>
          </main>
        )}
        <footer>
          <span>© Money Tour · Un jeu original, de bonnes histoires.</span>
          <div>
            <button onClick={() => setModal('credits')}>Crédits</button>
            <a href="https://github.com/Virtuel21/money-tour" target="_blank" rel="noreferrer">
              Le projet ↗
            </a>
          </div>
        </footer>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label="Fermer le message" onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}
        {modal === 'bonus' && selectedBonus && (
          <Modal title={selectedBonus.title} onClose={() => setModal(null)}>
            <p className="bonus-description">{selectedBonus.description}</p>
            <button className="primary" onClick={() => setModal(null)}>
              Compris
            </button>
          </Modal>
        )}
        {modal === 'journal' && (
          <Modal title="Journal des actions" onClose={() => setModal(null)}>
            <p>
              Les actions les plus récentes sont en haut. Les offres secrètes et les choix du duel
              restent cachés jusqu’au résultat.
            </p>
            <ol className="action-history">
              {history.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ol>
            {!history.length && <p>Les prochaines actions de cette session apparaîtront ici.</p>}
          </Modal>
        )}
        {modal === 'pocket' && (
          <Modal title="Mon carnet de voyage" onClose={() => setModal(null)}>
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
              onTile={(id) => {
                setModal(null);
                chooseTile(id);
              }}
            />
          </Modal>
        )}
        {modal === 'strategy' && (
          <Modal title="Le cap vers la victoire" onClose={() => setModal(null)}>
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
                setModal(null);
                setSelected(id);
              }}
            />
          </Modal>
        )}
        {modal === 'rules' && (
          <Modal title="Comment jouer" onClose={() => setModal(null)}>
            <p>
              Apprenez en jouant : un guide éclaire les commandes et vous accompagne dans une partie
              simulée, à votre rythme.
            </p>
            <button
              className="primary"
              disabled={Boolean(online)}
              onClick={() => {
                tutorialPause.current = paused;
                setPaused(true);
                setModal('tutorial');
              }}
            >
              Démarrer le tutoriel interactif
            </button>
            {online && <p>Le tutoriel sera disponible après avoir quitté votre salon en ligne.</p>}
            <details>
              <summary>Lire toutes les règles</summary>
              <div className="rules">
                <p className="lead">Un tour de plateau, beaucoup de possibilités.</p>
                <h3>1. Lancez, voyagez, investissez</h3>
                <p>
                  Lancez deux dés. Achetez une ville libre, améliorez une de vos villes ou payez le
                  loyer à votre arrivée chez un adversaire. Un double permet de rejouer ; trois
                  doubles vous envoient sur l’île.
                </p>
                <h3>2. Construisez votre fortune</h3>
                <p>
                  Construisez sur une ville à vous sans attendre la rue complète : jusqu’à trois
                  maisons, puis un hôtel après {current.config.hotelUnlockLaps ?? 1} tours complets
                  du plateau. Chaque passage rapporte 300. Après le loyer, toute ville adverse, même
                  avec hôtel, et toute île peuvent être rachetées au double de sa valeur foncière.
                </p>
                <h3>3. Plusieurs façons de gagner</h3>
                <p>
                  Possédez toutes les propriétés achetables d’un côté, île comprise, ou complétez
                  trois rues pour gagner. Les quatre îles réunies comptent comme une rue complète :
                  deux rues de villes et les quatre îles donnent donc le triple monopole. Elles
                  donnent aussi un loyer de 500. Vous gagnez aussi si tous vos adversaires font
                  faillite. À la fin du chrono, le plus grand patrimoine gagne ; une égalité se
                  partage.
                </p>
                <h3>4. Des escales qui changent tout</h3>
                <p>
                  32 cases : 6 rues de deux villes et 2 rues de trois villes, 4 îles privées, 2
                  cases Chance, 1 taxe, 1 casino, 1 assurance, 1 duel et 4 coins spéciaux. Le paquet
                  contient 23 cartes Chance différentes, tirées sans remise. Les loyers sont payés
                  automatiquement par le visiteur. Les cartes se résolvent pour leur destinataire
                  uniquement.
                </p>
                <p>
                  Selon la règle tirée, trois festivals peuvent doubler les loyers. Le Festival
                  coûte 50 et double le loyer pendant quatre retours du propriétaire. L’île vous
                  retient jusqu’à trois tours. Le Tour du monde ouvre un voyage payant au prochain
                  tour, ou dès l’action supplémentaire si vous arrivez avec un double. Si votre cash
                  manque, vendez des biens à la banque à moitié de leur valeur.
                </p>
                <h3>5. Tentez votre chance, protégez vos biens</h3>
                <p>
                  Les casinos proposent une roulette ou une machine à sous, sans mise. Le jackpot
                  rapporte 10 % de votre solde ; chaque résultat gagnant vaut au moins 50 avant
                  partage éventuel d’une alliance. Ses chances augmentent à chaque visite du casino.
                  La case Duel permet de défier un adversaire à pierre-feuille-ciseaux avec une mise
                  acceptée par les deux joueurs.
                </p>
                <p>
                  L’assurance donne un jeton unique à placer sur un bien : il bloque une destruction
                  ou une expropriation, puis disparaît. Squatteur se garde pour éviter un loyer.
                  Expropriation remet une ville ou île adverse à la banque ; les cafards divisent le
                  loyer d’un hôtel par deux pendant deux tours de son propriétaire.
                </p>
                <p>
                  Fraude fiscale permet un achat à moitié prix. Jusqu’au prochain passage Départ,
                  tomber sur Taxe coûte deux fois le prix normal de cet achat. Une dette impose de
                  choisir les biens à vendre ; la faillite survient seulement si leur valeur totale
                  de revente et votre compte ne suffisent pas.
                </p>
                <p>
                  Alliance temporaire prélève la moitié des gains d’un joueur jusqu’à la fin de son
                  prochain tour. Une crise économique rare (au plus deux par partie, espacées de
                  huit tours de table) divise tous les loyers par deux pendant un tour complet de
                  tous les joueurs. Le duel propose une mise identique acceptée par les deux
                  adversaires : pierre, feuille, ciseaux avec choix secrets ; le gagnant remporte le
                  pot, une égalité relance les choix sans nouvelle mise jusqu’à un vainqueur.
                </p>
                <p>
                  Tremblement de terre : 3 % à chaque nouveau tour de table éligible dès le
                  quatrième, uniquement si des bâtiments existent et hors crise. Un joueur possédant
                  des bâtiments, puis une de ses villes construites, sont tirés au sort. Une maison
                  disparaît ; un hôtel redevient trois maisons. L’assurance de cette ville bloque le
                  séisme une fois. Maximum deux séismes par partie, espacés d’au moins six tours de
                  table.
                </p>
                <h3>À quatre, jouez en équipe</h3>
                <p>
                  Les sièges 1 et 3 affrontent les sièges 2 et 4. Pas de loyer entre alliés ; les
                  collections se partagent pour la victoire. Le cash reste individuel.
                </p>
              </div>
            </details>
            <button className="secondary" onClick={() => setModal(null)}>
              Fermer
            </button>
          </Modal>
        )}
        {modal === 'credits' && (
          <Modal title="Le carnet des créateurs" onClose={() => setModal(null)}>
            <pre className="credits-text">{credits}</pre>
          </Modal>
        )}
        {modal === 'settings' && (
          <Modal title="Votre confort de voyage" onClose={() => setModal(null)}>
            {screen === 'game' && !online && !debugging && save && (
              <button className="debug-launch" onClick={() => startDebug(save)}>
                Tester une copie en mode debug
              </button>
            )}
            <div className="comfort-options">
              <section className="board-zoom-setting" aria-label="Réglage du zoom">
                <div className="board-zoom-heading">
                  <label htmlFor="board-zoom">Zoom du plateau</label>
                  <output htmlFor="board-zoom">{comfort.boardZoom} %</output>
                </div>
                <div className="board-zoom-controls">
                  <button
                    type="button"
                    aria-label="Réduire le zoom"
                    disabled={comfort.boardZoom <= MIN_BOARD_ZOOM}
                    onClick={() =>
                      setComfort((old) => ({
                        ...old,
                        boardZoom: normalizeBoardZoom(old.boardZoom - 5),
                      }))
                    }
                  >
                    −
                  </button>
                  <input
                    id="board-zoom"
                    type="range"
                    min={MIN_BOARD_ZOOM}
                    max={MAX_BOARD_ZOOM}
                    step="5"
                    value={comfort.boardZoom}
                    aria-valuetext={`${comfort.boardZoom} %`}
                    aria-describedby="board-zoom-help"
                    onChange={(e) =>
                      setComfort((old) => ({
                        ...old,
                        boardZoom: normalizeBoardZoom(Number(e.target.value)),
                      }))
                    }
                  />
                  <button
                    type="button"
                    aria-label="Augmenter le zoom"
                    disabled={comfort.boardZoom >= MAX_BOARD_ZOOM}
                    onClick={() =>
                      setComfort((old) => ({
                        ...old,
                        boardZoom: normalizeBoardZoom(old.boardZoom + 5),
                      }))
                    }
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="secondary board-zoom-reset"
                  disabled={comfort.boardZoom === 100}
                  onClick={() => setComfort((old) => ({ ...old, boardZoom: 100 }))}
                >
                  Revenir à 100 %
                </button>
                <p id="board-zoom-help">
                  Réglage personnel, mémorisé sur cet appareil. Le zoom s’applique au plateau et au
                  suivi du pion. Une vue complète est conservée pour les enchères et le repérage des
                  cases. Sur mobile, pincez pour zoomer et glissez avec un doigt pour déplacer la
                  vue agrandie. « Recentrer mon pion » rétablit le cadrage automatique.
                </p>
              </section>
              <label className="field">
                Rythme des animations
                <select
                  value={online ? (online.state?.presentationPace ?? 'normal') : comfort.pace}
                  disabled={!!online}
                  onChange={(e) =>
                    setComfort((old) => ({
                      ...old,
                      pace: e.target.value === 'fast' ? 'fast' : 'normal',
                    }))
                  }
                >
                  <option value="normal">Normal · prendre le temps de voir</option>
                  <option value="fast">Rapide · aller à l’essentiel</option>
                </select>
              </label>
              <p>
                {online
                  ? 'En ligne, le rythme est choisi par l’hôte avant la partie et partagé par tous.'
                  : 'Le mode rapide raccourcit les animations. Le temps pour décider reste identique.'}
              </p>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={comfort.largeText}
                  onChange={(e) => setComfort((old) => ({ ...old, largeText: e.target.checked }))}
                />
                Textes d’interface agrandis
              </label>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={audioPrefs.effects}
                onChange={(e) => setAudioPrefs((old) => ({ ...old, effects: e.target.checked }))}
              />{' '}
              Effets sonores
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={audioPrefs.music}
                onChange={(e) => setAudioPrefs((old) => ({ ...old, music: e.target.checked }))}
              />{' '}
              Musique de l’archipel
            </label>
            <label className="field">
              Volume
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audioPrefs.volume}
                onChange={(e) =>
                  setAudioPrefs((old) => ({ ...old, volume: Number(e.target.value) }))
                }
              />
            </label>
            <button
              className="secondary"
              onClick={() => {
                void sound.current?.unlock().then(() => sound.current?.effect('victory'));
              }}
            >
              Écouter un aperçu
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={reduced}
                onChange={(e) => setReduced(e.target.checked)}
              />{' '}
              Réduire les animations
            </label>
            <p>
              La partie locale se sauvegarde dans ce navigateur. Revenir à l’accueil la met en
              pause.
            </p>
            <button className="primary" onClick={() => setModal(null)}>
              Enregistrer
            </button>
          </Modal>
        )}
        {modal === 'tiles' && (
          <Modal
            title={
              current.phase === 'travel' && !interactionDisabled
                ? 'Choisir ma destination'
                : `Les ${current.config.board.length} escales`
            }
            onClose={() => setModal(null)}
          >
            {mobile || (current.phase === 'travel' && !interactionDisabled) ? (
              <MobileTiles
                state={current}
                choices={interactionDisabled ? [] : options.map((a) => a.tile)}
                onTile={(id) => {
                  setModal(null);
                  chooseTile(id);
                }}
              />
            ) : (
              <div className="tile-list">
                {current.config.board.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelected(t.id);
                      setModal(null);
                    }}
                  >
                    <i style={{ background: t.color ?? '#e6b94a' }} />
                    {tileTitle(t)}
                    <small>{t.price ? money(t.price, true) : 'Escale spéciale'}</small>
                  </button>
                ))}
              </div>
            )}
          </Modal>
        )}
        {modal === 'leave' && (
          <Modal title="Voulez-vous quitter la partie ?" onClose={() => setModal(null)}>
            <p>
              {online
                ? 'La partie en ligne continue lorsque vous revenez à l’accueil. Abandonner élimine votre joueur.'
                : 'Revenir à l’accueil conserve votre partie. Abandonner élimine le joueur actif de cette partie.'}
            </p>
            <button className="primary" onClick={() => setModal(null)}>
              Continuer la partie
            </button>
            <button
              className="secondary"
              onClick={() => {
                goHome();
                setModal(null);
              }}
            >
              Accueil et sauvegarde
            </button>
            <button
              className="secondary"
              onClick={() => {
                act({ type: 'quit', playerId: online?.self ?? active.id });
                setModal(null);
              }}
            >
              {online ? 'Abandonner ma partie' : `Abandonner pour ${active.name}`}
            </button>
          </Modal>
        )}
        {offer && (
          <Modal title={offer.tile.name} onClose={() => setDismissedOffer(offerKey)}>
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
        {screen === 'game' &&
          !rolling &&
          !modal &&
          !paused &&
          current.phase === 'duel' &&
          !sharedDialog.hidden &&
          current.duel && (
            <Modal title="Le grand duel" onClose={sharedDialog.onClose}>
              <DuelView
                key={current.duel.id}
                state={current}
                self={online?.self}
                act={act}
                disabled={Boolean(online?.busy || online?.blocked)}
              />
            </Modal>
          )}
        {screen === 'game' && !interactionDisabled && !modal && current.phase === 'alliance' && (
          <Modal title="Choisissez votre alliance">
            <p>
              Recevez 50 % des gains du joueur choisi jusqu’à la fin de son prochain tour. Cette
              part est prélevée sur ses gains.
            </p>
            <div className="decision-actions">
              {legal
                .filter((a) => a.type === 'alliance')
                .map(
                  (a) =>
                    a.type === 'alliance' && (
                      <button className="primary" key={a.targetId} onClick={() => act(a)}>
                        Choisir {current.players.find((p) => p.id === a.targetId)!.name}
                        <ActionClock />
                      </button>
                    ),
                )}
            </div>
            <button
              className="secondary"
              onClick={() => act({ type: 'finish', playerId: active.id })}
            >
              Passer <ActionClock />
            </button>
          </Modal>
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
                current.auction.kind === 'market' ? 'Le marché flottant' : 'Les appels d’offres'
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
        {screen === 'game' && !interactionDisabled && !modal && current.phase === 'casino' && (
          <Modal title="Bienvenue au casino">
            <CasinoView state={current} act={act} />
          </Modal>
        )}
        {screen === 'game' &&
          !paused &&
          !cinema.dismissed &&
          cinema.frame.cue.kind === 'casino' && (
            <Modal title="Le casino joue pour vous" onClose={cinema.dismiss}>
              <CasinoView
                key={current.seq + '-casino'}
                state={current}
                cue={cinema.frame.cue}
                act={act}
              />
              <button className="secondary" onClick={cinema.dismiss}>
                Passer l’animation
              </button>
            </Modal>
          )}
        {screen === 'game' &&
          !paused &&
          !cinema.dismissed &&
          cinema.frame.cue.kind === 'notice' &&
          cinema.frame.cue.reason !== 'auction_started' &&
          (['insured_tile', 'alliance_expired', 'crisis_expired', 'roaches_expired'].includes(
            cinema.frame.cue.reason ?? '',
          ) ? (
            <div className="routine-notice" role="status">
              <GameIcon name="info" />
              <p>{cinema.frame.cue.message}</p>
              <button
                onClick={() => {
                  cinema.dismiss();
                  setModal('journal');
                }}
              >
                Journal
              </button>
              <button aria-label="Masquer l’information" onClick={cinema.dismiss}>
                <GameIcon name="close" />
              </button>
            </div>
          ) : (
            <Modal
              onClose={cinema.dismiss}
              className={cinema.frame.cue.reason === 'earthquake' ? 'earthquake-modal' : ''}
              title={
                cinema.frame.cue.reason === 'victory_warning'
                  ? 'Monopole en vue !'
                  : cinema.frame.cue.reason === 'earthquake'
                    ? 'Tremblement de terre !'
                    : cinema.frame.cue.reason === 'quest_completed'
                      ? 'Palier Mystère accompli !'
                      : cinema.frame.cue.reason === 'capital_revealed'
                        ? 'La Capitale est révélée !'
                        : cinema.frame.cue.reason === 'auction_started'
                          ? 'Préparez vos enveloppes !'
                          : cinema.frame.cue.reason === 'auction_result'
                            ? 'Le résultat des enchères'
                            : cinema.frame.cue.reason === 'duel_result'
                              ? 'Le duel est joué !'
                              : cinema.frame.cue.reason === 'crisis'
                                ? 'Crise économique'
                                : cinema.frame.cue.reason === 'alliance'
                                  ? 'Une alliance est née'
                                  : 'Votre aventure continue'
              }
            >
              <p className="event-notice">{cinema.frame.cue.message}</p>
              <button className="primary" onClick={cinema.dismiss}>
                Continuer
              </button>
            </Modal>
          ))}
        {screen === 'game' && !interactionDisabled && !modal && current.phase === 'rent' && (
          <Modal title="Un loyer… ou votre carte Squatteur ?">
            <p>
              Vous arrivez à {current.config.board[active.position]?.name}. Le loyer est de{' '}
              {money(current.pendingRent?.amount ?? 0)}.
            </p>
            <p>La carte Squatteur annule ce paiement et sera défaussée.</p>
            <div className="decision-actions">
              {available
                .filter((a) => ['use_squatter', 'pay_rent'].includes(a.type))
                .map((a) => (
                  <button
                    className={a.type === 'use_squatter' ? 'primary' : 'secondary'}
                    key={a.type}
                    onClick={() => act(a)}
                  >
                    {actionLabel(a)}
                    <ActionClock />
                  </button>
                ))}
            </div>
          </Modal>
        )}
        {screen === 'game' && !interactionDisabled && !modal && current.phase === 'debt' && (
          <Modal title="Réglons cette dette ensemble">
            <p>
              À payer : <strong>{money(current.debt!.amount)}</strong> · En banque :{' '}
              {money(active.cash)}.
            </p>
            <p>
              Il manque <strong>{money(current.debt!.amount - active.cash)}</strong>. Choisissez les
              biens à vendre. Le paiement se règle dès que le total suffit.
            </p>
            <p>
              Valeur vendable totale :{' '}
              <strong>
                {money(
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
                )}
              </strong>
              .
            </p>
            {mobile ? (
              <MobileTiles
                state={current}
                choices={options.map((a) => a.tile)}
                onTile={chooseTile}
              />
            ) : (
              <div className="decision-actions">
                {available
                  .filter((a) => a.type === 'sell')
                  .map((a) => (
                    <button
                      className="secondary"
                      key={'tile' in a ? a.tile : a.type}
                      onClick={() => act(a)}
                    >
                      {actionLabel(a)}
                      <ActionClock />
                    </button>
                  ))}
              </div>
            )}
          </Modal>
        )}
        {modal === 'taunt' && tauntSender && screen === 'game' && (
          <Modal
            title="À vous de taquiner !"
            className="taunt-modal"
            onClose={() => setModal(null)}
          >
            <TauntMenu
              state={current}
              playerId={tauntSender}
              targetId={tauntTarget}
              cooling={!!tauntReadyAt}
              onSend={sendTaunt}
            />
          </Modal>
        )}
        {tile && !offer && !debugOpen && (
          <Modal title={tileTitle(tile)} onClose={() => setSelected(null)}>
            <div className="property-hero" style={{ background: tile.color ?? '#e6b94a' }}>
              {tile.type === 'city' ? (
                <BuildingIllustration level={property?.level || 1} cityName={tile.name} />
              ) : (
                <span>{tile.type === 'resort' ? '☀' : '✦'}</span>
              )}
              <p>
                {property?.ownerId
                  ? `Propriété de ${current.players.find((p) => p.id === property.ownerId)?.name}`
                  : tile.price
                    ? 'Cette escale attend son propriétaire.'
                    : 'Une escale spéciale de votre voyage.'}
              </p>
            </div>
            {tile.type === 'city' && (
              <p className="architecture-name">
                {architectureLabels[architectureForCity(tile.name)]}
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
                🪳 Hôtel de {tile.name} infesté · loyer −50 % · encore {property.roachTurns} retours
                du tour de son propriétaire.
              </p>
            )}
            {tile.price ? (
              <>
                <div className="property-stats">
                  <div>
                    <small>Terrain</small>
                    <strong>{money(tile.price)}</strong>
                  </div>
                </div>
                {tile.type === 'resort' && (
                  <p>Collection d’îles : 1 → 50 · 2 → 100 · 3 → 200 · 4 → 500 de loyer.</p>
                )}
                {tile.rents && (
                  <div className="rent-table">
                    {tile.rents.map((rent, level) => (
                      <div
                        key={level}
                        className={property?.ownerId && property.level === level ? 'selected' : ''}
                      >
                        <span>
                          {['Terrain', 'Maison 1', 'Maison 2', 'Maison 3', 'Hôtel'][level]}
                        </span>
                        <b>{money(rent, true)}</b>
                      </div>
                    ))}
                  </div>
                )}
                <p>
                  {reservedCity(current, tile.id)
                    ? 'Ville réservée au Marché flottant du tour de table 10. '
                    : ''}
                </p>
              </>
            ) : (
              <p>
                {tile.type === 'start'
                  ? 'Chaque passage en avant rapporte 300.'
                  : tile.type === 'island'
                    ? 'Jusqu’à trois tours sur l’île. Sortez par un double, un billet ou 200.'
                    : tile.type === 'championship'
                      ? 'Pour 50, doublez le loyer d’une de vos villes ou îles pendant 4 de vos tours. Un nouveau Festival renouvelle la durée, sans cumuler le bonus.'
                      : tile.type === 'travel'
                        ? 'Au prochain tour, voyagez pour 50 vers une case libre ou alliée.'
                        : tile.type === 'tax'
                          ? 'Vous payez 50 plus 10 % de la valeur foncière de vos propriétés.'
                          : 'Une des dix-huit cartes peut transformer votre voyage, y compris des attaques contre vos adversaires.'}
              </p>
            )}
            <button className="secondary" onClick={() => setSelected(null)}>
              Retour au plateau
            </button>
          </Modal>
        )}
        {screen === 'game' && !cinema.dismissed && cinema.frame.cue.kind === 'tax' && (
          <Modal title="Aïe… passage à la caisse !" onClose={cinema.dismiss}>
            <div className="tax-reveal">
              <div className="tax-illustration" aria-hidden="true" />
              <small>LES ACTUALITÉS DÉCALÉES DE L’ARCHIPEL</small>
              <h3>
                {
                  [
                    'Le président augmente encore le prix de l’essence. Même votre pion fait le plein !',
                    'Oups, dissolution de l’assemblée ! L’inflation explose… votre portefeuille demande des vacances.',
                    'Le président américain augmente les droits de douane. Vos souvenirs passent à la caisse !',
                  ][(current.turn + (cinema.frame.cue.tile ?? 0)) % 3]
                }
              </h3>
              <p>
                {current.players.find((p) => p.id === cinema.frame.cue.playerId)?.name} · somme à
                régler
              </p>
              <strong className="tax-amount">{money(cinema.frame.cue.amount ?? 0)}</strong>
              <p>
                {cinema.frame.cue.reason === 'fraud' ? (
                  'Contrôle fiscal ! Votre achat à prix réduit entraîne une taxe égale à deux fois le prix normal de la propriété. Le contrôle clôt ce risque.'
                ) : (
                  <>
                    Taxe : {money(current.config.taxBase ?? 0, true)} +{' '}
                    {current.config.taxRate * 100} % de votre patrimoine immobilier.
                  </>
                )}
              </p>
              <button className="primary" onClick={cinema.dismiss}>
                Aïe, j’ai compris !
              </button>
            </div>
          </Modal>
        )}
        {screen === 'game' && !cinema.dismissed && cinema.frame.cue.kind === 'card' && (
          <Modal
            title={
              'Carte de ' +
              (current.players.find((p) => p.id === cinema.frame.cue.playerId)?.name ?? active.name)
            }
            onClose={cinema.dismiss}
          >
            <div className="chance-reveal">
              <img
                src={import.meta.env.BASE_URL + 'textures/chance.webp'}
                alt="Une enveloppe pleine de surprises"
              />
              <h2>
                {festivalText(
                  current.config.cards.find((c) => c.id === cinema.frame.cue.cardId)?.title,
                )}
              </h2>
              <p>
                {propertyRulesText(
                  current.config.cards.find((c) => c.id === cinema.frame.cue.cardId)?.description,
                )}
              </p>
              <button className="primary" onClick={cinema.dismiss}>
                J’ai lu · continuer
              </button>
            </div>
          </Modal>
        )}
        <Suspense fallback={<div className="notice">Ouverture du salon…</div>}>
          {(modal === 'online' || online) && (
            <OnlineLobby
              open={modal === 'online'}
              autoCreate={createSalon}
              resume={resumeRequest}
              defaults={{
                name: names[0]!,
                count,
                teams: mode === 'teams',
                minutes,
                pace: comfort.pace,
              }}
              onClose={() => {
                setModal(null);
                if (online?.state) setScreen('game');
              }}
              onSession={(session) => {
                onlineSession.current = session;
              }}
              onLeave={() => {
                setOnlineResume(null);
                setResumeRequest(undefined);
                setCreateSalon(false);
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
        {screen === 'game' && current.winner && !rolling && !debugOpen && (
          <Modal title="Une fortune à célébrer !" onClose={goHome}>
            <div className="victory-art">
              ✦<span>♜</span>✦
            </div>
            <p className="winner-name">
              {current.winner.playerIds
                .map((id) => current.players.find((p) => p.id === id)?.name)
                .join(' & ')}
            </p>
            <p className="winner-reason">
              {current.winner.reasons.map((r) => victoryText[r] ?? r).join(' · ')}
            </p>
            <GameResults
              state={current}
              stats={online ? online.stats : save?.stats}
              onRematch={!online || online.self === online.host ? rematch : undefined}
              rematchDisabled={!!online && (online.busy || online.blocked)}
              rematchLabel={
                online && online.self !== online.host
                  ? 'L’hôte peut lancer la revanche dans ce salon.'
                  : undefined
              }
            />
            <button className="secondary" onClick={goHome}>
              Retour à l’accueil
            </button>
          </Modal>
        )}
        {debugging && screen === 'game' && (
          <div className="debug-toolbar">
            <button className="debug-access" onClick={openDebug}>
              DEBUG · Outils (F2)
            </button>
          </div>
        )}
        {debugOpen && save && (
          <Modal
            title="Mode debug · laboratoire"
            className="debug-modal"
            onClose={() => setModal(null)}
          >
            <Suspense fallback={<p>Chargement des outils…</p>}>
              <DebugPanel
                save={save}
                onCommand={debugCommand}
                canUndo={!!debugUndo.length}
                onUndo={() => {
                  const previous = debugUndo.at(-1);
                  if (previous) {
                    installDebug(previous);
                    setDebugUndo((old) => old.slice(0, -1));
                  }
                }}
                onImport={(next) => {
                  setDebugUndo((old) => [...old.slice(-19), save]);
                  installDebug(next);
                }}
              />
            </Suspense>
          </Modal>
        )}
      </div>
    </GameProviders>
  );
}
