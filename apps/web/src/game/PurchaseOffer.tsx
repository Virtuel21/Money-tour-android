import { translate, formatText } from '../i18n/translate';
import { useId, useState } from 'react';
import {
  reservedCity,
  getLegalActions,
  getPurchaseQuote,
  getConstructionQuote,
  getBuyoutQuote,
  type GameState,
} from '@money-tour/engine';
import { ActionClock } from './ActionClock';
import { money } from './local';
import { BuildingIllustration } from './BuildingIllustration';

export function purchaseOffer(state: GameState, self?: string, buyout = false) {
  const player = state.players[state.currentPlayer]!;
  const tile = state.config.board[player.position]!;
  if (
    state.winner ||
    state.phase !== 'property' ||
    player.bot ||
    (self !== undefined && self !== player.id) ||
    !tile.price ||
    reservedCity(state, tile.id) ||
    (buyout
      ? !getBuyoutQuote(state)?.available
      : state.properties[tile.id]?.ownerId &&
        !(
          state.config.singlePropertyDecision &&
          state.properties[tile.id]?.ownerId === player.id &&
          tile.type === 'city' &&
          state.properties[tile.id]!.level < state.config.hotelLevel
        ))
  )
    return null;
  return {
    player,
    tile,
    buyout,
    canBuy: getLegalActions(state).some((a) => a.type === (buyout ? 'buyout' : 'buy')),
  };
}
export function PurchaseDetails({
  state,
  onBuy,
  onFraud,
  onPass,
  buyout = false,
}: {
  state: GameState;
  buyout?: boolean;
  onBuy: (level: number) => void;
  onFraud?: (level: number) => void;
  onPass: () => void;
}) {
  const { player, tile } = purchaseOffer(state, undefined, buyout)!;
  const owned = state.properties[tile.id]?.ownerId === player.id;
  const currentLevel = state.properties[tile.id]?.level ?? 0;
  const [level, setLevel] = useState(owned ? currentLevel + 1 : buyout ? currentLevel : 0);
  const getQuote = (index: number) =>
    buyout
      ? getBuyoutQuote(state, index)
      : owned
        ? getConstructionQuote(state, index)
        : getPurchaseQuote(state, index);
  const quote = getQuote(level)!;
  const fraudQuote = getPurchaseQuote(state, level, true)!;
  const canBuy = quote.canBuy;
  const insufficientFunds = quote.available && player.cash < quote.total;
  const feedbackId = useId();
  const hotelLocked = player.laps < (state.config.hotelUnlockLaps ?? 1);
  const labels = ['Terrain', '1 maison', '2 maisons', '3 maisons', 'Hôtel'];
  const modern = state.config.buildingRequiresGroup === false;
  return (
    <div
      className="purchase-offer purchase-simple"
      style={{ '--property-color': tile.color ?? '#348d91' } as React.CSSProperties}
    >
      <header className="purchase-title">
        <div>
          <small>
            {buyout
              ? tile.type === 'resort'
                ? translate('RACHETER CETTE ÎLE')
                : translate('RACHETER CETTE VILLE')
              : owned
                ? translate('AMÉLIORER MA VILLE')
                : tile.type === 'resort'
                  ? translate('ÎLE PRIVÉE')
                  : translate('VILLE DISPONIBLE')}
          </small>
          <h3>{translate(tile.name)}</h3>
        </div>
        <span>{translate(money(quote.total, true))}</span>
      </header>
      {tile.type === 'city' ? (
        <>
          <div
            className="purchase-levels"
            role="group"
            aria-label={translate('Choisir les bâtiments à acheter')}
          >
            {tile.rents!.map((_, index) => (
              <button
                key={index}
                aria-pressed={level === index}
                disabled={!getQuote(index)?.available}
                className={
                  index === 4 && hotelLocked && !getQuote(index)?.available ? 'level-locked' : ''
                }
                aria-label={formatText(
                  '{0} : loyer {1}{2}',
                  translate(labels[index]),
                  translate(money(getQuote(index)!.rent, true)),
                  index === 4 && hotelLocked && !getQuote(index)?.available
                    ? translate(', hôtel verrouillé')
                    : '',
                )}
                onClick={() => setLevel(index)}
              >
                <BuildingIllustration level={index} cityName={tile.name} />
                <strong>{translate(labels[index])}</strong>
                <span className="level-rent">
                  {translate('Loyer ')}
                  <b>{translate(money(getQuote(index)!.rent, true))}</b>
                </span>
                <span className="level-check" aria-hidden="true">
                  {level === index && (
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path
                        d="m5 12 4 4L19 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                {index === 4 && hotelLocked && !getQuote(index)?.available && (
                  <span className="level-lock">
                    {translate('Après ')}
                    {state.config.hotelUnlockLaps ?? 1}
                    {translate(' tours')}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="purchase-preview" aria-live="polite">
            <span>
              {translate('Loyer après achat ')}
              <strong>{translate(money(quote.rent, true))}</strong>
            </span>
            {level > 0 && (
              <span>
                {translate('Construction ')}
                <strong>+{translate(money(quote.buildings, true))}</strong>
              </span>
            )}
          </div>
          <p className="purchase-rule">
            {modern
              ? formatText(
                  'Maisons sans rue complète. Construction d’un hôtel après {0} tours du plateau. Un hôtel existant peut être racheté avant.',
                  state.config.hotelUnlockLaps ?? 1,
                )
              : translate(
                  'Rue complète requise. Deux maisons maximum avant le premier passage Départ.',
                )}{' '}
            {buyout
              ? formatText(
                  'Rachat à {0} : {1}. Les bâtiments existants sont conservés ; seuls les nouveaux sont ajoutés au prix. Un chantier par visite.',
                  state.players.find((p) => p.id === state.properties[tile.id]?.ownerId)?.name,
                  translate(money(quote.land, true)),
                )
              : owned
                ? formatText(
                    'Vous possédez déjà {0}. Seuls les nouveaux bâtiments sont facturés. Un chantier par visite.',
                    currentLevel === 0
                      ? translate('le terrain')
                      : translate(labels[currentLevel].toLowerCase()),
                  )
                : translate(
                    'Le prix comprend le terrain et les bâtiments sélectionnés. Un achat par visite.',
                  )}
            {translate(
              !state.config.bundledPurchase && 'Cette sauvegarde conserve l’achat du terrain seul.',
            )}
          </p>
        </>
      ) : (
        <div className="island-rents">
          <BuildingIllustration level={0} island />
          <div className="island-rates">
            <h3>{translate('Loyer selon vos îles')}</h3>
            <dl className="island-rent-grid">
              {state.config.resortRents.map((rent, i) => (
                <div key={i}>
                  <dt>
                    {i + 1}
                    {translate(' île')}
                    {i ? translate('s') : ''}
                  </dt>
                  <dd>{translate(money(rent, true))}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
      <p className="purchase-wallet">
        {translate('Votre compte ')}
        <strong>{translate(money(player.cash, true))}</strong>
        {canBuy && (
          <span>
            {translate(' · Après achat ')}
            {translate(money(player.cash - quote.total, true))}
          </span>
        )}
      </p>
      {!canBuy && (
        <p id={feedbackId} className="purchase-feedback" role="status">
          {!quote.available
            ? translate('Ce niveau n’est pas encore disponible.')
            : formatText(
                'Fonds insuffisants. Il manque {0} pour cet achat.',
                translate(money(Math.max(0, quote.total - player.cash), true)),
              )}
        </p>
      )}
      <div className="purchase-buttons">
        <button
          className={`primary purchase-cta${insufficientFunds ? ' purchase-insufficient' : ''}`}
          disabled={!canBuy}
          aria-describedby={!canBuy ? feedbackId : undefined}
          onClick={() => onBuy(level)}
        >
          <span>
            {buyout ? translate('Racheter') : owned ? translate('Passer à') : translate('Acheter')}{' '}
            {tile.type === 'resort'
              ? translate('l’île')
              : level === 0
                ? translate('le terrain')
                : owned
                  ? translate(level === 4 ? 'hôtel' : labels[level])
                  : formatText('avec {0}', translate(level === 4 ? 'hôtel' : labels[level]))}{' '}
            · {translate(money(quote.total, true))}
          </span>
          <ActionClock />
        </button>
        <button className="secondary purchase-pass" onClick={onPass}>
          <span>{buyout ? translate('Annuler') : translate('Passer')}</span>
          <ActionClock />
        </button>
      </div>
      <p className="purchase-buyout">
        {translate('Rachat par un adversaire :')}{' '}
        <strong>
          {translate(
            money(
              Math.floor(
                (tile.price! +
                  (tile.buildCosts ?? [])
                    .slice(1, level + 1)
                    .reduce((sum, cost) => sum + cost, 0)) *
                  state.config.buyoutMultiplier,
              ),
              true,
            ),
          )}
        </strong>
      </p>
      {onFraud && getLegalActions(state).some((a) => a.type === 'buy_fraud') && (
        <>
          <button
            className="secondary purchase-fraud"
            disabled={!fraudQuote.canBuy}
            onClick={() => onFraud(level)}
          >
            {translate('Fraude fiscale · ')}
            {translate(money(fraudQuote.total, true))}
            <ActionClock />
          </button>
          <p className="fraud-risk">
            {translate('Réduction sur le terrain uniquement. Risque : ')}
            {translate(money(tile.price! * 2, true))}
            {translate(' sur Taxe, jusqu’au prochain Départ.')}
          </p>
        </>
      )}
    </div>
  );
}
