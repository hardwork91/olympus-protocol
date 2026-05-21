# components/

Componentes de UI reutilizables. Cada componente vive en su propia carpeta
con su `.module.css` co-localizado:

```
components/
├── Card/
│   ├── Card.tsx
│   ├── Card.module.css
│   └── Card.test.tsx
├── Hand/
├── Slot/
└── ...
```

Solo importa de `@hooks`, `@store`, `@services` y otros componentes.
**Nunca importa de `@server`** (eso pasaría por el servicio).
