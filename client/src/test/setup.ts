// Vitest setup file: se ejecuta una vez antes de TODOS los tests.
// Importa matchers extendidos para testing-library (toBeInTheDocument, etc.)
// y limpia el DOM entre tests.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup automático del DOM entre tests
afterEach(() => {
  cleanup();
});
