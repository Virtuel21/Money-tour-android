import { translate, formatText } from '../i18n/translate';
import { useState, type FormEvent } from 'react';
import type { GameConfig } from '@money-tour/engine';
import { type LocalSave, money, phaseText } from './local';
import { parseDebug, type DebugCommand } from './debug';
import './debug.css';

const rules = [
  ['startBonus', 'Prime de départ'],
  ['actionTimeoutMs', 'Délai de décision (ms)'],
  ['durationMs', 'Durée de partie (ms)'],
  ['initialCash', 'Argent initial (nouvelles parties)'],
  ['hotelUnlockLaps', 'Tours avant de construire un hôtel'],
  ['initialMaxLevel', 'Niveau maximum initial'],
  ['groupsToWin', 'Rues complètes pour gagner'],
  ['buyoutMultiplier', 'Multiplicateur de rachat'],
  ['resaleRate', 'Taux de revente (0 à 1)'],
  ['taxRate', 'Taux de taxe (0 à 1)'],
  ['taxBase', 'Taxe minimale'],
  ['islandFee', 'Caution de l’île'],
  ['maxIslandTurns', 'Tours maximum sur l’île'],
  ['doublesToIsland', 'Doubles avant envoi sur l’île'],
  ['travelFee', 'Prix du voyage'],
  ['championshipFee', 'Prix du festival'],
  ['championshipDuration', 'Durée du festival (tours)'],
  ['festivalCount', 'Nombre de villes en fête'],
  ['festivalMultiplier', 'Multiplicateur de fête'],
  ['casinoBaseChance', 'Casino : chance initiale (%)'],
  ['casinoChanceStep', 'Casino : hausse par visite (%)'],
  ['casinoMaxChance', 'Casino : chance maximum (%)'],
  ['casinoMinWin', 'Casino : gain minimum'],
  ['earthquakeChance', 'Probabilité de séisme (%)'],
  ['crisisChance', 'Probabilité de crise (%)'],
  ['fraudDiscount', 'Fraude : part du prix à payer (0 à 1)'],
  ['botReserve', 'Réserve des bots'],
] as const;
const switches = [
  ['buildingRequiresGroup', 'Rue complète nécessaire pour construire'],
  ['bundledPurchase', 'Acheter plusieurs bâtiments ensemble'],
  ['singlePropertyDecision', 'Un seul chantier par visite'],
  ['lineVictory', 'Victoire par ligne'],
  ['resortVictory', 'Victoire par îles privées'],
  ['duelReplayTies', 'Rejouer les égalités du duel'],
  ['travelOnDouble', 'Voyager après un double'],
  ['insuranceSingleUse', 'Assurance à usage unique'],
] as const;

export function DebugPanel({
  save,
  onCommand,
  onImport,
  onUndo,
  canUndo,
}: {
  save: LocalSave;
  onCommand: (command: DebugCommand) => void;
  onImport: (save: LocalSave) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const { state } = save;
  const [tab, setTab] = useState('Joueurs');
  const [playerId, setPlayerId] = useState(state.players[state.currentPlayer]!.id);
  const player =
    state.players.find((p) => p.id === playerId) ?? state.players[state.currentPlayer]!;
  const [tileId, setTileId] = useState(player.position);
  const tile = state.config.board[tileId]!;
  const property = state.properties[tileId];
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [json, setJson] = useState('');
  function attempt(operation: () => void, message = 'Modification appliquée.') {
    try {
      operation();
      setError('');
      setFeedback(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Modification impossible.');
      setFeedback('');
    }
  }
  const command = (value: DebugCommand) => attempt(() => onCommand(value));
  const form = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return new FormData(event.currentTarget);
  };
  const exportScenario = () => {
    const raw = JSON.stringify(save, null, 2);
    setJson(raw);
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `money-tour-debug-tour-${state.turn}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback('Scénario exporté avec sa graine aléatoire, ses règles et son historique.');
  };
  return (
    <div className="debug-panel">
      <p className="debug-intro">
        {translate(
          'Bac à sable local · Les changements sont gratuits et immédiats. Votre partie normale reste conservée.',
        )}
      </p>
      <div className="debug-summary">
        <strong>{state.players[state.currentPlayer]!.name}</strong>
        <span>
          {translate('Tour ')}
          {state.turn} · {translate(phaseText[state.phase])}
        </span>
      </div>
      <div className="debug-options">
        <label>
          <input
            type="checkbox"
            checked={save.debug!.freezeTime}
            onChange={(e) =>
              command({ type: 'options', ...save.debug!, freezeTime: e.target.checked })
            }
          />{' '}
          {translate('Geler le chrono')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={save.debug!.freezeBots}
            onChange={(e) =>
              command({ type: 'options', ...save.debug!, freezeBots: e.target.checked })
            }
          />{' '}
          {translate('Geler les bots')}
        </label>
        <button
          className="secondary"
          disabled={!canUndo}
          onClick={() => attempt(onUndo, 'Situation précédente restaurée.')}
        >
          {translate('Annuler la dernière action')}
        </button>
      </div>
      <p className="debug-hint">
        {translate(
          'Le jeu attend pendant que ce panneau est ouvert. Fermez-le pour jouer. Raccourci : F2.',
        )}
      </p>
      <nav className="debug-tabs" aria-label={translate('Outils debug')}>
        {['Joueurs', 'Cases et dés', 'Règles', 'Scénario'].map((name) => (
          <button
            key={name}
            aria-pressed={tab === name}
            onClick={() => {
              setTab(name);
              setError('');
              setFeedback('');
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="debug-error">
          {translate(error)}
        </p>
      )}
      {feedback && (
        <p role="status" className="debug-success">
          {translate(feedback)}
        </p>
      )}
      {['Joueurs', 'Cases et dés'].includes(tab) && (
        <label className="debug-player">
          {translate('Joueur à modifier')}
          <select
            aria-label={translate('Joueur à modifier')}
            value={player.id}
            onChange={(e) => setPlayerId(e.target.value)}
          >
            {state.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.eliminated ? translate(' · éliminé') : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {tab === 'Joueurs' && (
        <section>
          <h3>{translate('Argent et contrôle')}</h3>
          <form
            key={`${player.id}:${state.seq}`}
            onSubmit={(e) => {
              const data = form(e);
              command({
                type: 'player',
                playerId: player.id,
                cash: Number(data.get('cash')),
                laps: Number(data.get('laps')),
                bot: data.get('bot') === 'on',
              });
            }}
          >
            <div className="debug-grid">
              <label>
                {translate('Solde')}
                <input
                  name="cash"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  required
                  defaultValue={player.cash}
                />
              </label>
              <label>
                {translate('Tours de plateau terminés')}
                <input
                  name="laps"
                  type="number"
                  min="0"
                  step="1"
                  required
                  defaultValue={player.laps}
                />
              </label>
              <label className="debug-check">
                <input name="bot" type="checkbox" defaultChecked={player.bot} />
                {translate(' Piloté par un bot')}
              </label>
            </div>
            <button className="primary">{translate('Appliquer au joueur')}</button>
          </form>
          <div className="debug-actions">
            {[-100, 100, 1000].map((amount) => (
              <button
                key={amount}
                className="secondary"
                disabled={player.cash + amount < 0}
                onClick={() =>
                  command({
                    type: 'player',
                    playerId: player.id,
                    cash: player.cash + amount,
                    laps: player.laps,
                    bot: player.bot,
                  })
                }
              >
                {amount > 0 ? '+' : ''}
                {translate(money(amount, true))}
              </button>
            ))}
          </div>
          <button
            className="secondary"
            onClick={() => command({ type: 'turn', playerId: player.id })}
          >
            {translate('Reprendre le tour avec ')}
            {player.name}
          </button>
          <p className="debug-hint">
            {translate(
              'Remet ce joueur en jeu, libère l’île et annule la décision en cours. Les mises d’un duel interrompu sont remboursées.',
            )}
          </p>
          <form
            key={`clock:${state.seq}`}
            onSubmit={(e) => {
              const data = form(e);
              command({
                type: 'clock',
                elapsedMs: Math.round(Number(data.get('elapsed')) * 60000),
                durationMs: Math.round(Number(data.get('duration')) * 60000),
              });
            }}
          >
            <h3>{translate('Horloge')}</h3>
            <div className="debug-grid">
              <label>
                {translate('Minutes écoulées')}
                <input
                  name="elapsed"
                  type="number"
                  min="0"
                  step="0.1"
                  required
                  defaultValue={+(state.elapsedMs / 60000).toFixed(1)}
                />
              </label>
              <label>
                {translate('Durée totale en minutes')}
                <input
                  name="duration"
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  defaultValue={+(state.durationMs / 60000).toFixed(1)}
                />
              </label>
            </div>
            <button className="secondary">{translate('Appliquer l’horloge')}</button>
          </form>
        </section>
      )}
      {tab === 'Cases et dés' && (
        <section>
          <h3>{translate('Se déplacer ou modifier une propriété')}</h3>
          <label>
            {translate('Case')}
            <select
              aria-label={translate('Case')}
              value={tileId}
              onChange={(e) => setTileId(Number(e.target.value))}
            >
              {state.config.board.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {translate(t.name)}
                </option>
              ))}
            </select>
          </label>
          <div className="debug-actions">
            <button
              className="secondary"
              onClick={() =>
                command({ type: 'move', playerId: player.id, tile: tileId, resolve: false })
              }
            >
              {translate('Déplacer sans effet')}
            </button>
            <button
              className="primary"
              onClick={() =>
                command({ type: 'move', playerId: player.id, tile: tileId, resolve: true })
              }
            >
              {translate('Aller et déclencher la case')}
            </button>
          </div>
          <p className="debug-hint">
            {translate(
              'Le joueur choisi prend la main. Le déplacement direct ne donne pas de prime de départ ; utilisez les dés pour tester un passage par Départ.',
            )}
          </p>
          {property && (
            <form
              key={`property:${tileId}:${state.seq}`}
              onSubmit={(e) => {
                const data = form(e);
                command({
                  type: 'property',
                  tile: tileId,
                  ownerId: String(data.get('owner')) || null,
                  level: Number(data.get('level') ?? 0),
                  festival: data.get('festival') === 'on',
                });
              }}
            >
              <div className="debug-grid">
                <label>
                  {translate('Propriétaire')}
                  <select
                    aria-label={translate('Propriétaire')}
                    name="owner"
                    defaultValue={property.ownerId ?? ''}
                  >
                    <option value="">{translate('Banque · libre')}</option>
                    {state.players
                      .filter((p) => !p.eliminated)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                {tile.type === 'city' && (
                  <label>
                    {translate('Bâtiments')}
                    <select
                      aria-label={translate('Bâtiments')}
                      name="level"
                      defaultValue={property.level}
                    >
                      {['Terrain', '1 maison', '2 maisons', '3 maisons', 'Hôtel'].map(
                        (label, index) => (
                          <option key={index} value={index}>
                            {translate(label)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                )}
                <label className="debug-check">
                  <input
                    name="festival"
                    type="checkbox"
                    defaultChecked={!!property.championships}
                  />{' '}
                  {translate('Festival sur cette propriété')}
                </label>
              </div>
              <button className="secondary">{translate('Appliquer la propriété')}</button>
            </form>
          )}
          <form
            onSubmit={(e) => {
              const data = form(e);
              command({
                type: 'dice',
                values: [Number(data.get('die1')), Number(data.get('die2'))],
              });
            }}
          >
            <h3>{translate('Forcer le prochain lancer')}</h3>
            <p className="debug-hint">
              {translate('Joueur actif : ')}
              {state.players[state.currentPlayer]!.name}
              {translate('. Le moteur applique les doubles, déplacements et effets habituels.')}
            </p>
            <div className="debug-grid">
              {[1, 2].map((n) => (
                <label key={n}>
                  {translate('Dé ')}
                  {n}
                  <select aria-label={formatText('Dé {0}', n)} name={`die${n}`} defaultValue={1}>
                    {[1, 2, 3, 4, 5, 6].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button className="primary">{translate('Lancer ces dés')}</button>
          </form>
          <form
            onSubmit={(e) => {
              const data = form(e);
              command({ type: 'card', cardId: String(data.get('card')) });
            }}
          >
            <h3>{translate('Préparer une carte Chance')}</h3>
            <label>
              {translate('Prochaine carte')}
              <select aria-label={translate('Prochaine carte')} name="card">
                {state.config.cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {translate(card.title)}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary">{translate('Préparer cette carte')}</button>
            <p className="debug-hint">
              {translate(
                'La carte est reprise à son détenteur si nécessaire. Déclenchez ensuite une case Chance.',
              )}
            </p>
          </form>
        </section>
      )}
      {tab === 'Règles' && (
        <section>
          <h3>{translate('Règles de cette partie de test')}</h3>
          <form
            key={`rules:${state.seq}`}
            onSubmit={(e) => {
              const data = form(e);
              const updated = structuredClone(state.config);
              for (const [key] of rules)
                if (data.has(key)) Object.assign(updated, { [key]: Number(data.get(key)) });
              for (const [key] of switches)
                Object.assign(updated, { [key]: data.get(key) === 'on' });
              command({ type: 'rules', config: updated });
            }}
          >
            <div className="debug-grid">
              {rules
                .filter(([key]) => state.config[key] !== undefined)
                .map(([key, label]) => (
                  <label key={key}>
                    {translate(label)}
                    <input
                      type="number"
                      name={key}
                      required
                      step={['resaleRate', 'taxRate', 'fraudDiscount'].includes(key) ? '0.01' : '1'}
                      defaultValue={state.config[key] as number}
                    />
                  </label>
                ))}
            </div>
            <div className="debug-switches">
              {switches.map(([key, label]) => (
                <label key={key}>
                  <input type="checkbox" name={key} defaultChecked={state.config[key] ?? false} />{' '}
                  {translate(label)}
                </label>
              ))}
            </div>
            <button className="primary">{translate('Appliquer les règles')}</button>
          </form>
          <details>
            <summary>{translate('Éditeur complet des règles · JSON')}</summary>
            <p>
              {translate(
                'Modifiez aussi les prix, loyers et coûts de construction dans « board », les loyers des îles dans « resortRents » et les montants des cartes. Conservez la structure du plateau et les types de cartes.',
              )}
            </p>
            <form
              key={`raw:${state.seq}`}
              onSubmit={(e) => {
                const data = form(e);
                attempt(() =>
                  onCommand({
                    type: 'rules',
                    config: JSON.parse(String(data.get('rules'))) as GameConfig,
                  }),
                );
              }}
            >
              <label>
                {translate('Règles JSON')}
                <textarea
                  aria-label={translate('Règles JSON')}
                  name="rules"
                  rows={14}
                  defaultValue={JSON.stringify(state.config, null, 2)}
                  spellCheck={false}
                />
              </label>
              <button className="secondary">{translate('Valider les règles JSON')}</button>
            </form>
          </details>
        </section>
      )}
      {tab === 'Scénario' && (
        <section>
          <h3>{translate('Conserver et reproduire un bug')}</h3>
          <p>
            {translate(
              'Exportez la situation juste avant le bug. Le fichier contient les positions, comptes, propriétés, règles, cartes, graine aléatoire et historique. Vous pouvez le réimporter ou modifier son état JSON.',
            )}
          </p>
          <button className="primary" onClick={exportScenario}>
            {translate('Exporter le scénario JSON')}
          </button>
          <label>
            {translate('Charger un fichier JSON')}
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 1_000_000) {
                  setError('Choisissez un fichier de moins de 1 Mo.');
                  return;
                }
                try {
                  setJson(await file.text());
                  setFeedback('Fichier chargé. Cliquez sur Importer pour restaurer la situation.');
                  setError('');
                } catch {
                  setError('Impossible de lire ce fichier.');
                }
              }}
            />
          </label>
          <label>
            {translate('Scénario JSON')}
            <textarea
              aria-label={translate('Scénario JSON')}
              rows={12}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
              placeholder={translate('Collez ici un export du mode debug…')}
            />
          </label>
          <button
            className="secondary"
            disabled={!json.trim()}
            onClick={() => attempt(() => onImport(parseDebug(json)), 'Scénario restauré.')}
          >
            {translate('Importer le scénario')}
          </button>
          <details>
            <summary>{translate('Historique récent')}</summary>
            <ol>
              {save.history?.slice(0, 30).map((entry, i) => (
                <li key={i}>{translate(entry)}</li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </div>
  );
}
