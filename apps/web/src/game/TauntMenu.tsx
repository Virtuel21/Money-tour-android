import { translate } from '../i18n/translate';
import type { GameState } from '@money-tour/engine';
import { taunts, tauntAsset, type TauntKind } from './taunts';
export function TauntMenu({
  state,
  playerId,
  targetId,
  cooling,
  onSend,
}: {
  state: GameState;
  playerId: string;
  targetId: string;
  cooling: boolean;
  onSend: (kind: TauntKind) => void;
}) {
  const seat = state.players.findIndex((p) => p.id === playerId),
    player = state.players[seat]!;
  const target = state.players.find((p) => p.id === targetId);
  return (
    <div className="taunt-picker">
      <p>
        <b>{player.name}</b>
        {targetId !== playerId ? ` → ${target?.name}` : translate(' → tout le monde')}
        {translate(' · choisissez votre réaction')}
      </p>
      <div className="taunt-options">
        {taunts.map((taunt) => (
          <button
            key={taunt.id}
            onClick={() => onSend(taunt.id)}
            disabled={cooling}
            aria-label={translate(taunt.label)}
          >
            <img src={tauntAsset(seat, taunt.id)} alt="" width="160" height="160" />
            <span>{translate(taunt.label)}</span>
          </button>
        ))}
      </div>
      <p className="taunt-hint" role="status">
        {cooling
          ? translate(
              'Votre personnage reprend son souffle… quelques secondes avant le prochain taunt.',
            )
          : translate('Visible par tous · une réaction toutes les 8 secondes.')}
      </p>
    </div>
  );
}
