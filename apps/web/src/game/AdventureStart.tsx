import { useEffect, useId, useRef, useState } from 'react';
import { adventureText, type GameState } from '@money-tour/engine';
import { formatText, translate } from '../i18n/translate';
import { restoreDialogFocus, trapDialogFocus } from './dialogFocus';
import { GameIcon } from './GameIcon';
import './adventure-start.css';

export function AdventureStart({
  state,
  deadline,
  participants,
  ready = [],
  self,
  onReady,
}: {
  state: GameState;
  deadline: number;
  participants?: string[];
  ready?: string[];
  self?: string;
  onReady: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  );
  useEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      restoreDialogFocus(opener);
    };
  }, []);
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [deadline]);
  const alreadyReady = !!self && ready.includes(self);
  const spectator = participants !== undefined && (!self || !participants.includes(self));
  const special = translate(adventureText(state));
  const goal = translate(
    'Complétez un côté du plateau ou trois rues pour gagner, sinon visez le plus grand patrimoine à la fin du chrono',
  );
  return (
    <dialog
      ref={dialog}
      className="modal adventure-start"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={trapDialogFocus}
      onCancel={(event) => event.preventDefault()}
    >
      <GameIcon name="compass" className="adventure-start-emblem" />
      <h2 id={titleId}>{translate('L’aventure vous attend !')}</h2>
      <p id={descriptionId} className="adventure-start-rule">
        {goal}
        {special ? ` ; ${special}` : '.'}
      </p>
      {participants && (
        <ul className="adventure-start-players" aria-label={translate('Joueurs prêts')}>
          {participants.map((id) => (
            <li key={id}>
              <span>{state.players.find((player) => player.id === id)?.name ?? id}</span>
              <span>{translate(ready.includes(id) ? 'Prêt' : 'En attente')}</span>
            </li>
          ))}
        </ul>
      )}
      {!spectator && (
        <button className="primary" onClick={onReady} disabled={alreadyReady}>
          {translate(alreadyReady ? 'Prêt · en attente des autres' : 'Démarrer l’aventure')}
        </button>
      )}
      <p className="adventure-start-time" role="timer" aria-live="off">
        {formatText('Départ automatique dans {0} s', seconds)}
      </p>
    </dialog>
  );
}
