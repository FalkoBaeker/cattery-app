import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { recoverFromPreloadError } from './app/preloadRecovery';
import './index.css';

/**
 * Beim PWA-Update kann eine bereits offene Seite noch den Namen eines alten
 * Lazy-Chunks kennen, während der neue Service Worker dessen Cache schon
 * ersetzt hat. Vite meldet das als `vite:preloadError`. Ein einmaliges
 * Neuladen holt die zusammengehörige neue Startdatei und ihre Chunks; die
 * Nutzdaten in IndexedDB bleiben dabei selbstverständlich erhalten.
 */
window.addEventListener('vite:preloadError', (event) => {
  recoverFromPreloadError(event, sessionStorage, () => window.location.reload());
});

const root = document.getElementById('root');
if (!root) throw new Error('Wurzelelement #root fehlt in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
