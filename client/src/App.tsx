// Router root. Define las rutas top-level del cliente.
// El basename viene de Vite (import.meta.env.BASE_URL) para que funcione
// tanto en dev (/) como en producción (/olympus-protocol/).
import Game from '@pages/Game';
import Menu from '@pages/Menu';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

// BASE_URL viene con trailing slash; React Router prefiere sin trailing.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/game/:roomId" element={<Game />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
