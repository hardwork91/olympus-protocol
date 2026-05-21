// ============================================================================
// useSound — hook idiomatic para reproducir SFX desde componentes.
// Devuelve una función `play(id)` estable (no re-renderea).
// ============================================================================

import { play, type SoundId } from '@services/audioService';
import { useCallback } from 'react';

export function useSound(): (id: SoundId) => void {
  return useCallback((id: SoundId) => play(id), []);
}
