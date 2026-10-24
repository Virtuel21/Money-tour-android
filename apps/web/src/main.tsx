import { createRoot } from 'react-dom/client';
import App from './App';
import { initializeLanguage } from './i18n/language';
import { Capacitor } from '@capacitor/core';
import './styles.css';
import './mobile.css';
import './play-layout.css';
import './rivalry.css';
import './board/tile-labels.css';
import './game/experience.css';
import './game/menus.css';
import './game/play-scene.css';

document.documentElement.dataset.platform = Capacitor.getPlatform();
if (Capacitor.getPlatform() === 'android') {
  const viewport = document.querySelector('meta[name="viewport"]');
  viewport?.setAttribute(
    'content',
    (viewport.getAttribute('content') ?? '').replace('viewport-fit=cover', 'viewport-fit=contain'),
  );
}
void initializeLanguage();
createRoot(document.getElementById('root')!).render(<App />);
