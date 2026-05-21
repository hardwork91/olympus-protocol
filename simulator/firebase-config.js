// Firebase initialization para el simulador Olympus Protocol.
// Carga el SDK desde CDN (modular v12), inicializa la app, la Realtime Database
// y un sign-in anónimo. Exporta utilidades de DB para que otros módulos
// (room.js, sync) no necesiten importar el SDK directamente.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getDatabase, ref, set, get, update, onValue, off, push,
  serverTimestamp, runTransaction, remove
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB3ttq3byHwVm1PbXTqIyMbP9bXif71G-Y",
  authDomain: "olympus-protocol.firebaseapp.com",
  databaseURL: "https://olympus-protocol-default-rtdb.firebaseio.com",
  projectId: "olympus-protocol",
  storageBucket: "olympus-protocol.firebasestorage.app",
  messagingSenderId: "44234792592",
  appId: "1:44234792592:web:17bff0340e416ce2c04215"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getDatabase(app);
export const auth = getAuth(app);

// Promise que resuelve con el firebase.User una vez completado el sign-in anónimo.
export const userPromise = new Promise((resolve, reject) => {
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
    }
  );
  signInAnonymously(auth).catch(reject);
});

// Re-export de los primitives de RTDB que usaremos en room.js / ui.js
export { ref, set, get, update, onValue, off, push, serverTimestamp, runTransaction, remove };
