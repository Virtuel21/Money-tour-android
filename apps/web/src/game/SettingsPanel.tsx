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
  onTest,
}: {
  comfort: ComfortPreferences;
  setComfort: Dispatch<SetStateAction<ComfortPreferences>>;
  audio: AudioPreferences;
  setAudio: Dispatch<SetStateAction<AudioPreferences>>;
  reduced: boolean;
  setReduced: (value: boolean) => void;
  sharedPace?: 'normal' | 'fast';
  onPreview: () => void;
  onTest?: () => void;
}) {
  return (
    <div className="settings-sections">
      <section className="settings-card" aria-labelledby="settings-board-title">
        <h3 id="settings-board-title">
          <GameIcon name="map" /> Plateau et lisibilité
        </h3>
        <div className="board-zoom-setting">
          <div className="board-zoom-heading">
            <label htmlFor="board-zoom">Zoom du plateau</label>
            <output htmlFor="board-zoom" aria-live="polite">
              {comfort.boardZoom} %
            </output>
          </div>
          <div className="board-zoom-controls">
            <button
              type="button"
              aria-label="Réduire le zoom"
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
              aria-valuetext={`${comfort.boardZoom} %`}
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
              aria-label="Augmenter le zoom"
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
            Revenir à 100 %
          </button>
          <p id="board-zoom-help" className="settings-hint">
            Sur mobile, pincez pour zoomer et glissez pour déplacer le plateau. « Vue globale »
            montre toutes les cases ; « Recentrer mon pion » reprend le suivi.
          </p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={comfort.largeText}
            onChange={(e) => setComfort((old) => ({ ...old, largeText: e.target.checked }))}
          />
          <span>
            Textes agrandis<small>Plus de confort dans les menus et les informations du jeu.</small>
          </span>
        </label>
      </section>
      <section className="settings-card" aria-labelledby="settings-sound-title">
        <h3 id="settings-sound-title">
          <GameIcon name="music" /> Son
        </h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={audio.effects}
            onChange={(e) => setAudio((old) => ({ ...old, effects: e.target.checked }))}
          />
          <span>Effets sonores</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={audio.music}
            onChange={(e) => setAudio((old) => ({ ...old, music: e.target.checked }))}
          />
          <span>Musique de l’archipel</span>
        </label>
        <label className="field">
          Volume <output>{Math.round(audio.volume * 100)} %</output>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audio.volume}
            aria-label="Volume sonore"
            aria-valuetext={`${Math.round(audio.volume * 100)} %`}
            onChange={(e) => setAudio((old) => ({ ...old, volume: Number(e.target.value) }))}
          />
        </label>
        <button className="secondary" onClick={onPreview}>
          Écouter un aperçu
        </button>
      </section>
      <section className="settings-card" aria-labelledby="settings-animation-title">
        <h3 id="settings-animation-title">
          <GameIcon name="speed" /> Animations et rythme
        </h3>
        <label className="field">
          Rythme des animations
          <select
            value={sharedPace ?? comfort.pace}
            disabled={sharedPace !== undefined}
            onChange={(e) =>
              setComfort((old) => ({ ...old, pace: e.target.value === 'fast' ? 'fast' : 'normal' }))
            }
          >
            <option value="normal">Normal · prendre le temps de voir</option>
            <option value="fast">Rapide · aller à l’essentiel</option>
          </select>
        </label>
        <p className="settings-hint">
          {sharedPace !== undefined
            ? 'En ligne, le rythme est choisi par l’hôte et partagé par tous.'
            : 'Le mode rapide raccourcit les animations. Le temps pour décider reste identique.'}
        </p>
        <label className="toggle">
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
          <span>
            Réduire les animations
            <small>Des transitions plus discrètes, sans changer les règles.</small>
          </span>
        </label>
      </section>
      {onTest && (
        <details className="settings-advanced">
          <summary>Outils de test</summary>
          <p>Explorez une copie de la partie sans modifier votre sauvegarde.</p>
          <button className="secondary" onClick={onTest}>
            Tester une copie en mode debug
          </button>
        </details>
      )}
      <p className="settings-hint">
        Vos réglages sont sauvegardés automatiquement sur cet appareil. Revenir à l’accueil met la
        partie locale en pause.
      </p>
    </div>
  );
}
