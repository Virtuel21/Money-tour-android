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
            'Les identifiants restent dans cet onglet et ne sont pas inclus dans l’invitation. Les invités devront saisir leurs paramètres TURN. Après fermeture, renseignez-les à nouveau.',
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
      </fieldset>
      <p role="status" aria-live="polite" className="turn-test-status">
        {testing ? translate('Test du relais…') : translate(status)}
      </p>
    </details>
  );
}
