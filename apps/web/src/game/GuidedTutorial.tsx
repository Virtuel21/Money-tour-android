import { translate, formatText } from '../i18n/translate';
import { useAuctionReveal } from './useAuctionReveal';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  chooseBotAction,
  createRng,
  duelCommitment,
  getDecisionPlayerId,
  getLegalActions,
  getNetWorth,
  reduceGame,
  type GameAction,
} from '@money-tour/engine';
import { lessons, quickLessons, tutorialScene, type LessonId } from './tutorial';
import { AuctionView } from './AuctionView';
import { DuelView } from './DuelView';
import { CasinoView } from './CasinoView';
import { PurchaseDetails } from './PurchaseOffer';
import { MobilePocket } from './MobilePocket';
import { MobileTiles } from './MobileTiles';
import { AdventureBanner } from './AdventureHUD';
import { GameClockContext } from './ActionClock';
import { usePresentation } from './usePresentation';
import { useMobile } from './useMobile';
import { money } from './local';
import './tutorial.css';
const Board = lazy(() => import('../board/Board3D'));

export default function GuidedTutorial({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [quick, setQuick] = useState(true);
  const course = quick ? quickLessons : lessons;
  const [attempt, setAttempt] = useState(0);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => previousFocus.current?.focus();
  }, []);
  return (
    <dialog
      className="guided-tutorial"
      ref={dialog}
      aria-label={translate('Partie guidée')}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="tutorial-header">
        <strong>
          {translate('MONEY TOUR ')}
          <span>{translate('· PARTIE GUIDÉE')}</span>
        </strong>
        <button
          aria-pressed={!quick}
          onClick={() => {
            setQuick(!quick);
            setIndex(0);
          }}
        >
          {quick ? translate('Toutes les leçons (27)') : translate('Découverte en 5 actions')}
        </button>
        <label>
          {translate('Escales')}{' '}
          <select
            aria-label={translate('Choisir une leçon')}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {course.map((lesson, i) => (
              <option value={i} key={lesson.id}>
                {i + 1}. {translate(lesson.title)}
              </option>
            ))}
          </select>
        </label>
        <button onClick={onClose}>{translate('Quitter le tutoriel')}</button>
      </header>
      <Lesson
        key={`${quick}:${index}:${attempt}`}
        index={index}
        course={course}
        onReplay={() => setAttempt(attempt + 1)}
        onBack={() => setIndex(index - 1)}
        onNext={() => (index === course.length - 1 ? onClose() : setIndex(index + 1))}
      />
    </dialog>
  );
}

function Lesson({
  index,
  course,
  onBack,
  onNext,
  onReplay,
}: {
  index: number;
  course: readonly (typeof lessons)[number][];
  onBack: () => void;
  onNext: () => void;
  onReplay: () => void;
}) {
  const lesson = course[index]!;
  const [state, setState] = useState(() => {
    const scene = tutorialScene(lesson.id);
    scene.players[0]!.name = translate('Vous');
    if (scene.auction) scene.auction.id += '-' + crypto.randomUUID();
    if (scene.duel) scene.duel.id += '-' + crypto.randomUUID();
    return scene;
  });
  const practiceSecrets = useRef({ auction: state.auction?.id, duel: state.duel?.id });
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [exploring, setExploring] = useState(false);
  const [inspected, setInspected] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mobile = useMobile();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cinema = usePresentation(state, reduced);
  const shown = cinema.busy ? cinema.frame.state : state;
  const legal = getLegalActions(state);
  const targetActions = legal.filter(
    (a): a is Extract<GameAction, { tile: number }> =>
      'tile' in a && ['travel', 'place_championship', 'insure', 'attack', 'sell'].includes(a.type),
  );
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(
    () => () => {
      try {
        for (const [kind, id] of Object.entries(practiceSecrets.current))
          if (id)
            for (const player of ['p1', 'p2'])
              sessionStorage.removeItem(`money-tour.${kind}.${id}.${player}`);
      } catch {
        /* Practice also works without browser storage. */
      }
    },
    [],
  );
  const complete = (message: string) => {
    setDone(true);
    setFeedback(message);
  };
  function act(action: GameAction) {
    if (cinema.busy || done) return;
    let result = reduceGame(state, action, createRng('lesson-roll'));
    if (result.error) {
      setFeedback('Essayez le bouton indiqué pour cette étape.');
      return;
    }
    const events = [...result.events];
    // Sacha completes only the other seat's sealed decisions, never the learner's.
    for (
      let i = 0;
      i < 4 &&
      ['auction', 'duel'].includes(result.state.phase) &&
      getDecisionPlayerId(result.state) === 'p2';
      i++
    ) {
      const d = result.state.duel;
      const salt = 'b'.repeat(32);
      const reply: GameAction = !d
        ? chooseBotAction(result.state)
        : d.stage === 'accept'
          ? { type: 'duel_accept', playerId: 'p2' }
          : d.stage === 'commit'
            ? {
                type: 'duel_commit',
                playerId: 'p2',
                hash: duelCommitment(d.id, 'p2', 'rock', salt),
              }
            : { type: 'duel_reveal', playerId: 'p2', choice: 'rock', salt };
      result = reduceGame(result.state, reply, createRng('lesson-reply'));
      events.push(...result.events);
    }
    setState(result.state);
    cinema.present(result.state, events);
    const finished =
      lesson.id === 'auction'
        ? !result.state.auction
        : lesson.id === 'duel'
          ? !result.state.duel
          : true;
    if (finished)
      complete(
        (events.find((e) => e.type === 'auction_result' || e.type === 'duel_result')
          ?.message as string) ??
          'Bien joué ! Observez le résultat sur le plateau et vos comptes, puis passez à la suite.',
      );
  }
  useAuctionReveal(state, 'p1', act, cinema.busy || done);
  const clickTile = (id: number) => {
    const action = targetActions.find((a) => a.tile === id);
    if (action) act(action);
    else {
      setSelected(id);
      if (lesson.id === 'controls') complete('Les cases restent consultables à tout moment.');
    }
  };
  const simple: Partial<Record<LessonId, [GameAction['type'], string]>> = {
    roll: ['roll', 'Lancer les dés'],
    rent: ['roll', 'Sacha lance les dés'],
    build: ['upgrade', 'Construire à Madrid · 75'],
    start: ['roll', 'Passer par Départ'],
    card: ['roll', 'Tirer une carte Chance'],
    tax: ['roll', 'Visiter la case Taxe'],
    squatter: ['use_squatter', 'Utiliser Squatteur'],
    island: ['pay_bail', 'Quitter l’île · 200'],
    alliance: ['alliance', 'Choisir Sacha'],
  };
  const primary = simple[lesson.id];
  const action = primary && legal.find((a) => a.type === primary[0]);
  const reading = ['card', 'tax'].includes(cinema.frame.cue.kind) && cinema.busy;
  const showResult =
    (cinema.busy || done) && !reading && !['carnet', 'controls', 'adventure'].includes(lesson.id);
  const spot = (target: string) =>
    (showResult ? target === 'board' || target === 'accounts' : lesson.target === target)
      ? ' tutorial-spotlit'
      : '';
  return (
    <GameClockContext.Provider value={{ state: null, held: true }}>
      <div className="tutorial-dimmer" aria-hidden="true" />
      <div className={'tutorial-accounts' + spot('accounts')} inert={lesson.target !== 'accounts'}>
        {shown.players.map((player, i) => (
          <button
            key={player.id}
            onClick={() => {
              setInspected(player.id);
              complete(
                `${player.name} : ${money(getNetWorth(shown, player.id), true)} de patrimoine, dont ${money(player.cash, true)} disponibles.`,
              );
            }}
          >
            <span>
              {player.name}
              {lesson.id === 'teams' ? formatText(' · Équipe {0}', (i % 2) + 1) : ''}
            </span>
            <strong>{translate(money(player.cash, true))}</strong>
            <small>
              {translate('Patrimoine ')}
              {translate(money(getNetWorth(shown, player.id), true))}
            </small>
          </button>
        ))}
      </div>
      <div className={`tutorial-scene ${showResult ? 'showing-result' : ''}`}>
        <section
          className={'tutorial-board' + spot('board')}
          inert={lesson.target !== 'board' && !showResult}
          aria-label={translate('Plateau d’entraînement')}
        >
          <Suspense fallback={<p>{translate('Chargement du plateau…')}</p>}>
            <Board
              state={shown}
              cue={cinema.frame.cue}
              onTile={clickTile}
              mobile={mobile}
              reducedMotion={reduced}
              overview={!showResult}
              self="p1"
              inspectedOwner={inspected}
              choices={done ? [] : targetActions.map((a) => a.tile)}
              selecting={lesson.target === 'board' && !done}
            />
          </Suspense>
          {lesson.target === 'board' && !done && (
            <div
              className="tutorial-destinations"
              role="group"
              aria-label={translate('Cases disponibles')}
            >
              {targetActions.map((a) => (
                <button key={a.tile} disabled={cinema.busy} onClick={() => act(a)}>
                  {translate(state.config.board[a.tile]!.name)}
                </button>
              ))}
            </div>
          )}
        </section>
        <section
          className={'tutorial-action' + spot('action')}
          inert={lesson.target !== 'action'}
          aria-label={translate('Commandes d’entraînement')}
        >
          <p className="eyebrow">
            {shown.players[shown.currentPlayer]!.name} ·{' '}
            {cinema.busy ? translate('EN ACTION') : translate('À VOUS DE JOUER')}
          </p>
          {reading ? (
            <div className="chance-reveal">
              <h3>
                {cinema.frame.cue.kind === 'tax'
                  ? translate('Le trésor public vous attend')
                  : translate(
                      state.config.cards.find((c) => c.id === cinema.frame.cue.cardId)?.title,
                    )}
              </h3>
              <p>
                {cinema.frame.cue.kind === 'tax'
                  ? formatText(
                      'Prélèvement annoncé : {0}.',
                      translate(money(cinema.frame.cue.amount ?? 0, true)),
                    )
                  : translate(
                      state.config.cards.find((c) => c.id === cinema.frame.cue.cardId)?.description,
                    )}
              </p>
              <button className="primary" onClick={cinema.advance}>
                {translate('J’ai lu · continuer')}
              </button>
            </div>
          ) : !done && !cinema.busy && ['buy', 'resorts', 'fraud', 'build'].includes(lesson.id) ? (
            <PurchaseDetails
              state={state}
              onBuy={(level) =>
                act({ type: lesson.id === 'build' ? 'upgrade' : 'buy', playerId: 'p1', level })
              }
              onFraud={
                lesson.id === 'fraud'
                  ? (level) => act({ type: 'buy_fraud', playerId: 'p1', level })
                  : undefined
              }
              onPass={() => act({ type: 'finish', playerId: 'p1' })}
            />
          ) : !done && state.auction ? (
            <AuctionView state={state} self="p1" act={act} disabled={cinema.busy} />
          ) : !done && state.duel ? (
            <DuelView state={state} self="p1" act={act} disabled={cinema.busy} />
          ) : !done && state.casino ? (
            <CasinoView state={state} act={act} />
          ) : primary && !done ? (
            <button
              className="primary"
              disabled={!action || cinema.busy}
              onClick={() => action && act(action)}
            >
              {translate(primary[1])}
            </button>
          ) : null}
          {lesson.id === 'carnet' && (
            <div
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest('button')?.textContent?.includes('Masquer'))
                  complete('Votre objectif est à nouveau caché.');
              }}
            >
              <MobilePocket state={state} self="p1" onTile={setSelected} />
            </div>
          )}
          {lesson.id === 'adventure' && (
            <>
              <AdventureBanner state={state} />
              <button
                className="primary"
                onClick={() => complete('Pensez à relire cette règle au début de chaque partie.')}
              >
                {translate('J’ai lu la règle spéciale')}
              </button>
            </>
          )}
          {lesson.id === 'controls' && (
            <>
              <button
                className="primary"
                onClick={() => {
                  setInspected(null);
                  complete('Le plateau entier est visible.');
                }}
              >
                {translate('Vue globale')}
              </button>
              <button
                onClick={() => {
                  setExploring(!exploring);
                  complete('Chaque case est consultable dans cette liste.');
                }}
              >
                {translate('Explorer les cases')}
              </button>
              {exploring && <MobileTiles state={state} choices={[]} onTile={clickTile} />}
            </>
          )}
          {selected !== null && (
            <p>
              {translate(state.config.board[selected]!.name)} ·{' '}
              {translate(money(state.config.board[selected]!.price ?? 0, true))}
            </p>
          )}
          {done && !reading && (
            <p role="status">
              {cinema.busy
                ? translate(cinema.frame.cue.message ?? 'Observez le déplacement et les comptes…')
                : translate(feedback)}
            </p>
          )}
          {lesson.target !== 'action' && <p>{translate(lesson.task)}</p>}
        </section>
      </div>
      <section className="tutorial-coach" aria-label={translate('Guide de la partie')}>
        <div className="tutorial-progress">
          <span style={{ width: `${((index + 1) / course.length) * 100}%` }} />
        </div>
        <small>
          {translate('ESCALE ')}
          {index + 1} / {course.length}
          {translate(' · À VOTRE RYTHME')}
        </small>
        <h2 ref={heading} tabIndex={-1}>
          {translate(lesson.title)}
        </h2>
        <p>{translate(lesson.text)}</p>
        <strong className="tutorial-task">
          {done && !cinema.busy
            ? translate('✓ ' + translate(feedback || 'Étape terminée'))
            : translate('☝ ' + translate(lesson.task))}
        </strong>
        <div className="tutorial-navigation">
          <button onClick={onBack} disabled={index === 0}>
            {translate('Précédent')}
          </button>
          {done && !cinema.busy && <button onClick={onReplay}>{translate('Rejouer')}</button>}
          <button className="primary" onClick={onNext} disabled={cinema.busy}>
            {cinema.busy
              ? translate('Observez le plateau…')
              : index === course.length - 1
                ? translate('Terminer le tutoriel')
                : done && !cinema.busy
                  ? translate('Continuer →')
                  : translate('Passer cette étape →')}
          </button>
        </div>
      </section>
    </GameClockContext.Provider>
  );
}
