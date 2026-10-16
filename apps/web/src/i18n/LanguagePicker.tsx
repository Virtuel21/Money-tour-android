import { useSyncExternalStore } from 'react';
import { getLanguage, setLanguage, subscribeLanguage, type Language } from './language';
import { translate } from './translate';
import './language.css';

export function useLanguage() {
  return useSyncExternalStore(subscribeLanguage, getLanguage, () => 'fr' as Language);
}

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const language = useLanguage();
  return (
    <div
      className={`language-picker${compact ? ' language-picker-compact' : ''}`}
      role="group"
      aria-label={translate('Langue')}
    >
      {(['fr', 'en'] as const).map((value) => (
        <button
          type="button"
          key={value}
          lang={value}
          aria-label={value === 'fr' ? 'Français' : 'English'}
          aria-pressed={language === value}
          onClick={() => setLanguage(value)}
        >
          {compact ? value.toUpperCase() : value === 'fr' ? 'Français' : 'English'}
        </button>
      ))}
    </div>
  );
}
