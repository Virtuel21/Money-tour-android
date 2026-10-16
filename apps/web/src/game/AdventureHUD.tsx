import { translate, formatText } from '../i18n/translate';
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
    <section className="adventure-banner" aria-label={translate('Règle spéciale de cette partie')}>
      <span>
        <GameIcon name="sparkles" />
        {translate(' CETTE PARTIE')}
      </span>
      <strong>{translate(adventureText(state))}</strong>
      {state.adventure && (
        <small>
          {translate('Tour de table ')}
          {state.adventure.round} ·{' '}
          {state.adventure.tenderDone
            ? translate('Appel d’offres proposé')
            : translate('Un appel d’offres secret aura lieu pendant la partie')}
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
    <section className="private-quest" aria-label={translate('Mon objectif secret')}>
      {opened ? (
        <>
          <strong>
            <GameIcon name="lock" /> {translate(rule.title)}
          </strong>
          <span>
            {Math.min(q.progress, rule.goal)} / {rule.goal}
            {translate(' · Récompense')} {translate(money(scaledAmount(state.config, 100000)))}
          </span>
          <button aria-expanded={true} onClick={() => setOpened(false)}>
            {translate('Masquer mon objectif')}
          </button>
        </>
      ) : (
        <button aria-expanded={false} onClick={() => setOpened(true)}>
          <GameIcon name="lock" /> {player.name}
          {translate(' · voir mon objectif secret')}
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
      <div
        className="mini-properties"
        role="group"
        aria-label={formatText('Propriétés de {0}', player.name)}
      >
        {groups.map(([street, cities]) => (
          <section className="estate-street" key={street} aria-label={translate(street)}>
            <h4 style={{ borderColor: cities[0]?.color }}>{translate(street)}</h4>
            <div className="estate-street-cards">
              {cities.map((t) => (
                <button
                  key={t.id}
                  className="mini-property"
                  style={{ borderTopColor: t.color ?? '#f1d17b' }}
                  onClick={() => onTile(t.id)}
                  title={formatText(
                    '{0} · loyer {1}',
                    translate(t.name),
                    translate(money(getRent(state, t.id))),
                  )}
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
                  <b>{translate(t.name)}</b>
                  <small>{translate(money(getRent(state, t.id), true))}</small>
                  {!!state.properties[t.id]!.roachTurns && (
                    <span className="roach-badge">
                      <GameIcon name="bug" />
                      {translate(' Cafards · ')}
                      {state.properties[t.id]!.roachTurns}
                      {translate(' tours · −50 %')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && (
          <small className="empty-estate">{translate('Aucune propriété pour le moment')}</small>
        )}
      </div>
      <div
        className="bonus-tokens"
        role="group"
        aria-label={formatText('Bonus et malus de {0}', player.name)}
      >
        {playerBonuses(state, player).map((bonus, index) => (
          <button key={index} onClick={() => onBonus?.(bonus)} title={translate(bonus.description)}>
            <GameIcon name={bonus.icon ?? 'info'} /> {translate(bonus.title)}
          </button>
        ))}
      </div>
    </div>
  );
}
