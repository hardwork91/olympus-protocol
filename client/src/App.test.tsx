// Smoke test: el App renderiza sin lanzar. La inicialización de Firebase
// queda en "loading" en el entorno de test (no hay conexión), por eso
// solo verificamos que no haya errores fatales de render.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App (router root)', () => {
  it('renderiza la pantalla de carga inicial sin errores', () => {
    render(<App />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });
});
