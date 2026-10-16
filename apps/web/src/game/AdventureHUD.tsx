import { scaledAmount } from '@money-tour/engine';
import { playerBonuses, type BonusInfo } from './bonuses';
import { useState } from 'react';
import {
  adventureText,
  questRules,
  getRent,
  type GameState,
  type Player,
} from '@money-tour/engine';
import { money } from './local';
import { estateGroups } from './estate';
import { GameIcon } from './GameIcon';
export function AdventureBanner({ state }: { state: GameState }) {
  return (
    <section className="adventure-banner" aria-label="Règle spéciale de cette partie">
      <span>
        <GameIcon name="sparkles" /> CETTE PARTIE
      </span>
      <strong>{adventureText(state)}</strong>
      {state.adventure && (
        <small>
          Tour de table {state.adventure.round} ·{' '}
          {state.adventure.tenderDone
            ? 'Appel d’offres proposé'
            : 'Un appel d’offres secret aura lieu pendant la partie'}
        </small>
      )}
    </section>
  );
}
export function PrivateQuest({
  state,
  player,
  self,
}: {
  state: GameState;
  player: Player;
  self?: string;
}) {
  const [opened, setOpened] = useState(false),
    q = state.quests?.[player.id];
  if (!q || q.completed || player.bot || (self && self !== player.id)) return null;
  const rule = questRules[q.kind];
  return (
    <section className="private-quest" aria-label="Mon objectif secret">
      {opened ? (
        <>
          <strong>
            <GameIcon name="lock" /> {rule.title}
          </strong>
          <span>
            {Math.min(q.progress, rule.goal)} / {rule.goal} · Récompense{' '}
            {money(scaledAmount(state.config, 100000))}
          </span>
          <button aria-expanded={true} onClick={() => setOpened(false)}>
            Masquer mon objectif
          </button>
        </>
      ) : (
        <button aria-expanded={false} onClick={() => setOpened(true)}>
          <GameIcon name="lock" /> {player.name} · voir mon objectif secret
        </button>
      )}
    </section>
  );
}
export function PlayerInventory({
  state,
  player,
  onTile,
  onBonus,
}: {
  state: GameState;
  player: Player;
  onTile: (id: number) => void;
  onBonus?: (bonus: BonusInfo) => void;
}) {
  const groups = estateGroups(state, player.id);
  return (
    <div className="player-inventory">
      <div className="mini-properties" role="group" aria-label={`Propriétés de ${player.name}`}>
        {groups.map(([street, cities]) => (
          <section className="estate-street" key={street} aria-label={street}>
            <h4 style={{ borderColor: cities[0]?.color }}>{street}</h4>
            <div className="estate-street-cards">
              {cities.map((t) => (
                <button
                  key={t.id}
                  className="mini-property"
                  style={{ borderTopColor: t.color ?? '#f1d17b' }}
                  onClick={() => onTile(t.id)}
                  title={`${t.name} · loyer ${money(getRent(state, t.id))}`}
                >
                  <span>
                    <GameIcon
                      name={
                        t.type === 'resort'
                          ? 'island'
                          : state.properties[t.id]!.level === state.config.hotelLevel
                            ? 'hotel'
                            : 'house'
                      }
                    />
                  </span>
                  <b>{t.name}</b>
                  <small>{money(getRent(state, t.id), true)}</small>
                  {!!state.properties[t.id]!.roachTurns && (
                    <span className="roach-badge">
                      <GameIcon name="bug" /> Cafards · {state.properties[t.id]!.roachTurns} tours ·
                      −50 %
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <small className="empty-estate">Aucune propriété pour le moment</small>}
      </div>
      <div className="bonus-tokens" role="group" aria-label={`Bonus et malus de ${player.name}`}>
        {playerBonuses(state, player).map((bonus, index) => (
          <button key={index} onClick={() => onBonus?.(bonus)} title={bonus.description}>
            <GameIcon name={bonus.icon ?? 'info'} /> {bonus.title}
          </button>
        ))}
      </div>
    </div>
  );
}
