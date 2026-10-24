import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { adventureText, getRent, type GameState, type Player } from '@money-tour/engine';
import { formatText, translate } from '../i18n/translate';
import { numberLocale } from '../i18n/language';
import { PlayerInventory, PrivateQuest } from './AdventureHUD';
import { playerBonuses, type BonusInfo } from './bonuses';
import { restoreDialogFocus, trapDialogFocus } from './dialogFocus';
import { GameIcon } from './GameIcon';
import { colors, money, pawnNames } from './local';
import './player-profiles.css';

interface PlayerProfilesProps {
  state: GameState;
  self?: string;
  mobile: boolean;
  inspectedOwner: string | null;
  onInspectOwner: (id: string | null) => void;
  onTile: (id: number) => void;
  onBonus: (bonus: BonusInfo) => void;
}

const profileStyle = (index: number): CSSProperties =>
  ({ '--player-color': colors[index] ?? colors[0] }) as CSSProperties;

/** Each face has its own square head-and-shoulders crop in the shared character atlas. */
function PlayerPortrait({ index }: { index: number }) {
  return (
    <span className="player-portrait-frame" aria-hidden="true">
      <span className={`player-portrait-image portrait portrait-${index}`} />
    </span>
  );
}

function PlayerBalance({ player }: { player: Player }) {
  const amount = money(player.cash, true).replace(' 💵', '');
  const compactAmount = new Intl.NumberFormat(numberLocale(), {
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(player.cash);
  return (
    <span
      className={`player-panel-money${amount.length > 10 ? ' player-panel-money-long' : ''}${!player.eliminated && Math.abs(player.cash) >= 10000 ? ' player-panel-money-compactable' : ''}`}
      title={player.eliminated ? translate('Faillite') : money(player.cash, true)}
    >
      <span className="player-panel-money-label">{translate('Argent')}</span>
      <strong>
        {!player.eliminated && <GameIcon name="coin" />}
        <span className="player-panel-money-full">
          {player.eliminated ? translate('Faillite') : amount}
        </span>
        {!player.eliminated && (
          <span className="player-panel-money-compact" aria-hidden="true">
            {compactAmount}
          </span>
        )}
      </strong>
    </span>
  );
}

function PlayerStats({ state, player }: { state: GameState; player: Player }) {
  const count = Object.values(state.properties).filter((p) => p.ownerId === player.id).length;
  return (
    <div className="player-panel-stats">
      <div>
        <GameIcon name="house" />
        <span>
          <b>{count}</b>
          <small>{translate(count === 1 ? 'Propriété' : 'Propriétés')}</small>
        </span>
      </div>
      <div>
        <GameIcon name="flag" />
        <span>
          <b>{player.laps}</b>
          <small>{translate(player.laps === 1 ? 'Tour terminé' : 'Tours terminés')}</small>
        </span>
      </div>
    </div>
  );
}

function IslandStatus({ state, player }: { state: GameState; player: Player }) {
  if (player.islandTurns === null || player.eliminated) return null;
  return (
    <p className="player-island-status">
      <GameIcon name="island" />
      {formatText(
        'Île perdue · {0} tour(s) maximum',
        Math.max(0, state.config.maxIslandTurns - player.islandTurns),
      )}
    </p>
  );
}

function TaxStatus({ player }: { player: Player }) {
  if (!player.fraudLiability || player.eliminated) return null;
  return (
    <p className="player-tax-status">
      <GameIcon name="warning" />
      {formatText('Taxe à venir : {0}', money(player.fraudLiability, true))}
    </p>
  );
}

export function PlayerProfiles({
  state,
  self,
  mobile,
  inspectedOwner,
  onInspectOwner,
  onTile,
  onBonus,
}: PlayerProfilesProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openedPlayer, setOpenedPlayer] = useState<string | null>(null);
  const activeId = state.players[state.currentPlayer]?.id;
  const privatePlayerId = self ?? activeId;
  const selectedIndex = state.players.findIndex((player) => player.id === openedPlayer);
  const selectedPlayer = state.players[selectedIndex];

  const displayName = (player: Player, index: number) =>
    player.name === 'Vous' && self ? formatText('Joueur {0}', index + 1) : player.name;
  const seatLabel = (player: Player, index: number) =>
    self === player.id
      ? translate('VOUS')
      : player.bot
        ? translate('BOT')
        : state.mode === 'teams'
          ? formatText('ÉQ. {0}', player.team === 0 ? 'A' : 'B')
          : translate(pawnNames[index] ?? 'Joueur');

  return (
    <>
      <div
        className={`player-profiles${mobile ? ' player-profiles--compact' : ''}`}
        style={{ '--profile-count': state.players.length } as CSSProperties}
      >
        {state.players.map((player, index) => {
          const active = player.id === activeId;
          const properties = state.config.board.filter(
            (tile) => state.properties[tile.id]?.ownerId === player.id,
          );
          const bonuses = playerBonuses(state, player);
          const name = displayName(player, index);
          return (
            <article
              className={`player-panel${active ? ' is-active' : ''}${player.eliminated ? ' is-eliminated' : ''}${collapsed[player.id] ? ' is-collapsed' : ''}`}
              key={player.id}
              data-bank={player.id}
              style={profileStyle(index)}
              aria-label={formatText('Profil de {0}', name)}
            >
              <button
                className="player-profile-open player-panel-heading"
                onClick={() => setOpenedPlayer(player.id)}
                aria-label={formatText('Voir le profil de {0}', name)}
                aria-haspopup="dialog"
              >
                <PlayerPortrait index={index} />
                <span className="player-panel-name">
                  <b title={name}>{name}</b>
                  <small className="player-seat-label">{seatLabel(player, index)}</small>
                </span>
                <PlayerBalance player={player} />
                <span className="player-compact-chevron" aria-hidden="true">
                  ⌄
                </span>
              </button>
              <button
                className="player-panel-collapse"
                onClick={() =>
                  setCollapsed((previous) => ({ ...previous, [player.id]: !previous[player.id] }))
                }
                aria-label={formatText(
                  '{0} le volet de {1}',
                  collapsed[player.id] ? translate('Développer') : translate('Réduire'),
                  name,
                )}
                aria-expanded={!collapsed[player.id]}
              >
                <span aria-hidden="true">{collapsed[player.id] ? '+' : '−'}</span>
              </button>
              {active && (
                <span className="player-active-mark" title={translate('Joueur actif')}>
                  <GameIcon name="dice" />
                  <span className="sr-only">{translate('Joueur actif')}</span>
                </span>
              )}
              {!collapsed[player.id] && (
                <>
                  <div className="player-panel-body">
                    <PlayerStats state={state} player={player} />
                    <IslandStatus state={state} player={player} />
                    <TaxStatus player={player} />
                    <div className="player-property-preview">
                      <h3>{translate('Ses propriétés')}</h3>
                      {properties.length ? (
                        <div>
                          {properties.slice(0, 3).map((tile) => (
                            <button
                              key={tile.id}
                              className="player-property-preview-item"
                              style={{ '--estate-color': tile.color ?? '#efbc27' } as CSSProperties}
                              onClick={() => onTile(tile.id)}
                              title={formatText(
                                '{0} · loyer {1}',
                                translate(tile.name),
                                money(getRent(state, tile.id)),
                              )}
                            >
                              <GameIcon name={tile.type === 'resort' ? 'island' : 'house'} />
                              <b>{translate(tile.name)}</b>
                              <small>
                                {money(getRent(state, tile.id), true).replace(' 💵', '')}
                              </small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p>{translate('Aucune propriété pour le moment')}</p>
                      )}
                    </div>
                    {!!bonuses.length && (
                      <div className="player-panel-bonuses">
                        {bonuses.slice(0, 2).map((bonus, bonusIndex) => (
                          <button key={bonusIndex} onClick={() => onBonus(bonus)}>
                            <GameIcon name={bonus.icon ?? 'info'} />
                            <span>{translate(bonus.title)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {player.id === privatePlayerId && (
                      <PrivateQuest
                        key={`${player.id}:${state.turn}`}
                        state={state}
                        player={player}
                        self={self}
                      />
                    )}
                  </div>
                  <button
                    className="player-profile-open player-panel-details"
                    onClick={() => setOpenedPlayer(player.id)}
                    aria-haspopup="dialog"
                    aria-label={formatText('Voir les biens de {0}', name)}
                  >
                    <span>{translate('Voir les biens')}</span>
                    {properties.length > 3 ? (
                      <small>+{properties.length - 3}</small>
                    ) : (
                      <GameIcon name="arrowRight" />
                    )}
                  </button>
                </>
              )}
              {active && !player.eliminated && (
                <div className="player-panel-turn">
                  <GameIcon name="dice" />
                  {translate(
                    self
                      ? self === player.id
                        ? 'À toi de jouer'
                        : 'Joueur actif'
                      : 'À toi de jouer',
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {selectedPlayer &&
        createPortal(
          <PlayerDetails
            key={selectedPlayer.id}
            state={state}
            player={selectedPlayer}
            index={selectedIndex}
            name={displayName(selectedPlayer, selectedIndex)}
            seat={seatLabel(selectedPlayer, selectedIndex)}
            active={selectedPlayer.id === activeId}
            self={self}
            showPrivateQuest={selectedPlayer.id === privatePlayerId}
            inspectedOwner={inspectedOwner}
            onInspectOwner={onInspectOwner}
            onClose={() => setOpenedPlayer(null)}
            onTile={onTile}
            onBonus={onBonus}
          />,
          document.body,
        )}
    </>
  );
}

function PlayerDetails({
  state,
  player,
  index,
  name,
  seat,
  active,
  self,
  showPrivateQuest,
  inspectedOwner,
  onInspectOwner,
  onClose,
  onTile,
  onBonus,
}: {
  state: GameState;
  player: Player;
  index: number;
  name: string;
  seat: string;
  active: boolean;
  self?: string;
  showPrivateQuest: boolean;
  inspectedOwner: string | null;
  onInspectOwner: (id: string | null) => void;
  onClose: () => void;
  onTile: (id: number) => void;
  onBonus: (bonus: BonusInfo) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const specialRule = adventureText(state);
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      restoreDialogFocus(opener);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="player-details-dialog"
      style={profileStyle(index)}
      aria-labelledby={titleId}
      aria-modal="true"
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="player-details-sheet">
        <span className="player-details-handle" aria-hidden="true" />
        <button
          className="player-details-close"
          aria-label={translate('Fermer le profil')}
          onClick={onClose}
        >
          <GameIcon name="close" />
        </button>
        <header className="player-details-heading">
          <PlayerPortrait index={index} />
          <div>
            <h2 ref={titleRef} id={titleId} tabIndex={-1}>
              {name}
            </h2>
            <span className={`player-details-badge${active ? ' is-active' : ''}`}>
              {active ? translate('Joueur actif') : seat}
            </span>
            <PlayerBalance player={player} />
          </div>
        </header>
        <div className="player-details-content player-details-body">
          <PlayerStats state={state} player={player} />
          <IslandStatus state={state} player={player} />
          <TaxStatus player={player} />
          <h3>{translate('Ses propriétés')}</h3>
          <PlayerInventory
            state={state}
            player={player}
            onTile={(id) => {
              onClose();
              onTile(id);
            }}
            onBonus={(bonus) => {
              onClose();
              onBonus(bonus);
            }}
          />
          {showPrivateQuest && <PrivateQuest state={state} player={player} self={self} />}
          {specialRule && (
            <section
              className="player-details-rule"
              aria-label={translate('Règle spéciale de cette partie')}
            >
              <h3>{translate('Règle spéciale de cette partie')}</h3>
              <p>{translate(specialRule)}</p>
            </section>
          )}
          <button
            className="player-details-locate"
            aria-pressed={inspectedOwner === player.id}
            onClick={() => {
              onInspectOwner(inspectedOwner === player.id ? null : player.id);
              onClose();
            }}
          >
            <GameIcon name="map" />
            {translate(
              inspectedOwner === player.id
                ? 'Retirer le filtre du plateau'
                : 'Repérer ses biens sur le plateau',
            )}
          </button>
        </div>
        <footer>
          <button className="player-details-back" onClick={onClose}>
            {translate('Revenir au plateau')}
          </button>
        </footer>
      </article>
    </dialog>
  );
}
