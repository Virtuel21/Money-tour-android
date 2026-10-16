import { translate } from '../i18n/translate';
import { getNetWorth, type GameState } from '@money-tour/engine';
import { money } from './local';
import type { GameStats } from './gameStats';
import './game-summary.css';
import { publicVictoryProgress } from './strategy';

export function GameResults({
  state,
  stats,
  onRematch,
  rematchDisabled,
  rematchLabel,
}: {
  state: GameState;
  stats?: GameStats;
  onRematch?: () => void;
  rematchDisabled?: boolean;
  rematchLabel?: string;
}) {
  const ranked = [...state.players].sort(
    (a, b) => getNetWorth(state, b.id) - getNetWorth(state, a.id),
  );
  return (
    <section className="game-summary" aria-label={translate('Bilan du voyage')}>
      <p>
        {translate('Classement par patrimoine · ')}
        {Math.floor(state.elapsedMs / 60000)}
        {translate(' min de jeu')}
      </p>
      {ranked.map((player) => {
        const owned = state.config.board.filter(
          (tile) => state.properties[tile.id]?.ownerId === player.id,
        );
        const collections = publicVictoryProgress(state, player.id).completed;
        const best = Object.entries(stats?.rentByTile[player.id] ?? {}).sort(
          (a, b) => b[1] - a[1],
        )[0];
        return (
          <article
            key={player.id}
            className={state.winner?.playerIds.includes(player.id) ? 'summary-winner' : ''}
          >
            <header>
              <strong>{player.name}</strong>
              <b>{translate(money(getNetWorth(state, player.id)))}</b>
            </header>
            <dl>
              <div>
                <dt>{translate('Argent disponible')}</dt>
                <dd>{translate(money(player.cash))}</dd>
              </div>
              <div>
                <dt>{translate('Propriétés conservées')}</dt>
                <dd>
                  {owned.length}
                  {translate(' dont')}{' '}
                  {
                    owned.filter((t) => state.properties[t.id]?.level === state.config.hotelLevel)
                      .length
                  }{' '}
                  {translate('hôtel(s)')}
                </dd>
              </div>
              <div>
                <dt>
                  {translate('Rues complètes')}
                  {state.mode === 'teams' ? translate(' de l’équipe') : ''}
                </dt>
                <dd>{collections}</dd>
              </div>
              <div>
                <dt>{translate('Tours complets du plateau')}</dt>
                <dd>{player.laps}</dd>
              </div>
              {stats && (
                <div>
                  <dt>
                    {translate('Loyers encaissés')}
                    {!stats.complete ? translate(' depuis la reprise') : ''}
                  </dt>
                  <dd>{translate(money(stats.rent[player.id] ?? 0))}</dd>
                </div>
              )}
            </dl>
            {best && (
              <p className="summary-highlight">
                {translate('Plus gros revenu locatif : ')}
                {translate(state.config.board[Number(best[0])]?.name)} · {translate(money(best[1]))}
              </p>
            )}
          </article>
        );
      })}
      {!stats && (
        <p>{translate('Les loyers historiques ne sont pas disponibles pour cette sauvegarde.')}</p>
      )}
      {onRematch ? (
        <button className="primary" disabled={rematchDisabled} onClick={onRematch}>
          {translate(rematchLabel ?? 'Revanche avec les mêmes joueurs')}
        </button>
      ) : (
        rematchLabel && <p role="status">{translate(rematchLabel)}</p>
      )}
      <small>
        {translate(
          'Mêmes joueurs, équipes et durée. Un nouveau plateau et de nouveaux objectifs sont tirés.',
        )}
      </small>
    </section>
  );
}
