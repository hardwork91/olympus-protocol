// ============================================================================
// asset() — resuelve la URL de un asset estático respetando la base path
// configurada en Vite.
//
// En dev          base='/'                    →  asset('/x.png')  →  '/x.png'
// En GitHub Pages base='/olympus-protocol/'   →  asset('/x.png')  →  '/olympus-protocol/x.png'
//
// CSS modules y HTML index.html ya son re-escritos por Vite automáticamente.
// Este helper es para img.src / new Image().src / Howler({src}) — strings
// runtime en JS que Vite NO toca.
// ============================================================================

const BASE = import.meta.env.BASE_URL; // siempre termina en '/'

export function asset(path: string): string {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${BASE}${clean}`;
}
