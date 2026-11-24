# Procedencia

- Skill: [`GoogleChrome/modern-web-guidance`, `skills/modern-web-guidance/`](https://github.com/GoogleChrome/modern-web-guidance/tree/2b4aa13a72dd47cd135b06ce5abfccd92e19b24f/skills/modern-web-guidance).
- CLI, buscador y guías: npm `modern-web-guidance@1.0.2`;
  [fuentes de la publicación](https://github.com/GoogleChrome/modern-web-guidance-src/tree/f6d9fc30aff7e177e05a555762808b12eee2c950).
- Software: Apache-2.0 (`LICENSE`). Guías: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/);
  contienen material de MDN, W3C, WHATWG e IETF. El paquete conserva sus guías,
  atribuciones y `THIRD_PARTY_NOTICES`.

**Adaptación local:** se abrevia `SKILL.md` y se sustituyen las invocaciones a
`npx …@latest` por el comando del perfil. El wrapper desactiva la telemetría y
el registro local de consultas, y solo expone búsqueda, lectura, escaneo y
versión. El paquete se instala fuera del descubrimiento de skills; no registra
el pack `chrome-extensions`.
