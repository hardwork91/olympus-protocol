import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/global.css';
import { setupFancyBorder } from './styles/setupFancyBorder';

// Genera el sprite 9-slice de fancy-border en runtime (canvas → data URL → var CSS).
// Llamada async sin await — el DOM puede renderizar con la var aún no seteada,
// y el ::after del fancy-border simplemente no se mostrará hasta que termine.
setupFancyBorder();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
