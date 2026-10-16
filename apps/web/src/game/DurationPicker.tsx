import { translate } from '../i18n/translate';
import { useState } from 'react';

export const validMinutes = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= 180;

export function DurationPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [custom, setCustom] = useState(![5, 10, 20, 30].includes(value));
  return (
    <div className="duration-picker">
      <label>
        {translate('Durée')}
        <select
          value={custom ? 'custom' : String(value)}
          onChange={(event) => {
            const isCustom = event.target.value === 'custom';
            setCustom(isCustom);
            if (!isCustom) onChange(Number(event.target.value));
          }}
        >
          {[5, 10, 20, 30].map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes}
              {translate(' min')}
              {minutes === 20 ? translate(' · classique') : ''}
            </option>
          ))}
          <option value="custom">{translate('Temps personnalisé')}</option>
        </select>
      </label>
      {custom && (
        <label>
          {translate('Minutes (1 à 180)')}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={180}
            step={1}
            aria-label={translate('Durée personnalisée en minutes')}
            value={value || ''}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </label>
      )}
      {!validMinutes(value) && (
        <small role="alert">{translate('Choisissez de 1 à 180 minutes entières.')}</small>
      )}
    </div>
  );
}
