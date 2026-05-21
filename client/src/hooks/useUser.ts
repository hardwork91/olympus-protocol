// ============================================================================
// useUser — hook que expone el usuario de Firebase Anonymous Auth.
// Resuelve la promesa cacheada de firebase.ts una sola vez por sesión.
// ============================================================================

import { userPromise } from '@services/firebase';
import { useEffect, useState } from 'react';

export interface UserState {
  userId: string | null;
  loading: boolean;
  error: Error | null;
}

export function useUser(): UserState {
  const [state, setState] = useState<UserState>({
    userId: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    userPromise
      .then((user) => {
        if (!cancelled) setState({ userId: user.uid, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            userId: null,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
