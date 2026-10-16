import { translate, formatText } from '../i18n/translate';
import { useId, useState } from 'react';
import { getPropertyValue, type GameState } from '@money-tour/engine';
import { ActionClock } from './ActionClock';
import { money } from './local';
import { tileTitle } from './tileTitle';
import { collectionLabel } from './strategy';
import { GameIcon } from './GameIcon';
import './strategy.css';

export function MobileTiles({
  state,
  choices,
  onTile,
}: {
  state: GameState;
  choices: number[];
  onTile: (id: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const listId = useId();
  const available = choices.length
    ? state.config.board.filter((t) => choices.includes(t.id))
    : state.config.board;
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr');
  const query = normalize(search.trim());
  const tiles = available.filter((tile) =>
    normalize(
      `${tile.name} ${translate(tile.name)} ${collectionLabel(tile)} ${translate(collectionLabel(tile))}`,
    ).includes(query),
  );
  const selling = state.phase === 'debt';
  const size = selling ? 4 : 6;
  const pages = Math.max(1, Math.ceil(tiles.length / size));
  const index = Math.min(page, pages - 1);
  return (
    <>
      <label className="field tile-search">
        {translate('Rechercher une escale')}
        <input
          type="search"
          value={search}
          placeholder={translate('Ville, île ou rue…')}
          autoComplete="off"
          aria-controls={listId}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
      </label>
      <p className="tile-results" role="status">
        {tiles.length}
        {translate(' escale')}
        {tiles.length > 1 ? translate('s') : ''}
        {translate(search && ` pour « ${search} »`)}
      </p>
      {choices.length > 0 && !selling && (
        <p>{translate('Choisissez une des cases disponibles.')}</p>
      )}
      {!tiles.length && (
        <p>{translate('Aucune escale trouvée. Essayez un autre nom ou effacez la recherche.')}</p>
      )}
      <div id={listId} className="tile-list mobile-tile-list">
        {tiles.slice(index * size, index * size + size).map((t) => (
          <button key={t.id} onClick={() => onTile(t.id)}>
            <i style={{ background: t.color ?? '#e6b94a' }} />
            {translate(tileTitle(t))}
            {(t.type === 'city' || t.type === 'resort') && (
              <span className="tile-collection-label">{translate(collectionLabel(t))}</span>
            )}
            <small>
              {selling
                ? translate(
                    translate('Vendre · ') +
                      translate(
                        money(
                          Math.floor(getPropertyValue(state, t.id) * state.config.resaleRate),
                          true,
                        ),
                      ),
                  )
                : state.phase === 'travel' && choices.length > 0
                  ? translate(
                      translate('Voyage · ') + translate(money(state.config.travelFee, true)),
                    )
                  : t.price
                    ? translate(money(t.price, true))
                    : translate('Escale spéciale')}
            </small>
            {selling && <ActionClock />}
          </button>
        ))}
      </div>
      {pages > 1 && (
        <div className="pocket-pages">
          <button
            disabled={!index}
            aria-label={translate('Cases précédentes')}
            aria-controls={listId}
            onClick={() => setPage(index - 1)}
          >
            <GameIcon name="arrowLeft" />
            {translate('Précédent')}
          </button>
          <span role="status" aria-label={formatText('Page {0} sur {1}', index + 1, pages)}>
            {index + 1} / {pages}
          </span>
          <button
            disabled={index === pages - 1}
            aria-label={translate('Cases suivantes')}
            aria-controls={listId}
            onClick={() => setPage(index + 1)}
          >
            {translate('Suivant ')}
            <GameIcon name="arrowRight" />
          </button>
        </div>
      )}
    </>
  );
}
