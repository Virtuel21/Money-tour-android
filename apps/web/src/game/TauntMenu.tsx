import type { GameState } from '@money-tour/engine';
import { taunts, tauntAsset, type TauntKind } from './taunts';
export function TauntMenu({
  state,
  playerId,
  targetId,
  cooling,
  onSend,
  onPlayerChange,
  onTargetChange,
}: {
  state: GameState;
  playerId: string;
  targetId: string;
  cooling: boolean;
  onSend: (kind: TauntKind) => void;
  onPlayerChange?: (id: string) => void;
  onTargetChange?: (id: string) => void;
}) {
  const seat = state.players.findIndex((p) => p.id === playerId),
    player = state.players[seat]!;
  const target = state.players.find((p) => p.id === targetId);
  return (
    <div className="taunt-picker">
      <p>
        <b>{player.name}</b>
        {targetId !== playerId ? ` → ${target?.name}` : ' → tout le monde'} · choisissez votre
        réaction
      </p>
      {onPlayerChange && (
        <label>
          Votre personnage
          <select value={playerId} onChange={(e) => onPlayerChange(e.target.value)}>
            {state.players
              .filter((p) => !p.bot && !p.eliminated)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {onTargetChange && (
        <label>
          Destinataire
          <select value={targetId} onChange={(e) => onTargetChange(e.target.value)}>
            <option value={playerId}>Tout le monde</option>
            {state.players
              .filter((p) => p.id !== playerId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="taunt-options">
        {taunts.map((taunt) => (
          <button
            key={taunt.id}
            onClick={() => onSend(taunt.id)}
            disabled={cooling}
            aria-label={taunt.label}
          >
            <img src={tauntAsset(seat, taunt.id)} alt="" width="160" height="160" />
            <span>{taunt.label}</span>
          </button>
        ))}
      </div>
      <p className="taunt-hint" role="status">
        {cooling
          ? 'Votre personnage reprend son souffle… quelques secondes avant le prochain taunt.'
          : 'Visible par tous · une réaction toutes les 8 secondes.'}
      </p>
    </div>
  );
}
