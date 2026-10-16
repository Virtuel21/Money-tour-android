import { translate, formatText } from '../i18n/translate';
import { scaledAmount } from '@money-tour/engine';
import { useEffect, useState, useId } from 'react';
import {
  auctionCommitment,
  getDecisionPlayerId,
  type GameAction,
  type GameState,
} from '@money-tour/engine';
import { auctionOfferKey, readAuctionOffer, saveAuctionOffer } from './auctionOffers';
import { ActionClock } from './ActionClock';
import { money } from './local';
const drafts = new Map<string, string>();

export function AuctionView({
  state,
  self,
  act,
  disabled,
  gameKey,
}: {
  state: GameState;
  self?: string;
  act: (a: GameAction) => void;
  disabled: boolean;
  gameKey?: string;
}) {
  const a = state.auction!,
    actor = state.players.find((p) => p.id === getDecisionPlayerId(state))!;
  // Network ticks briefly mark the session busy. Keep the form mounted so a
  // tick cannot steal keyboard focus or hide an offer while it is being typed.
  const canPlay = !actor.bot && (!self || self === actor.id);
  const draftKey = auctionOfferKey(a.id, actor.id, gameKey);
  const initialAmount = () =>
    String(
      readAuctionOffer(state, actor.id, gameKey)?.amount ??
        drafts.get(draftKey) ??
        scaledAmount(state.config, 50000),
    );
  const amountHint = useId();
  const [amount, setAmount] = useState(initialAmount);
  const [opened, setOpened] = useState(false);
  const [submitted, setSubmitted] = useState(!!readAuctionOffer(state, actor.id, gameKey));
  useEffect(() => {
    setAmount(initialAmount());
    setOpened(false);
    setSubmitted(!!readAuctionOffer(state, actor.id, gameKey));
  }, [a.id, actor.id]);
  const secret = () => readAuctionOffer(state, actor.id, gameKey);
  const bid = () => {
    if (disabled) return;
    // A retry must reuse the same envelope: the previous commit may already
    // have reached the host even when its acknowledgement has not arrived.
    const entry = secret() ?? {
      amount: Number(amount),
      salt: Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
    };
    saveAuctionOffer(a.id, actor.id, entry, gameKey);
    setAmount(String(entry.amount));
    setSubmitted(true);
    act({
      type: 'auction_commit',
      playerId: actor.id,
      hash: auctionCommitment(a.id, actor.id, entry.amount, entry.salt),
    });
  };
  const tile = state.config.board[a.tile]!;
  return (
    <div className="auction-view">
      <div className="auction-property" style={{ borderTopColor: tile.color }}>
        <span>⌂</span>
        <h3>{translate(tile.name)}</h3>
        <p>
          {translate('Prix habituel ')}
          {translate(money(tile.price!, true))}
          {translate(' · Loyer ')}
          {translate(money(tile.rents![0]!, true))}
        </p>
      </div>
      <p>
        {translate(
          'Une seule offre par joueur. Seul le gagnant paie. En cas d’égalité, tirage au sort entre les meilleurs enchérisseurs.',
        )}
      </p>
      <div className="auction-seals" role="group" aria-label={translate('Offres déposées')}>
        {a.participants.map((id) => (
          <span key={id}>
            {state.players.find((p) => p.id === id)!.name}{' '}
            {a.passed.includes(id) ? '—' : a.commitments[id] ? translate('✉ Scellée') : '…'}
          </span>
        ))}
      </div>
      {!canPlay ? (
        <div>
          <p role="status">
            {actor.name}
            {translate(' prépare son enveloppe. Les montants restent cachés.')}
          </p>
          {self === actor.id && actor.bot && (
            <button
              className="primary"
              disabled={disabled}
              onClick={() => act({ type: 'set_control', playerId: actor.id, bot: false })}
            >
              {translate('Reprendre mon siège')}
            </button>
          )}
        </div>
      ) : a.stage === 'commit' ? (
        <>
          {!self && !opened ? (
            <button className="primary" onClick={() => setOpened(true)}>
              {translate('Je suis ')}
              {actor.name}
              {translate(' · préparer mon offre ')}
              <ActionClock />
            </button>
          ) : (
            <>
              <label>
                {translate('Votre offre secrète (maximum ')}
                {translate(money(actor.cash, true))})
                <input
                  aria-label={translate('Votre offre secrète')}
                  type="number"
                  inputMode="numeric"
                  readOnly={submitted}
                  min="1"
                  max={actor.cash}
                  step="1"
                  aria-invalid={
                    !Number.isSafeInteger(Number(amount)) ||
                    Number(amount) < 1 ||
                    Number(amount) > actor.cash
                  }
                  aria-describedby={amountHint}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    drafts.set(draftKey, e.target.value);
                  }}
                />
              </label>
              <p id={amountHint} role="status">
                {!Number.isSafeInteger(Number(amount)) ||
                Number(amount) < 1 ||
                Number(amount) > actor.cash
                  ? formatText(
                      'Saisissez un montant entier entre 1 et {0}.',
                      translate(money(actor.cash, true)),
                    )
                  : translate('Montant entier, sans décimales.')}
              </p>
              {submitted && (
                <p role="status">
                  {translate('Offre envoyée. Un nouvel envoi conserve le même montant.')}
                </p>
              )}
              <button
                className="primary"
                disabled={
                  disabled ||
                  !Number.isSafeInteger(Number(amount)) ||
                  Number(amount) < 1 ||
                  Number(amount) > actor.cash
                }
                onClick={bid}
              >
                {translate('Envoyer mon offre ')}
                <ActionClock />
              </button>
            </>
          )}
          <button
            disabled={disabled}
            onClick={() => act({ type: 'auction_pass', playerId: actor.id })}
          >
            {translate('Ne pas participer ')}
            <ActionClock />
          </button>
        </>
      ) : (
        <>
          <p role="status">
            {translate('Toutes les offres sont verrouillées. Dépouillement automatique en cours…')}
          </p>
          {!secret() && (
            <p>{translate('Cette enveloppe n’est plus disponible sur cet appareil.')}</p>
          )}
          {!secret() && (
            <button
              disabled={disabled}
              onClick={() => act({ type: 'auction_pass', playerId: actor.id })}
            >
              {translate('Continuer sans cette offre ')}
              <ActionClock />
            </button>
          )}
        </>
      )}
    </div>
  );
}
