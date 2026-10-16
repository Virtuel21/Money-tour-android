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
    <section className="property-insight" aria-label="Cette propriété en bref">
      <header>
        <strong>
          <GameIcon name={tile.type === 'resort' ? 'island' : 'house'} /> {collectionLabel(tile)}
        </strong>
        <span>
          {rent.owner ? `Propriété de ${rent.owner.name}` : 'Disponible à l’achat'}
          {insured ? ' · Assurée' : ''}
        </span>
      </header>
      <dl>
        <div>
          <dt>{rent.owner ? 'Loyer effectif' : 'Loyer au niveau actuel'}</dt>
          <dd>{money(rent.rent)}</dd>
        </div>
        <div>
          <dt>{tile.type === 'resort' ? `Base · ${rent.islandCount} île(s)` : 'Loyer de base'}</dt>
          <dd>{money(rent.base)}</dd>
        </div>
      </dl>
      {rent.modifiers.length ? (
        <ul className="property-modifiers">
          {rent.modifiers.map((modifier) => (
            <li key={modifier.label}>
              {modifier.label}
              <b>×{String(modifier.factor).replace('.', ',')}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p>Aucun bonus ou malus de loyer actif.</p>
      )}
      {group && !progress.eliminated && (
        <div className="property-collection-value">
          <strong>
            {state.mode === 'teams'
              ? 'Votre équipe'
              : state.players.find((p) => p.id === playerId)?.name}{' '}
            : {group.owned} / {group.tiles.length} dans cette collection
          </strong>
          <p>
            {owned
              ? group.complete
                ? 'Collection complète : elle compte pour le monopole.'
                : `Encore ${group.missing.length} propriété(s) pour compléter cette rue.`
              : group.missing.length === 1
                ? 'Cette propriété compléterait votre collection.'
                : `Avec cette propriété : ${group.owned + 1} / ${group.tiles.length} pour compléter cette rue.`}
          </p>
          {onTile && (
            <div
              className="property-neighbours"
              role="group"
              aria-label="Propriétés de la collection"
            >
              {group.tiles
                .filter((t) => t.id !== tileId)
                .map((t) => (
                  <button type="button" key={t.id} onClick={() => onTile(t.id)}>
                    {t.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
