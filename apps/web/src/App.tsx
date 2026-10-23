import { translate, formatText } from './i18n/translate';
import { LanguagePicker, useLanguage } from './i18n/LanguagePicker';
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
import { SettingsPanel } from './game/SettingsPanel';
import { restoreDialogFocus, trapDialogFocus } from './game/dialogFocus';
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
const GuidedTutorial = lazy(() => import('./game/GuidedTutorial'));
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
import { DrawnCard } from './game/DrawnCard';
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
    | 'new-game'
    | 'online'
    | 'pocket'
    | 'bonus'
    | 'journal'
    | 'strategy'
    | 'taunt'
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
  const [setupTurn, setSetupTurn] = useState(false);
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
    [mode, setMode] = useState<'solo' | 'local' | 'teams'>('local');
  const [minutes, setMinutes] = useState(20),
    [names, setNames] = useState(() => [translate('Vous'), 'Sacha', 'Lou', 'Noa']);
  const firstNameEdited = useRef(false);
  useEffect(() => {
    if (!firstNameEdited.current) setNames((old) => [translate('Vous'), ...old.slice(1)]);
  }, [language]);
  const [bots, setBots] = useState([false, false, false, false]);
  const tutorialPause = useRef(false);
  const [paused, setPaused] = useState(false);
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
    shownFrame.cue.cardId ?? shownFrame.cue.tile,
    shownFrame.cue.playerId,
  ].join(':');
  const dismissDrawnCard = () => {
    // A late animation callback must never dismiss the next shared presentation.
    if (presentedFrame.current === shownFrame) cinema.dismiss();
  };
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
  };
  const rematch = () => {
    if (!current.winner) return;
    if (onlineSession.current) {
      void onlineSession.current.rematch();
      return;
    }
    const next = newLocal({
      ...rematchOptions(current),
      presentationPace: comfort.pace,
    });
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
    if (screen !== 'game' || (paused && action.type !== 'quit')) return;
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
    cinema.present(next.state, result.events);
    const messages = result.events.map((e) => eventText(e, next.state)).filter(Boolean);
    next.history = [...messages.slice().reverse(), ...history];
    setSave(next);
    if (messages.length) setHistory((old) => [...messages.reverse(), ...old]);
  };
  dispatchRef.current = act;
  useEffect(() => {
    if (save && !previewScenario() && !persistLocal(save))
      setNotice('Le navigateur ne permet pas la sauvegarde locale. Gardez cet onglet ouvert.');
  }, [save]);
  useEffect(() => {
    if (
      (previewScenario() && new URLSearchParams(location.search).get('clock') !== '1') ||
      online ||
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
  }, [screen, paused, rolling, Boolean(current.winner), Boolean(online)]);
  useEffect(() => {
    if (online || screen !== 'game' || paused || rolling || current.winner || !decisionPlayer.bot)
      return;
    const timer = setTimeout(() => dispatchRef.current(chooseBotAction(current)), 650);
    return () => clearTimeout(timer);
  }, [save, screen, paused, rolling, Boolean(online)]);
  const start = () => {
    if (!validMinutes(minutes)) return;
    const next = newLocal({
      randomFirstPlayer: true,
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
  const browseTile = (id: number) => {
    const actionable = !interactionDisabled && options.some((action) => action.tile === id);
    if (
      actionable ||
      current.phase === 'championship' ||
      purchaseOffer(current, online?.self)?.tile.id === id
    ) {
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
      <Suspense fallback={<p>{translate('Préparation de votre partie guidée…')}</p>}>
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
      value={{
        state: screen === 'game' ? current : null,
        held: paused || rolling,
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
            <button onClick={() => setModal('rules')}>
              {translate('Comment jouer ')}
              <span>↗</span>
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
                      ['teams', '2v2'],
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
                <div className="setup-options">
                  <label>
                    {translate('Voyageurs')}
                    <select
                      value={count}
                      disabled={mode === 'teams'}
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
                          setBots((old) =>
                            old.map((b, j) => (j === i ? e.target.value === 'bot' : b)),
                          )
                        }
                      >
                        <option value="human">{translate('Humain')}</option>
                        <option value="bot">{translate('Bot')}</option>
                      </select>
                      {mode === 'teams' && (
                        <span className="team-tag">{i % 2 ? translate('B') : translate('A')}</span>
                      )}
                    </div>
                  ))}
                </div>
                {(mode === 'solo' ? ['local', 'online'] : ['online', 'local']).map(
                  (target, index) => (
                    <button
                      key={target}
                      className={index === 0 ? 'primary launch' : 'secondary local-launch'}
                      onClick={() => {
                        if (target === 'local') {
                          if (save && !save.state.winner) setModal('new-game');
                          else start();
                        } else {
                          setResumeRequest(undefined);
                          setSetupTurn(false);
                          setCreateSalon(true);
                          setModal('online');
                        }
                      }}
                      disabled={!!online || !validMinutes(minutes)}
                    >
                      {target === 'online'
                        ? translate('Créer un salon en ligne')
                        : save && !save.state.winner
                          ? translate('Nouvelle partie sur cet appareil')
                          : translate('Jouer sur cet appareil')}
                      {index === 0 && <span aria-hidden="true"> →</span>}
                    </button>
                  ),
                )}
                <button
                  className="secondary local-launch"
                  disabled={!!online || !validMinutes(minutes)}
                  onClick={() => {
                    setResumeRequest(undefined);
                    setCreateSalon(false);
                    setSetupTurn(true);
                    setModal('online');
                  }}
                >
                  {translate('Configurer le serveur TURN')}
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
                      disabled={!!online || !validMinutes(minutes)}
                      onClick={() => {
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
                    : translate(
                        'Invitez vos amis avec le lien du salon, chacun sur son écran.',
                      )}{' '}
                  {translate('Sauvegarde sur cet appareil.')}
                </p>
              </div>
            </section>
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
                <Board
                  state={demo}
                  onTile={setSelected}
                  reducedMotion
                  demo
                  zoomPercent={comfort.boardZoom}
                />
              </Suspense>
              <div className="map-caption">
                <span>{translate('✦ Créé pour les bons moments')}</span>
                <span>{translate('2–4 voyageurs · dès maintenant')}</span>
              </div>
            </section>
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
                    ? translate('EXPÉDITION EN ÉQUIPE')
                    : online
                      ? translate('SALON EN LIGNE')
                      : translate('PARTIE LOCALE')}{' '}
                  {translate('· TOUR DE JEU ')}
                  {current.turn}
                </span>
                <h1 className="game-title">{translate('Le tour de la fortune')}</h1>
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
            {!mobile && (
              <div className="shared-game-info">
                <AdventureBanner state={current} />
                {!!warnings.length && (
                  <div className="victory-watch" role="status">
                    {warnings.map((w) => (
                      <p key={w.key}>⚠ {translate(w.message)}</p>
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
                    aria-label={formatText('Voir les propriétés de {0}', p.name)}
                    aria-pressed={inspectedOwner === p.id}
                    onClick={() => setInspectedOwner(inspectedOwner === p.id ? null : p.id)}
                  />
                  {!mobile && (
                    <button
                      className="player-collapse"
                      aria-label={formatText(
                        '{0} le volet de {1}',
                        collapsedPlayers[p.id] ? translate('Développer') : translate('Réduire'),
                        p.name,
                      )}
                      aria-expanded={!collapsedPlayers[p.id]}
                      title={
                        collapsedPlayers[p.id]
                          ? translate('Afficher les propriétés et les bonus')
                          : translate('Garder seulement le nom et le solde')
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
                  <span className={`avatar portrait portrait-${i}`} aria-hidden="true" />
                  <div className="player-summary">
                    <span className="player-name">
                      {p.name === 'Vous' && online ? formatText('Joueur {0}', i + 1) : p.name}{' '}
                      {p.insurance && (
                        <span
                          className="inventory-token"
                          title={
                            p.insurance.tile === null
                              ? translate('Assurance disponible')
                              : formatText(
                                  'Assurance : {0}',
                                  translate(current.config.board[p.insurance.tile]?.name),
                                )
                          }
                        >
                          <GameIcon name="shield" />
                        </span>
                      )}
                      <small className="player-seat-label">
                        {online?.self === p.id
                          ? translate('VOUS')
                          : p.bot
                            ? translate('BOT')
                            : current.mode === 'teams'
                              ? formatText(
                                  'ÉQ. {0}',
                                  p.team === 0 ? translate('A') : translate('B'),
                                )
                              : translate(pawnNames[i])}
                      </small>
                    </span>
                    <strong>
                      {p.eliminated ? translate('Faillite') : translate(money(p.cash, true))}
                    </strong>
                  </div>
                  {(mobile || !collapsedPlayers[p.id]) && (
                    <>
                      <span className="property-count" title={translate('Propriétés')}>
                        <GameIcon name="house" />{' '}
                        {Object.values(current.properties).filter((v) => v.ownerId === p.id).length}{' '}
                        · {p.laps}
                        {translate(' tour(s) du plateau terminé(s)')}
                      </span>
                      {p.islandTurns !== null && !p.eliminated && (
                        <span
                          className="island-remaining"
                          title={translate(
                            'Île perdue : un double, un billet ou la caution permettent de sortir plus tôt.',
                          )}
                        >
                          <span className="island-label">{translate('Île perdue · ')}</span>
                          {Math.max(0, current.config.maxIslandTurns - p.islandTurns)}
                          {translate(' tour(s) max')}
                        </span>
                      )}
                      {!!p.fraudLiability && (
                        <small
                          className="fraud-risk"
                          title={translate('Jusqu’au prochain passage par Départ')}
                        >
                          {translate('⚠ Taxe : ')}
                          {translate(money(p.fraudLiability, true))}
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
                        <p key={w.key}>⚠ {translate(w.message)}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
                      : mobile && options.length && !interactionDisabled
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
              <div className="board-controls">
                <button
                  className="strategy-button icon-label"
                  aria-label={formatText(
                    'Ma stratégie · {0}/{1} collections',
                    victoryProgress.completed,
                    victoryProgress.target,
                  )}
                  onClick={() => setModal('strategy')}
                >
                  <span className="board-nav-symbol">
                    <GameIcon name="target" />
                    <small aria-hidden="true">
                      {victoryProgress.completed}/{victoryProgress.target}
                    </small>
                  </span>
                  <span className="board-nav-label">
                    {mobile ? translate('Stratégie') : translate('Ma stratégie')}
                  </span>
                </button>
                <button
                  className="icon-label"
                  aria-label={translate('Journal des actions')}
                  onClick={() => setModal('journal')}
                >
                  <GameIcon name="journal" />
                  <span className="board-nav-label">
                    {mobile ? translate('Journal') : translate('Journal des actions')}
                  </span>
                </button>
                <button
                  className="icon-label"
                  aria-label={
                    mobile && options.length && !interactionDisabled
                      ? translate('Choisir une case')
                      : translate('Explorer les cases')
                  }
                  onClick={() => setModal('tiles')}
                >
                  <GameIcon name="map" />
                  <span className="board-nav-label">
                    {mobile
                      ? options.length && !interactionDisabled
                        ? translate('Choisir')
                        : translate('Escales')
                      : translate('Explorer les cases')}
                  </span>
                </button>
                {mobile ? (
                  <>
                    <button
                      className="icon-label"
                      aria-label={
                        inspectedOwner
                          ? translate('Tout afficher')
                          : boardPanned
                            ? translate('Recentrer mon pion')
                            : overview
                              ? translate('Suivre mon pion')
                              : translate('Vue globale')
                      }
                      aria-pressed={overview || boardPanned}
                      onClick={() => {
                        if (inspectedOwner) setInspectedOwner(null);
                        else if (boardPanned) {
                          setOverview(false);
                          setViewResetKey((key) => key + 1);
                        } else setOverview(!overview);
                      }}
                    >
                      <GameIcon name={boardPanned ? 'target' : 'compass'} />
                      <span className="board-nav-label">
                        {inspectedOwner
                          ? translate('Tout voir')
                          : boardPanned
                            ? translate('Recentrer')
                            : overview
                              ? translate('Suivre')
                              : translate('Vue globale')}
                      </span>
                    </button>
                    <button
                      className="icon-label"
                      aria-label={translate('Mon carnet')}
                      onClick={() => setModal('pocket')}
                    >
                      <GameIcon name="book" />
                      <span className="board-nav-label">{translate('Carnet')}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="icon-label" onClick={() => setInspectedOwner(null)}>
                      <GameIcon name="map" />
                      {translate('Vue globale')}
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
                <section
                  className="mondial-picker"
                  aria-label={translate('Choisir la propriété du Festival')}
                >
                  <strong>{translate('🎸 Où accueillir le Festival ?')}</strong>
                  {options.length ? (
                    <>
                      <p>
                        {translate(
                          'Vos propriétés sont éclairées. Cliquez sur une case ou une carte ci-dessous.',
                        )}
                      </p>
                      <div>
                        {options.map((a) => (
                          <button className="primary" key={a.tile} onClick={() => act(a)}>
                            {translate(current.config.board[a.tile]!.name)} ·{' '}
                            {translate(money(current.config.championshipFee, true))} <ActionClock />
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>
                      {current.config.board.some(
                        (t) => current.properties[t.id]?.ownerId === active.id,
                      )
                        ? translate(
                            translate('Il vous faut ') +
                              translate(money(current.config.championshipFee, true)) +
                              translate(' pour organiser le Festival.'),
                          )
                        : translate(
                            'Achetez d’abord une ville ou une île pour y organiser le Festival.',
                          )}
                    </p>
                  )}
                </section>
              )}

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
              <section className="action-card">
                <span className="eyebrow">
                  {paused
                    ? translate('PARTIE EN PAUSE')
                    : decisionPlayer.bot
                      ? translate('UN BOT RÉFLÉCHIT…')
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
                <p>
                  {paused
                    ? translate('Le chrono et les bots vous attendent.')
                    : decisionPlayer.bot || (online && online.self !== decisionPlayer.id)
                      ? translate(
                          'Suivez son déplacement. Vos commandes seront disponibles à votre tour.',
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
                {options.length > 0 && current.phase !== 'championship' && !interactionDisabled && (
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
                            ? translate('Choisir ma destination')
                            : translate('Voyage · fonds insuffisants')}{' '}
                          · {translate(money(current.config.travelFee, true))}
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
                  {translate(
                    'La règle spéciale de cette partie est affichée au-dessus du plateau.',
                  )}
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
          <Modal title={translate(selectedBonus.title)} onClose={() => setModal(null)}>
            <p className="bonus-description">{translate(selectedBonus.description)}</p>
            <button className="primary" onClick={() => setModal(null)}>
              {translate('Compris')}
            </button>
          </Modal>
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
        {modal === 'rules' && (
          <Modal title={translate('Comment jouer')} onClose={() => setModal(null)}>
            <p>
              {translate(
                'Apprenez en jouant : un guide éclaire les commandes et vous accompagne dans une partie simulée, à votre rythme.',
              )}
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
              {translate('Démarrer le tutoriel interactif')}
            </button>
            {online && (
              <p>
                {translate('Le tutoriel sera disponible après avoir quitté votre salon en ligne.')}
              </p>
            )}
            <details>
              <summary>{translate('Lire toutes les règles')}</summary>
              <div className="rules">
                <p className="lead">{translate('Un tour de plateau, beaucoup de possibilités.')}</p>
                <h3>{translate('1. Lancez, voyagez, investissez')}</h3>
                <p>
                  {translate(
                    'Lancez deux dés. Achetez une ville libre, améliorez une de vos villes ou payez le loyer à votre arrivée chez un adversaire. Un double permet de rejouer ; trois doubles vous envoient sur l’île.',
                  )}
                </p>
                <h3>{translate('2. Construisez votre fortune')}</h3>
                <p>
                  {translate(
                    'Construisez sur une ville à vous sans attendre la rue complète : jusqu’à trois maisons, puis un hôtel après ',
                  )}
                  {current.config.hotelUnlockLaps ?? 1}
                  {translate(
                    ' tours complets du plateau. Chaque passage rapporte 300. Après le loyer, toute ville adverse, même avec hôtel, et toute île peuvent être rachetées au double de sa valeur foncière.',
                  )}
                </p>
                <h3>{translate('3. Plusieurs façons de gagner')}</h3>
                <p>
                  {translate(
                    'Possédez toutes les propriétés achetables d’un côté, île comprise, ou complétez trois rues pour gagner. Les quatre îles réunies comptent comme une rue complète : deux rues de villes et les quatre îles donnent donc le triple monopole. Elles donnent aussi un loyer de 500. Vous gagnez aussi si tous vos adversaires font faillite. À la fin du chrono, le plus grand patrimoine gagne ; une égalité se partage.',
                  )}
                </p>
                <h3>{translate('4. Des escales qui changent tout')}</h3>
                <p>
                  {translate(
                    '32 cases : 6 rues de deux villes et 2 rues de trois villes, 4 îles privées, 2 cases Chance, 1 taxe, 1 casino, 1 assurance, 1 duel et 4 coins spéciaux. Le paquet contient 23 cartes Chance différentes, tirées sans remise. Les loyers sont payés automatiquement par le visiteur. Les cartes se résolvent pour leur destinataire uniquement.',
                  )}
                </p>
                <p>
                  {translate(
                    'Selon la règle tirée, trois festivals peuvent doubler les loyers. Le Festival coûte 50 et double le loyer pendant quatre retours du propriétaire. L’île vous retient jusqu’à trois tours. Le Tour du monde ouvre un voyage payant au prochain tour, ou dès l’action supplémentaire si vous arrivez avec un double. Si votre cash manque, vendez des biens à la banque à moitié de leur valeur.',
                  )}
                </p>
                <h3>{translate('5. Tentez votre chance, protégez vos biens')}</h3>
                <p>
                  {translate(
                    'Les casinos proposent une roulette ou une machine à sous, sans mise. Le jackpot rapporte 10 % de votre solde ; chaque résultat gagnant vaut au moins 50 avant partage éventuel d’une alliance. Ses chances augmentent à chaque visite du casino. La case Duel permet de défier un adversaire à pierre-feuille-ciseaux avec une mise acceptée par les deux joueurs.',
                  )}
                </p>
                <p>
                  {translate(
                    'L’assurance donne un jeton unique à placer sur un bien : il bloque une destruction ou une expropriation, puis disparaît. Squatteur se garde pour éviter un loyer. Expropriation remet une ville ou île adverse à la banque ; les cafards divisent le loyer d’un hôtel par deux pendant deux tours de son propriétaire.',
                  )}
                </p>
                <p>
                  {translate(
                    'Fraude fiscale permet un achat à moitié prix. Jusqu’au prochain passage Départ, tomber sur Taxe coûte deux fois le prix normal de cet achat. Une dette impose de choisir les biens à vendre ; la faillite survient seulement si leur valeur totale de revente et votre compte ne suffisent pas.',
                  )}
                </p>
                <p>
                  {translate(
                    'Alliance temporaire prélève la moitié des gains d’un joueur jusqu’à la fin de son prochain tour. Une crise économique rare (au plus deux par partie, espacées de huit tours de table) divise tous les loyers par deux pendant un tour complet de tous les joueurs. Le duel propose une mise identique acceptée par les deux adversaires : pierre, feuille, ciseaux avec choix secrets ; le gagnant remporte le pot, une égalité relance les choix sans nouvelle mise jusqu’à un vainqueur.',
                  )}
                </p>
                <p>
                  {translate(
                    'Tremblement de terre : 3 % à chaque nouveau tour de table éligible dès le quatrième, uniquement si des bâtiments existent et hors crise. Un joueur possédant des bâtiments, puis une de ses villes construites, sont tirés au sort. Une maison disparaît ; un hôtel redevient trois maisons. L’assurance de cette ville bloque le séisme une fois. Maximum deux séismes par partie, espacés d’au moins six tours de table.',
                  )}
                </p>
                <h3>{translate('À quatre, jouez en équipe')}</h3>
                <p>
                  {translate(
                    'Les sièges 1 et 3 affrontent les sièges 2 et 4. Pas de loyer entre alliés ; les collections se partagent pour la victoire. Le cash reste individuel.',
                  )}
                </p>
              </div>
            </details>
            <button className="secondary" onClick={() => setModal(null)}>
              {translate('Fermer')}
            </button>
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
        {modal === 'tiles' && (
          <Modal
            title={
              current.phase === 'travel' && !interactionDisabled
                ? translate('Choisir ma destination')
                : formatText('Les {0} escales', current.config.board.length)
            }
            onClose={() => setModal(null)}
          >
            {mobile || (current.phase === 'travel' && !interactionDisabled) ? (
              <MobileTiles
                state={current}
                choices={interactionDisabled ? [] : options.map((a) => a.tile)}
                onTile={browseTile}
              />
            ) : (
              <div className="tile-list">
                {current.config.board.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelected(t.id);
                    }}
                  >
                    <i style={{ background: t.color ?? '#e6b94a' }} />
                    {translate(tileTitle(t))}
                    <small>
                      {t.price ? translate(money(t.price, true)) : translate('Escale spéciale')}
                    </small>
                  </button>
                ))}
              </div>
            )}
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
        {screen === 'game' &&
          !rolling &&
          !modal &&
          !paused &&
          current.phase === 'duel' &&
          !sharedDialog.hidden &&
          current.duel && (
            <Modal title={translate('Le grand duel')} onClose={sharedDialog.onClose}>
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
          <Modal title={translate('Choisissez votre alliance')}>
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
                      <button className="primary" key={a.targetId} onClick={() => act(a)}>
                        {translate('Choisir ')}
                        {current.players.find((p) => p.id === a.targetId)!.name}
                        <ActionClock />
                      </button>
                    ),
                )}
            </div>
            <button
              className="secondary"
              onClick={() => act({ type: 'finish', playerId: active.id })}
            >
              {translate('Passer ')}
              <ActionClock />
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
        {screen === 'game' && !interactionDisabled && !modal && current.phase === 'casino' && (
          <Modal title={translate('Bienvenue au casino')}>
            <CasinoView state={current} act={act} />
          </Modal>
        )}
        {screen === 'game' &&
          !paused &&
          !cinema.dismissed &&
          cinema.frame.cue.kind === 'casino' && (
            <Modal title={translate('Le casino joue pour vous')} onClose={cinema.dismiss}>
              <CasinoView
                key={current.seq + '-casino'}
                state={current}
                cue={cinema.frame.cue}
                act={act}
              />
              <button className="secondary" onClick={cinema.dismiss}>
                {translate('Passer l’animation')}
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
            <Modal
              onClose={cinema.dismiss}
              className={cinema.frame.cue.reason === 'earthquake' ? 'earthquake-modal' : ''}
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
              <button className="primary" onClick={cinema.dismiss}>
                {translate('Continuer')}
              </button>
            </Modal>
          ))}
        {screen === 'game' && !interactionDisabled && !modal && current.phase === 'rent' && (
          <Modal title={translate('Un loyer… ou votre carte Squatteur ?')}>
            <p>
              {translate('Vous arrivez à ')}
              {translate(current.config.board[active.position]?.name)}
              {translate('. Le loyer est de')} {translate(money(current.pendingRent?.amount ?? 0))}.
            </p>
            <p>{translate('La carte Squatteur annule ce paiement et sera défaussée.')}</p>
            <div className="decision-actions">
              {available
                .filter((a) => ['use_squatter', 'pay_rent'].includes(a.type))
                .map((a) => (
                  <button
                    className={a.type === 'use_squatter' ? 'primary' : 'secondary'}
                    key={a.type}
                    onClick={() => act(a)}
                  >
                    {translate(actionLabel(a))}
                    <ActionClock />
                  </button>
                ))}
            </div>
          </Modal>
        )}
        {screen === 'game' && !interactionDisabled && !modal && current.phase === 'debt' && (
          <Modal title={translate('Réglons cette dette ensemble')}>
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
                      {translate(actionLabel(a))}
                      <ActionClock />
                    </button>
                  ))}
              </div>
            )}
          </Modal>
        )}
        {modal === 'taunt' && tauntSender && screen === 'game' && (
          <Modal
            title={translate('À vous de taquiner !')}
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
        {tile && !offer && (
          <Modal title={translate(tileTitle(tile))} onClose={() => setSelected(null)}>
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
                        className={property?.ownerId && property.level === level ? 'selected' : ''}
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
                            'Au prochain tour, voyagez pour 50 vers une case libre ou alliée.',
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
            <button className="secondary" onClick={() => setSelected(null)}>
              {modal === 'pocket'
                ? translate('Retour au carnet')
                : modal === 'tiles'
                  ? translate('Retour aux escales')
                  : modal === 'strategy'
                    ? translate('Retour à ma stratégie')
                    : translate('Retour au plateau')}
            </button>
          </Modal>
        )}
        {screen === 'game' && !cinema.dismissed && cinema.frame.cue.kind === 'tax' && (
          <DrawnCard
            cardKey={drawnCardKey}
            tone="tax"
            reducedMotion={reduced}
            ownerLabel={
              translate('Carte de ') +
              (current.players.find((p) => p.id === cinema.frame.cue.playerId)?.name ?? active.name)
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
            <strong className="tax-amount">{translate(money(cinema.frame.cue.amount ?? 0))}</strong>
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
        {screen === 'game' && !cinema.dismissed && cinema.frame.cue.kind === 'card' && (
          <DrawnCard
            cardKey={drawnCardKey}
            reducedMotion={reduced}
            ownerLabel={
              translate('Carte de ') +
              (current.players.find((p) => p.id === cinema.frame.cue.playerId)?.name ?? active.name)
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
              open={modal === 'online'}
              autoCreate={createSalon}
              setupTurn={setupTurn}
              resume={resumeRequest}
              defaults={{
                name: names[0]!,
                count,
                teams: mode === 'teams',
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
        {screen === 'game' && current.winner && !rolling && (
          <Modal title={translate('Une fortune à célébrer !')} onClose={goHome}>
            <div className="victory-art">
              ✦<span>♜</span>✦
            </div>
            <p className="winner-name">
              {current.winner.playerIds
                .map((id) => current.players.find((p) => p.id === id)?.name)
                .join(' & ')}
            </p>
            <p className="winner-reason">
              {current.winner.reasons.map((r) => translate(victoryText[r] ?? r)).join(' · ')}
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
              {translate('Retour à l’accueil')}
            </button>
          </Modal>
        )}
      </div>
    </GameProviders>
  );
}
