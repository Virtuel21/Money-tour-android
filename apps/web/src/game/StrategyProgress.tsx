import { translate, formatText } from '../i18n/translate';
import type { GameState } from '@money-tour/engine';
import { publicVictoryProgress, type CollectionProgress } from './strategy';
import { money } from './local';
import { GameIcon } from './GameIcon';
import './strategy.css';

export function StrategyProgress({
  state,
  playerId,
  onHighlight,
  onTile,
  expanded = false,
}: {
  state: GameState;
  playerId: string;
  onHighlight?: (ids: number[]) => void;
  onTile: (id: number) => void;
  expanded?: boolean;
}) {
  const progress = publicVictoryProgress(state, playerId);
  const name = state.players.find((p) => p.id === playerId)?.name ?? 'Joueur';
  const collections = [...progress.groups].sort(
    (a, b) =>
      Number(a.complete) - Number(b.complete) ||
      b.owned / b.tiles.length - a.owned / a.tiles.length,
  );
  const renderCollection = (group: CollectionProgress) => (
    <li key={group.key}>
      <div className="strategy-collection-title">
        <strong>{translate(group.label)}</strong>
        <span>
          {group.complete
            ? translate('Complète')
            : translate(`${group.owned} / ${group.tiles.length}`)}
        </span>
        {onHighlight && (
          <button
            type="button"
            aria-label={formatText('Repérer {0} sur le plateau', translate(group.label))}
            onClick={() => onHighlight(group.tiles.map((t) => t.id))}
          >
            <GameIcon name="map" />
            {translate(' Repérer')}
          </button>
        )}
      </div>
      {!!group.missing.length && (
        <p>
          {translate('Il manque')}{' '}
          {group.missing.map(({ tile, owner }, i) => (
            <span key={tile.id}>
              {translate(i > 0 && ', ')}
              <button
                type="button"
                className="strategy-destination"
                onClick={() => onTile(tile.id)}
              >
                {translate(tile.name)} <small>({translate(owner)})</small>
              </button>
            </span>
          ))}
          .
        </p>
      )}
    </li>
  );
  return (
    <section
      className="strategy-progress"
      aria-label={formatText('Progression vers la victoire de {0}', name)}
    >
      <header>
        <span>
          <GameIcon name="trophy" />{' '}
          {state.mode === 'teams' ? formatText('Équipe de {0}', name) : name}
          {translate(' · Cap sur la victoire')}
        </span>
        <strong>
          {progress.completed} / {progress.target}
          {translate(' rues complètes')}
        </strong>
      </header>
      <div
        className="strategy-meter"
        role="progressbar"
        aria-label={translate('Rues complètes')}
        aria-valuemin={0}
        aria-valuemax={progress.target}
        aria-valuenow={Math.min(progress.completed, progress.target)}
      >
        <i
          style={{
            width: `${Math.min(100, (progress.completed / Math.max(1, progress.target)) * 100)}%`,
          }}
        />
      </div>
      <dl className="strategy-money">
        <div>
          <dt>{translate('Argent disponible')}</dt>
          <dd>{translate(money(progress.cash, true))}</dd>
        </div>
        <div>
          <dt>{translate('Patrimoine')}</dt>
          <dd>{translate(money(progress.netWorth, true))}</dd>
        </div>
      </dl>
      <p className="strategy-note">
        {translate(
          'Au chrono, le patrimoine départage : argent + valeur des propriétés et bâtiments.',
        )}
      </p>
      {progress.eliminated ? (
        <p>{translate('Éliminé : aucune collection active.')}</p>
      ) : (
        <details open={expanded || undefined}>
          <summary>{translate('Voir les propriétés à obtenir')}</summary>
          <p className="strategy-note">
            {state.mode === 'teams'
              ? translate('Les possessions des équipiers encore en jeu sont réunies. ')
              : ''}
            {progress.islands
              ? formatText(
                  'Les {0} îles réunies comptent pour une rue complète.',
                  progress.islands.tiles.length,
                )
              : ''}
          </p>
          <ul className="strategy-collections">{collections.map(renderCollection)}</ul>
          {(progress.lines.length > 0 || (progress.islandVictory && progress.islands)) && (
            <details className="strategy-alternatives">
              <summary>{translate('Autres victoires par les propriétés')}</summary>
              {progress.lines.length > 0 && (
                <>
                  <p>{translate('Posséder toutes les propriétés d’un même côté du plateau.')}</p>
                  <ul className="strategy-collections">{progress.lines.map(renderCollection)}</ul>
                </>
              )}
              {progress.islandVictory && progress.islands && (
                <p>
                  {translate('Réunir les ')}
                  {progress.islands.tiles.length}
                  {translate(' îles donne aussi une victoire immédiate.')}
                </p>
              )}
            </details>
          )}
          <p className="strategy-note">
            {translate('Faillites : ')}
            {progress.opposingSides}{' '}
            {state.mode === 'teams'
              ? translate('équipe(s) adverse(s)')
              : translate('adversaire(s)')}
            {translate(' encore en jeu.')}
          </p>
        </details>
      )}
    </section>
  );
}
