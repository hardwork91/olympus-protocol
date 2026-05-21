// Test de humo de la Fase 1: solo verifica que el setup de Vitest +
// Testing Library funciona. En Fase 2 vendrán tests reales del motor.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App (placeholder Fase 1)', () => {
  it('renderiza el título OLYMPUS PROTOCOL', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /olympus protocol/i })).toBeInTheDocument();
  });
});
