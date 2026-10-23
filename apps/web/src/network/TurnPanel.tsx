import { useId } from 'react';
import { translate } from '../i18n/translate';

export function TurnPanel({
  open,
  url,
  onUrl,
  username,
  onUsername,
  password,
  onPassword,
  relayOnly,
  onRelayOnly,
  onForget,
  saveStatus,
  disabled,
  testing,
  status,
  onTest,
}: {
  open: boolean;
  url: string;
  onUrl: (value: string) => void;
  username: string;
  onUsername: (value: string) => void;
  password: string;
  onPassword: (value: string) => void;
  relayOnly: boolean;
  onRelayOnly: (value: boolean) => void;
  onForget: () => void;
  saveStatus: string;
  disabled: boolean;
  testing: boolean;
  status: string;
  onTest: () => void;
}) {
  const helpId = useId();
  return (
    <details className="advanced turn-panel" open={open || undefined}>
      <summary>{translate('Serveur TURN · héberger une partie')}</summary>
      <p id={helpId}>
        {translate(
          'Renseignez votre serveur TURN existant pour connecter les joueurs. Gardez le jeu ouvert pour héberger la partie.',
        )}
      </p>
      <fieldset disabled={disabled || testing}>
        <legend>{translate('Configuration du relais')}</legend>
        <label className="field">
          {translate('Adresse TURN')}
          <input
            aria-describedby={helpId}
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder="turn:turn.example.com:3478"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <p className="setup-note">
          {translate(
            'Exemple : turn:serveur:3478. Vous pouvez aussi utiliser turns: ou plusieurs adresses séparées par des virgules.',
          )}
        </p>
        <label className="field">
          {translate('Nom d’utilisateur TURN')}
          <input
            value={username}
            onChange={(e) => onUsername(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <label className="field">
          {translate('Mot de passe TURN')}
          <input
            type="password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete="off"
          />
        </label>
        <p className="setup-note">
          {translate(
            'Les paramètres, y compris le mot de passe, sont enregistrés automatiquement dans ce navigateur pour les prochains lancements. Ils ne sont pas inclus dans l’invitation. Chaque invité utilise ses propres paramètres.',
          )}
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={relayOnly}
            onChange={(e) => onRelayOnly(e.target.checked)}
          />
          {translate('Faire passer toutes les connexions par TURN')}
        </label>
        <button type="button" className="secondary" onClick={onTest}>
          {translate('Tester le serveur TURN')}
        </button>
        <button type="button" className="secondary" onClick={onForget}>
          {translate('Effacer les paramètres TURN enregistrés')}
        </button>
      </fieldset>
      <p role="status" aria-live="polite" className="setup-note">
        {translate(saveStatus)}
      </p>
      <p role="status" aria-live="polite" className="turn-test-status">
        {testing ? translate('Test du relais…') : translate(status)}
      </p>
    </details>
  );
}
