import { useState } from 'react';
import { getDecisionPlayerId, type GameState } from '@money-tour/engine';
import './game-summary.css';

const storageKey = 'money-tour.context-tips.v1';
export function contextualTip(
  state: GameState,
  self = state.players[state.currentPlayer]?.id,
): { id: string; title: string; text: string } | undefined {
  if (state.winner) return;
  const recipient = state.players.find((player) => player.id === self);
  if (!recipient || recipient.bot || recipient.eliminated || getDecisionPlayerId(state) !== self)
    return;
  if (state.auction)
    return {
      id: 'auction',
      title: 'Une seule offre à envoyer',
      text: 'Le contour repère le bien vendu. Vous pouvez fermer puis rouvrir la fenêtre. Le dépouillement est automatique après le choix de tous les joueurs.',
    };
  if (state.phase === 'property')
    return {
      id: 'property',
      title: 'Choisissez votre niveau de construction',
      text: `Le prix inclut le terrain et les bâtiments choisis. L’hôtel est accessible après ${state.config.hotelUnlockLaps ?? 0} tours complets du plateau. Gardez de l’argent pour les loyers.`,
    };
  if (state.phase === 'rent')
    return {
      id: 'rent',
      title: 'Un loyer avant le rachat',
      text: 'Après paiement, vous pouvez racheter une ville, même avec hôtel, ou une île pour deux fois sa valeur foncière. Une assurance protège une fois du rachat.',
    };
  if (state.debt)
    return {
      id: 'debt',
      title: 'Des biens ne remplacent pas du cash',
      text: 'Votre patrimoine inclut vos propriétés. Pour payer cette dette, vendez un bien afin de libérer de l’argent disponible.',
    };
  if (recipient.insurance?.tile === null)
    return {
      id: 'insurance',
      title: 'Placez votre assurance',
      text: 'Choisissez un de vos biens. Son contour pointillé repérera la protection contre une destruction, une expropriation ou un rachat.',
    };
  if (state.turn <= state.players.length)
    return {
      id: 'turns',
      title: 'Trois repères pour votre voyage',
      text: 'Tour de jeu : un joueur agit. Tour de table : chacun a joué. Tour du plateau : votre pion a fait le circuit complet. Trois rues complètes permettent de gagner ; les quatre îles comptent comme une rue.',
    };
}

/** Generic public advice only: no objective or hidden bid enters this surface. */
export function ContextTip({
  state,
  self,
  disabled = false,
}: {
  state: GameState;
  self?: string;
  disabled?: boolean;
}) {
  const [seen, setSeen] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const tip = contextualTip(state, self);
  const player = state.players.find((p) => p.id === self);
  if (disabled || !tip || seen.includes(tip.id) || !player || player.bot || player.eliminated)
    return null;
  return (
    <aside className="context-tip" aria-label="Conseil de jeu">
      <div tabIndex={0}>
        <strong>{tip.title}</strong>
        <p>{tip.text}</p>
      </div>
      <button
        aria-label="Masquer ce conseil"
        onClick={() => {
          const next = [...seen, tip.id];
          setSeen(next);
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            /* Advice remains usable without storage. */
          }
        }}
      >
        Compris
      </button>
    </aside>
  );
}
