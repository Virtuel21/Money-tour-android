import { translate, formatText } from '../i18n/translate';
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import type { GameState, Player } from '@money-tour/engine';
import type { Cue } from './presentation';
import { money } from './local';
import { GameIcon } from './GameIcon';

export function TurnBanner({
  player,
  self,
  local,
  color,
}: {
  player: Player;
  self?: string;
  local: boolean;
  color: string;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  const yours = !player.bot && (local || self === player.id);
  return (
    <div className="turn-banner" role="status" style={{ '--turn-color': color } as CSSProperties}>
      <small>
        {player.name} · {yours ? translate('À VOUS DE JOUER') : translate('EN ACTION')}
      </small>
      <strong>
        {yours ? translate('C’est votre tour !') : formatText('Au tour de {0}', player.name)}
      </strong>
    </div>
  );
}

export function MoneyFlight({
  cue,
  state,
  reduced,
  onClose,
}: {
  cue: Cue;
  state: GameState;
  reduced: boolean;
  onClose: () => void;
}) {
  const [path, setPath] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    const bank = (id?: string) =>
      [...document.querySelectorAll<HTMLElement>('[data-bank]')]
        .find((el) => el.dataset.bank === id)
        ?.getBoundingClientRect();
    const board = document.querySelector('.board-area')?.getBoundingClientRect();
    const source = bank(cue.payerId);
    const target = bank(cue.playerId);
    if (!board) return;
    setPath({
      '--from-x': `${source ? source.x + source.width / 2 : board.x + board.width / 2}px`,
      '--from-y': `${source ? source.y + source.height / 2 : board.y + board.height * 0.6}px`,
      '--to-x': `${target ? target.x + target.width / 2 : board.x + board.width / 2}px`,
      '--to-y': `${target ? target.y + target.height / 2 : board.y + board.height * 0.6}px`,
    } as CSSProperties);
  }, [cue]);
  const recipient = state.players.find((p) => p.id === cue.playerId)?.name;
  const payer = state.players.find((p) => p.id === cue.payerId)?.name;
  return (
    <div
      className={`money-feedback ${reduced ? 'motion-reduced' : ''}`}
      key={`${state.seq}-${cue.payerId}-${cue.playerId}-${cue.amount}-${cue.reason}`}
      style={path ?? undefined}
    >
      {path &&
        !reduced &&
        Array.from({ length: 8 }, (_, i) => (
          <span
            aria-hidden="true"
            className="flying-coin"
            key={i}
            style={
              {
                '--delay': `${i * Math.min(65, cue.duration * 0.04)}ms`,
                '--scatter': `${((i % 3) - 1) * 24}px`,
                animationDuration: `${Math.min(1000, cue.duration * 0.65)}ms`,
              } as CSSProperties
            }
          >
            <GameIcon name="coin" />
          </span>
        ))}
      <div className="money-toast" role="status">
        <button
          className="icon-button money-close"
          aria-label={translate('Fermer l’information de paiement')}
          onClick={onClose}
        >
          {translate('×')}
        </button>
        <small>
          {cue.reason === 'duel_stake'
            ? translate('MISE AU POT DU DUEL')
            : cue.reason === 'duel_prize'
              ? translate('DUEL REMPORTÉ')
              : cue.reason === 'duel_refund'
                ? translate('MISE REMBOURSÉE')
                : cue.reason === 'alliance'
                  ? translate('GAINS PARTAGÉS · ALLIANCE')
                  : cue.reason === 'jackpot'
                    ? translate('JACKPOT DU CASINO')
                    : cue.reason === 'casino'
                      ? translate('GAIN AU CASINO')
                      : cue.reason === 'karma'
                        ? recipient
                          ? translate('LE KARMA VOUS RÉCOMPENSE')
                          : translate('LE KARMA RÉÉQUILIBRE')
                        : cue.reason === 'purchase'
                          ? translate('PROPRIÉTÉ ACHETÉE')
                          : cue.reason === 'build'
                            ? translate('CONSTRUCTION')
                            : cue.reason === 'championship'
                              ? translate('FESTIVAL ORGANISÉ')
                              : cue.reason === 'start_bonus'
                                ? translate('PRIME DE DÉPART')
                                : cue.reason === 'rent'
                                  ? translate('LOYER VERSÉ')
                                  : cue.reason === 'attack'
                                    ? translate('ATTAQUE RÉUSSIE')
                                    : recipient
                                      ? translate('ARGENT REÇU')
                                      : translate('TAXE / FRAIS PAYÉS')}
        </small>
        <strong>
          {recipient ? '+' : '−'}
          {translate(money(cue.amount ?? 0, true))}
        </strong>
        <span>
          {payer ? translate(`${payer} → `) : ''}
          {recipient ?? translate(cue.reason === 'duel_stake' ? 'Le pot du duel' : 'La banque')}
        </span>
      </div>
    </div>
  );
}
