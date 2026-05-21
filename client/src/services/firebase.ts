// ============================================================================
// Inicialización de Firebase + auth anónima + helpers de RTDB.
// Reusa el mismo proyecto que el simulator vanilla (olympus-protocol).
// ============================================================================

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type User,
  type Auth,
} from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

// Config del proyecto Firebase. Las keys del cliente NO son secretas — la
// seguridad real vive en RTDB security rules, no en ocultar el apiKey.
// Si en el futuro quieres mover a variables de entorno, basta con leer
// import.meta.env.VITE_FIREBASE_API_KEY etc.
const firebaseConfig = {
  apiKey: 'AIzaSyB3ttq3byHwVm1PbXTqIyMbP9bXif71G-Y',
  authDomain: 'olympus-protocol.firebaseapp.com',
  databaseURL: 'https://olympus-protocol-default-rtdb.firebaseio.com',
  projectId: 'olympus-protocol',
  storageBucket: 'olympus-protocol.firebasestorage.app',
  messagingSenderId: '44234792592',
  appId: '1:44234792592:web:17bff0340e416ce2c04215',
} as const;

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const db: Database = getDatabase(app);
export const auth: Auth = getAuth(app);

/**
 * Promise que resuelve con el firebase.User una vez completado el sign-in
 * anónimo. Se cachea — llamadas subsecuentes devuelven la misma promesa
 * (no se vuelve a autenticar).
 */
export const userPromise: Promise<User> = new Promise((resolve, reject) => {
  const unsub = onAuthStateChanged(
    auth,
    (user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    },
    (err) => {
      unsub();
      reject(err);
    },
  );
  signInAnonymously(auth).catch(reject);
});

/**
 * Recorre recursivamente un objeto y reemplaza `undefined` por `null` o
 * elimina las keys con `undefined`. Firebase RTDB rechaza valores undefined
 * con un error en tiempo de escritura; null es válido.
 *
 * NO muta el input — crea copia profunda.
 */
export function sanitizeForFirebase<T>(obj: T): T {
  if (obj === undefined) return null as unknown as T;
  if (obj === null) return null as unknown as T;
  if (Array.isArray(obj)) {
    return obj.map((v) => sanitizeForFirebase(v)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = sanitizeForFirebase(v);
    }
    return out as T;
  }
  return obj;
}
