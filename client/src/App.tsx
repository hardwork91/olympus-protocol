// Placeholder de la Fase 1: solo confirma que el setup funciona.
// El App real (router, lobby, game) llega en la Fase 3.
import styles from './App.module.css';

function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>OLYMPUS PROTOCOL</h1>
        <p className={styles.subtitle}>Phase 1 · React + TypeScript + Vite</p>
      </header>

      <main className={styles.main}>
        <p>Setup completo. Esperando Fase 2.</p>
        <ul className={styles.stack}>
          <li>React 19 + TypeScript strict</li>
          <li>Vite + Vitest</li>
          <li>Zustand · React Router · Framer Motion · Howler</li>
          <li>Firebase RTDB (compartido con el simulator vanilla)</li>
        </ul>
      </main>
    </div>
  );
}

export default App;
