import { auctionCommitment, type GameState } from '@money-tour/engine';
import { readPrivateChoice, savePrivateChoice } from './privateStorage';

type Offer = { amount: number; salt: string };
const offers = new Map<string, Offer>();
export const auctionOfferKey = (id: string, player: string, gameKey?: string) =>
  `money-tour.auction.${gameKey ? gameKey + '.' : ''}${id}.${player}`;

export function saveAuctionOffer(id: string, player: string, offer: Offer, gameKey?: string) {
  const key = auctionOfferKey(id, player, gameKey);
  offers.set(key, offer);
  savePrivateChoice(key, offer, !!gameKey);
}

export function readAuctionOffer(state: GameState, player: string, gameKey?: string): Offer | null {
  const auction = state.auction;
  if (!auction) return null;
  const keys = [auctionOfferKey(auction.id, player, gameKey)];
  if (auction.stage === 'reveal') keys.push(auctionOfferKey(auction.id, player));
  for (const key of keys) {
    try {
      const offer = (offers.get(key) ?? readPrivateChoice(key)) as Offer | null;
      if (
        offer &&
        Number.isSafeInteger(offer.amount) &&
        offer.amount > 0 &&
        typeof offer.salt === 'string' &&
        /^[a-f0-9]{32,64}$/.test(offer.salt) &&
        (!auction.commitments[player] ||
          auctionCommitment(auction.id, player, offer.amount, offer.salt) ===
            auction.commitments[player])
      )
        return offer as Offer;
    } catch {
      /* Invalid or unavailable browser storage must never reveal a different bid. */
    }
  }
  return null;
}
