import { translate, formatText } from '../i18n/translate';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { getLegalActions, type GameAction, type GameState } from '@money-tour/engine';
import type { Cue } from './presentation';
import { ActionClock } from './ActionClock';
import { ActionCardActions } from './ActionCard';
import { money } from './local';

export function CasinoView({
  state,
  cue,
  act,
  disabled = false,
}: {
  state: GameState;
  cue?: Cue;
  act: (a: GameAction) => void;
  disabled?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const actionPending = useRef(false);
  useEffect(() => {
    if (disabled) return;
    actionPending.current = false;
    setPending(false);
  }, [cue, disabled, state.seq]);
  const choose = (action: GameAction) => {
    if (disabled || actionPending.current) return;
    actionPending.current = true;
    setPending(true);
    act(action);
  };
  useEffect(() => {
    if (!cue) return;
    const timer = setTimeout(() => setRevealed(true), Math.min(1900, cue.duration * 0.55));
    return () => clearTimeout(timer);
  }, [cue]);
  const game = cue?.casinoGame ?? state.casino?.game ?? 'roulette';
  const player = state.players[state.currentPlayer]!;
  const symbols = ['🍒', '🔔', '7', '★'];
  return (
    <div
      className={`casino-view ${cue ? 'casino-playing' : ''} ${revealed ? 'casino-revealed' : ''}`}
    >
      {game === 'roulette' ? (
        <div className="roulette-stage" aria-hidden="true">
          <div
            className="roulette-wheel"
            style={
              {
                '--roulette-stop': cue?.casinoColor === 'red' ? '2148.75deg' : '2126.25deg',
                animationDuration: cue ? `${Math.min(1900, cue.duration * 0.55)}ms` : undefined,
              } as CSSProperties
            }
          />
          <span className="roulette-pointer">▼</span>
        </div>
      ) : (
        <div className="slot-reels" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="reel-window">
              {cue && !revealed ? (
                <span className="reel-strip">
                  {[...symbols, symbols[0]].map((symbol, index) => (
                    <b key={index}>{translate(symbol)}</b>
                  ))}
                </span>
              ) : (
                <b>{translate(symbols[revealed ? (cue?.casinoReels?.[i] ?? 0) : i])}</b>
              )}
            </span>
          ))}
        </div>
      )}
      {cue ? (
        <div className="casino-result" role="status">
          <h3>
            {revealed
              ? cue.jackpot
                ? translate('JACKPOT !')
                : (cue.amount ?? 0) > 0
                  ? translate('Bien joué !')
                  : translate('La chance prend une pause…')
              : translate('La chance est en mouvement…')}
          </h3>
          {revealed && (
            <>
              <p>
                {game === 'roulette'
                  ? formatText(
                      'La bille s’arrête sur {0}.',
                      cue.casinoColor === 'red' ? translate('rouge') : translate('noir'),
                    )
                  : translate('Les rouleaux ont parlé !')}
              </p>
              <strong>
                {(cue.amount ?? 0) > 0
                  ? translate('+' + translate(money(cue.amount!)))
                  : translate('Aucun gain, aucune perte')}
              </strong>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="eyebrow">
            {translate('ENTRÉE OFFERTE · ')}
            {game === 'roulette' ? translate('ROULETTE ROUGE / NOIR') : translate('MACHINE À SOUS')}
          </p>
          <h3>
            {translate('Jackpot potentiel :')}{' '}
            {translate(
              money(Math.max(state.config.casinoMinWin ?? 0, Math.floor(player.cash * 0.1)), true),
            )}
          </h3>
          <p>
            {state.casino?.chance}
            {translate(' % de chances de jackpot. La probabilité monte de')}{' '}
            {state.config.casinoChanceStep}
            {translate(' points à chaque visite de ce casino, jusqu’à')}{' '}
            {state.config.casinoMaxChance}
            {translate(' %, puis repart à ')}
            {state.config.casinoBaseChance}
            {translate(' % après un jackpot.')}
          </p>
          <p className="setup-note">
            {game === 'roulette'
              ? translate('Bonne couleur : +2 % de votre compte.')
              : translate('Deux symboles identiques : +2 % ; trois : +5 %.')}{' '}
            {translate('Jackpot : +10 % de votre compte, sans cumul. Pas de mise ni de perte.')}
            {translate(
              !!state.config.casinoMinWin &&
                ` Chaque résultat gagnant rapporte au moins ${money(state.config.casinoMinWin, true)}, avant partage éventuel de l’alliance.`,
            )}
          </p>
          <ActionCardActions className="casino-card-actions">
            <div className="casino-actions">
              {getLegalActions(state)
                .filter((a) => a.type.startsWith('casino_'))
                .map((a) => (
                  <button
                    key={a.type}
                    className={'primary ' + a.type}
                    disabled={disabled || pending}
                    onClick={() => choose(a)}
                  >
                    <span>
                      {a.type === 'casino_red'
                        ? translate('Choisir rouge')
                        : a.type === 'casino_black'
                          ? translate('Choisir noir')
                          : translate('Lancer les rouleaux')}
                    </span>
                    <ActionClock />
                  </button>
                ))}
            </div>
            <button
              className="secondary"
              disabled={disabled || pending}
              onClick={() => choose({ type: 'finish', playerId: player.id })}
            >
              {translate('Passer mon tour au casino ')}
              <ActionClock />
            </button>
          </ActionCardActions>
        </>
      )}
    </div>
  );
}
