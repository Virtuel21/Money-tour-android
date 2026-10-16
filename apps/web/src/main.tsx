import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './mobile.css';
import './play-layout.css';
import './rivalry.css';
import './board/tile-labels.css';
import './game/experience.css';
import './game/menus.css';

createRoot(document.getElementById('root')!).render(<App />);
