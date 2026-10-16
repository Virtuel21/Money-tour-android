import { translate, formatText } from '../i18n/translate';
import { numberLocale } from '../i18n/language';
import type { GameState } from '@money-tour/engine';
import { collectionLabel, propertyRentInsight, publicVictoryProgress } from './strategy';
import { money } from './local';
import { GameIcon } from './GameIcon';
import './strategy.css';

export function PropertyInsight({
  state,
  tileId,
  playerId,
  onTile,
}: {
  state: GameState;
  tileId: number;
  playerId: string;
  onTile?: (id: number) => void;
}) {
  const tile = state.config.board.find((t) => t.id === tileId);
  const rent = propertyRentInsight(state, tileId);
  if (!tile || !rent) return null;
  const progress = publicVictoryProgress(state, playerId);
  const group = progress.groups.find((g) => g.tiles.some((t) => t.id === tileId));
  const owned = group && !group.missing.some((m) => m.tile.id === tileId);
  const insured = rent.owner?.insurance?.tile === tileId;
  return (
    <section className="property-insight" aria-label={translate('Cette propriété en bref')}>
      <header>
        <strong>
          <GameIcon name={tile.type === 'resort' ? 'island' : 'house'} />{' '}
          {translate(collectionLabel(tile))}
        </strong>
        <span>
          {rent.owner
            ? formatText('Propriété de {0}', rent.owner.name)
            : translate('Disponible à l’achat')}
          {insured ? translate(' · Assurée') : ''}
        </span>
      </header>
      <dl>
        <div>
          <dt>{rent.owner ? translate('Loyer effectif') : translate('Loyer au niveau actuel')}</dt>
          <dd>{translate(money(rent.rent))}</dd>
        </div>
        <div>
          <dt>
            {tile.type === 'resort'
              ? formatText('Base · {0} île(s)', rent.islandCount)
              : translate('Loyer de base')}
          </dt>
          <dd>{translate(money(rent.base))}</dd>
        </div>
      </dl>
      {rent.modifiers.length ? (
        <ul className="property-modifiers">
          {rent.modifiers.map((modifier) => (
            <li key={modifier.label}>
              {translate(modifier.label)}
              <b>
                {translate('×')}
                {new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 2 }).format(
                  modifier.factor,
                )}
              </b>
            </li>
          ))}
        </ul>
      ) : (
        <p>{translate('Aucun bonus ou malus de loyer actif.')}</p>
      )}
      {group && !progress.eliminated && (
        <div className="property-collection-value">
          <strong>
            {state.mode === 'teams'
              ? translate('Votre équipe')
              : state.players.find((p) => p.id === playerId)?.name}{' '}
            : {group.owned} / {group.tiles.length}
            {translate(' dans cette collection')}
          </strong>
          <p>
            {owned
              ? group.complete
                ? translate('Collection complète : elle compte pour le monopole.')
                : formatText(
                    'Encore {0} propriété(s) pour compléter cette rue.',
                    group.missing.length,
                  )
              : group.missing.length === 1
                ? translate('Cette propriété compléterait votre collection.')
                : formatText(
                    'Avec cette propriété : {0} / {1} pour compléter cette rue.',
                    group.owned + 1,
                    group.tiles.length,
                  )}
          </p>
          {onTile && (
            <div
              className="property-neighbours"
              role="group"
              aria-label={translate('Propriétés de la collection')}
            >
              {group.tiles
                .filter((t) => t.id !== tileId)
                .map((t) => (
                  <button type="button" key={t.id} onClick={() => onTile(t.id)}>
                    {translate(t.name)}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
