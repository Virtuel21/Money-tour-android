import { translate, formatText } from '../i18n/translate';
import { playerBonuses, type BonusInfo } from './bonuses';
import { useState } from 'react';
import { adventureText, getRent, type GameState } from '@money-tour/engine';
import { PrivateQuest } from './AdventureHUD';
import { money } from './local';
import { estateGroups } from './estate';
import { StrategyProgress } from './StrategyProgress';
import { GameIcon } from './GameIcon';

/** A small paginated collection: the board never becomes a scrolling inventory. */
export function MobilePocket({
  state,
  self,
  onTile,
  onBonus,
  onHighlight,
}: {
  state: GameState;
  self?: string;
  onTile: (id: number) => void;
  onBonus?: (bonus: BonusInfo) => void;
  onHighlight?: (ids: number[]) => void;
}) {
  const viewer =
    state.players.find((p) => p.id === self) ??
    (state.players.filter((p) => !p.bot).length === 1
      ? state.players.find((p) => !p.bot)
      : undefined) ??
    state.players[state.currentPlayer]!;
  const [requestedTab, setTab] = useState<'cities' | 'bonus' | 'quest' | 'rules' | 'strategy'>(
    'cities',
  );
  const quest = state.quests?.[viewer.id];
  const hasQuest = !!quest && !quest.completed && !viewer.bot && (!self || self === viewer.id);
  const tab = requestedTab === 'quest' && !hasQuest ? 'cities' : requestedTab;
  const [owner, setOwner] = useState(viewer.id);
  const [page, setPage] = useState(0);
  const player = state.players.find((p) => p.id === owner) ?? state.players[0]!;
  const groups = estateGroups(state, owner);
  const bonuses = playerBonuses(state, player);
  const pages = Math.max(1, tab === 'cities' ? groups.length : Math.ceil(bonuses.length / 2));
  const index = Math.min(page, pages - 1);
  return (
    <div className="mobile-pocket">
      <nav aria-label={translate('Votre carnet')}>
        {(['cities', 'strategy', 'bonus', 'quest', 'rules'] as const)
          .filter((item) => item !== 'quest' || hasQuest)
          .map((item) => (
            <button
              key={item}
              aria-pressed={tab === item}
              onClick={() => {
                setTab(item);
                setPage(0);
              }}
            >
              {translate(
                {
                  cities: 'Villes',
                  strategy: 'Victoire',
                  bonus: 'Bonus',
                  quest: 'Objectif',
                  rules: 'Partie',
                }[item],
              )}
            </button>
          ))}
      </nav>
      {(tab === 'cities' || tab === 'bonus') && (
        <>
          <p className="pocket-owner-label">{translate('Voyageur consulté')}</p>
          <div className="pocket-owners" role="group" aria-label={translate('Joueur consulté')}>
            {state.players.map((p) => (
              <button
                key={p.id}
                aria-pressed={owner === p.id}
                onClick={() => {
                  setOwner(p.id);
                  setPage(0);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          {tab === 'cities' ? (
            <div className="pocket-cities">
              {!!groups.length && <h3 aria-live="polite">{translate(groups[index]![0])}</h3>}
              {(groups[index]?.[1] ?? []).map((t) => (
                <button key={t.id} style={{ borderTopColor: t.color }} onClick={() => onTile(t.id)}>
                  <b>{translate(t.name)}</b>
                  <span>
                    {translate('Loyer ')}
                    {translate(money(getRent(state, t.id), true))}
                  </span>
                  {!!state.properties[t.id]!.roachTurns && (
                    <span className="roach-badge">
                      <GameIcon name="bug" />
                      {translate(' Cafards · ')}
                      {state.properties[t.id]!.roachTurns}
                      {translate(' tours · loyer −50 %')}
                    </span>
                  )}
                </button>
              ))}
              {!groups.length && <p>{translate('Aucune propriété pour le moment.')}</p>}
            </div>
          ) : (
            <div className="pocket-bonuses">
              {bonuses.slice(index * 2, index * 2 + 2).map((b, i) => (
                <button key={i} onClick={() => onBonus?.(b)}>
                  <strong>
                    <GameIcon name={b.icon ?? 'info'} /> {translate(b.title)}
                  </strong>
                  <span>{translate(b.description)}</span>
                </button>
              ))}
              {!bonuses.length && (
                <p>{translate('Les cartes conservées et les jetons apparaîtront ici.')}</p>
              )}
            </div>
          )}
          {pages > 1 && (
            <div className="pocket-pages">
              <button
                aria-label={
                  tab === 'cities' ? translate('Rue précédente') : translate('Bonus précédents')
                }
                disabled={!index}
                onClick={() => setPage(index - 1)}
              >
                <GameIcon name="arrowLeft" />
              </button>
              <span role="status" aria-label={formatText('Page {0} sur {1}', index + 1, pages)}>
                {index + 1} / {pages}
              </span>
              <button
                aria-label={
                  tab === 'cities' ? translate('Rue suivante') : translate('Bonus suivants')
                }
                disabled={index === pages - 1}
                onClick={() => setPage(index + 1)}
              >
                <GameIcon name="arrowRight" />
              </button>
            </div>
          )}
        </>
      )}
      {tab === 'quest' && (
        <PrivateQuest key={viewer.id} state={state} player={viewer} self={self} />
      )}
      {tab === 'strategy' && (
        <StrategyProgress
          state={state}
          playerId={viewer.id}
          onTile={onTile}
          onHighlight={onHighlight}
          expanded
        />
      )}
      {tab === 'rules' && (
        <div className="pocket-rule">
          <p>{translate(adventureText(state))}</p>
          <p>
            {translate('Tour de table ')}
            {state.adventure?.round ?? 1} ·{' '}
            {state.adventure?.tenderDone
              ? translate('Appel d’offres proposé')
              : translate('Un appel d’offres secret aura lieu pendant cette partie.')}
          </p>
          {state.crisis && (
            <p>
              <GameIcon name="trendDown" />
              {translate(' Crise : loyers −50 % · ')}
              {state.crisis.remaining.length} {translate('joueur(s) doivent encore jouer.')}
            </p>
          )}
          {state.alliance && (
            <p>
              <GameIcon name="people" />{' '}
              {state.players.find((p) => p.id === state.alliance!.beneficiaryId)?.name}
              {translate(' reçoit 50 % des gains de ')}
              {state.players.find((p) => p.id === state.alliance!.targetId)?.name}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
