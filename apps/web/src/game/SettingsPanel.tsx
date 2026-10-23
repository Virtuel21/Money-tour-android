import { translate } from '../i18n/translate';
import { LanguagePicker } from '../i18n/LanguagePicker';
import type { Dispatch, SetStateAction } from 'react';
import type { AudioPreferences } from '../audio/synth';
import { MIN_BOARD_ZOOM, MAX_BOARD_ZOOM, normalizeBoardZoom } from '../board/camera';
import type { ComfortPreferences } from './comfort';
import { GameIcon } from './GameIcon';

export function SettingsPanel({
  comfort,
  setComfort,
  audio,
  setAudio,
  reduced,
  setReduced,
  sharedPace,
  onPreview,
}: {
  comfort: ComfortPreferences;
  setComfort: Dispatch<SetStateAction<ComfortPreferences>>;
  audio: AudioPreferences;
  setAudio: Dispatch<SetStateAction<AudioPreferences>>;
  reduced: boolean;
  setReduced: (value: boolean) => void;
  sharedPace?: 'normal' | 'fast';
  onPreview: () => void;
}) {
  return (
    <div className="settings-sections">
      <section
        className="settings-card settings-language"
        aria-labelledby="settings-language-title"
      >
        <h3 id="settings-language-title">{translate('Langue')}</h3>
        <LanguagePicker />
        <p className="settings-hint">
          {translate(
            'Votre choix de langue est conservé sur cet appareil. Il s’applique uniquement à votre écran, y compris en ligne.',
          )}
        </p>
      </section>
      <section className="settings-card" aria-labelledby="settings-board-title">
        <h3 id="settings-board-title">
          <GameIcon name="map" />
          {translate(' Plateau et lisibilité')}
        </h3>
        <div className="board-zoom-setting">
          <div className="board-zoom-heading">
            <label htmlFor="board-zoom">{translate('Zoom du plateau')}</label>
            <output htmlFor="board-zoom" aria-live="polite">
              {comfort.boardZoom} %
            </output>
          </div>
          <div className="board-zoom-controls">
            <button
              type="button"
              aria-label={translate('Réduire le zoom')}
              disabled={comfort.boardZoom <= MIN_BOARD_ZOOM}
              onClick={() =>
                setComfort((old) => ({ ...old, boardZoom: normalizeBoardZoom(old.boardZoom - 5) }))
              }
            >
              −
            </button>
            <input
              id="board-zoom"
              type="range"
              min={MIN_BOARD_ZOOM}
              max={MAX_BOARD_ZOOM}
              step="5"
              value={comfort.boardZoom}
              aria-valuetext={translate(`${comfort.boardZoom} %`)}
              aria-describedby="board-zoom-help"
              onChange={(e) =>
                setComfort((old) => ({
                  ...old,
                  boardZoom: normalizeBoardZoom(Number(e.target.value)),
                }))
              }
            />
            <button
              type="button"
              aria-label={translate('Augmenter le zoom')}
              disabled={comfort.boardZoom >= MAX_BOARD_ZOOM}
              onClick={() =>
                setComfort((old) => ({ ...old, boardZoom: normalizeBoardZoom(old.boardZoom + 5) }))
              }
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="secondary board-zoom-reset"
            disabled={comfort.boardZoom === 100}
            onClick={() => setComfort((old) => ({ ...old, boardZoom: 100 }))}
          >
            {translate('Revenir à 100 %')}
          </button>
          <p id="board-zoom-help" className="settings-hint">
            {translate(
              'Sur mobile, pincez pour zoomer et glissez pour déplacer le plateau. « Vue globale » montre toutes les cases ; « Recentrer mon pion » reprend le suivi.',
            )}
          </p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={comfort.largeText}
            onChange={(e) => setComfort((old) => ({ ...old, largeText: e.target.checked }))}
          />
          <span>
            {translate('Textes agrandis')}
            <small>{translate('Plus de confort dans les menus et les informations du jeu.')}</small>
          </span>
        </label>
      </section>
      <section className="settings-card" aria-labelledby="settings-sound-title">
        <h3 id="settings-sound-title">
          <GameIcon name="music" />
          {translate(' Son')}
        </h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={audio.effects}
            onChange={(e) => setAudio((old) => ({ ...old, effects: e.target.checked }))}
          />
          <span>{translate('Effets sonores')}</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={audio.music}
            onChange={(e) => setAudio((old) => ({ ...old, music: e.target.checked }))}
          />
          <span>{translate('Musique de l’archipel')}</span>
        </label>
        <label className="field">
          {translate('Volume ')}
          <output>{Math.round(audio.volume * 100)} %</output>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audio.volume}
            aria-label={translate('Volume sonore')}
            aria-valuetext={translate(`${Math.round(audio.volume * 100)} %`)}
            onChange={(e) => setAudio((old) => ({ ...old, volume: Number(e.target.value) }))}
          />
        </label>
        <button className="secondary" onClick={onPreview}>
          {translate('Écouter un aperçu')}
        </button>
      </section>
      <section className="settings-card" aria-labelledby="settings-animation-title">
        <h3 id="settings-animation-title">
          <GameIcon name="speed" />
          {translate(' Animations et rythme')}
        </h3>
        <label className="field">
          {translate('Rythme des animations')}
          <select
            value={sharedPace ?? comfort.pace}
            disabled={sharedPace !== undefined}
            onChange={(e) =>
              setComfort((old) => ({ ...old, pace: e.target.value === 'fast' ? 'fast' : 'normal' }))
            }
          >
            <option value="normal">{translate('Normal · prendre le temps de voir')}</option>
            <option value="fast">{translate('Rapide · aller à l’essentiel')}</option>
          </select>
        </label>
        <p className="settings-hint">
          {sharedPace !== undefined
            ? translate('En ligne, le rythme est choisi par l’hôte et partagé par tous.')
            : translate(
                'Le mode rapide raccourcit les animations. Le temps pour décider reste identique.',
              )}
        </p>
        <label className="toggle">
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
          <span>
            {translate('Réduire les animations')}
            <small>{translate('Des transitions plus discrètes, sans changer les règles.')}</small>
          </span>
        </label>
      </section>
      <p className="settings-hint">
        {translate(
          'Vos réglages sont sauvegardés automatiquement sur cet appareil. Revenir à l’accueil met la partie locale en pause.',
        )}
      </p>
    </div>
  );
}
