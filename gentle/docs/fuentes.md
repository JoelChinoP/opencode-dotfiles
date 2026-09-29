# Fuentes y contratos contrastados

Revisión inicial: **27 de septiembre de 2026**. Las referencias versionadas son
la base de la implementación; documentación de `main`, npm `latest` y catálogo
web pueden cambiar independientemente.

## Pi 0.87.1

- [Release](https://github.com/earendil-works/pi/releases/tag/v0.87.1).
- [Paquete y requisito Node](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/package.json).
- [Configuración y directorio del agente](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/configuration.md).
- [Referencia de settings](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/settings.md).
- [Modelos y OAuth](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/models.md).
- [CLI y reanudación](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/cli.md).
- [Carga de recursos y diagnóstico de colisiones](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/src/core/resource-loader.ts).
- [Compactación](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/compaction.md).
- [Confianza y permisos](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/security.md).
- [Proveedor Codex](https://github.com/earendil-works/pi/blob/v0.87.1/packages/ai/src/providers/openai-codex.ts).
- [Transporte Codex](https://github.com/earendil-works/pi/blob/v0.87.1/packages/ai/src/api/openai-codex-responses.ts).
- [Generador de catálogo: límites, niveles y caché](https://github.com/earendil-works/pi/blob/v0.87.1/packages/ai/scripts/generate-models.ts).
- Catálogo público: [Sol](https://pi.dev/models/openai-codex/gpt-6-sol),
  [Luna](https://pi.dev/models/openai-codex/gpt-6-luna),
  [Astra](https://pi.dev/models/openai-codex/gpt-6-astra).

## Gentle Shell 3.7.0

- [Release y pin de Gentle AI](https://github.com/Gentleman-Programming/gentle-shell/releases/tag/v3.7.0).
- [Paquete npm gentle-pi y compatibilidad](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/package.json).
- [Referencia completa](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/docs/readme-reference.md).
- [Standalone, setup y rutas](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/docs/readme-reference.md#gentle-shell-launcher).
- [Lanzador: setup manual y marca automática](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/bin/gentle-shell.mjs).
- [Perfiles y pins de repositorio](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/docs/readme-reference.md#agent-model-profiles).
- [ODD](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/docs/readme-reference.md#organic-driven-development).
- [SDD y preflight](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/docs/readme-reference.md#sdd-preflight-and-project-files).
- [Agentes, cuota e interfaz](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/docs/gentle-shell.md).
- [Resolución de agent home/config home](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/lib/agent-home.ts).
- [Esquema de perfiles](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/lib/agent-profiles.ts).
- [Routing de orquestador](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/lib/profiles-orchestrator.ts).
- [Configuración de hijos y concurrencia](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/lib/agents-config.ts).
- [Política de animaciones](https://github.com/Gentleman-Programming/gentle-shell/blob/v3.7.0/lib/animation-policy.ts).
- [Definiciones de agentes](https://github.com/Gentleman-Programming/gentle-shell/tree/v3.7.0/assets/agents).

Algunas secciones de la referencia aún muestran ejemplos `3.5.1` o listas
históricas de complementos. Para versiones se usa el release 3.7.0 publicado; el
adaptador de Pi de Gentle AI determina el stack actual. La nota sobre verificación
SDD obligatoria con el pin 3.7.0 tiene precedencia sobre diagramas de un flujo
posterior todavía no publicado con ese pin.

## Gentle AI 3.7.0

- [Release](https://github.com/Gentleman-Programming/gentle-ai/releases/tag/v3.7.0).
- [Integración Pi y límites del home aislado](https://github.com/Gentleman-Programming/gentle-ai/blob/v3.7.0/docs/pi.md).
- [Adaptador Pi: paquetes y PI_CODING_AGENT_DIR](https://github.com/Gentleman-Programming/gentle-ai/blob/v3.7.0/internal/agents/pi/adapter.go).
- [Routing de revisión nativa](https://github.com/Gentleman-Programming/gentle-ai/blob/v3.7.0/docs/pi-provider-routing.md).
- [CLI review mode: RDD on por defecto y cambio global explícito](https://github.com/Gentleman-Programming/gentle-ai/blob/v3.7.0/internal/cli/review_mode.go).

La comprobación real del 28 de septiembre confirmó `on (decided by default)`.
Este contrato del runtime corrige la descripción opt-in de algunas secciones de
Gentle Shell: el instalador local siembra `off` si no había decisión previa.

## Engram

- [Core 2.2.1, archivos y checksums](https://github.com/Gentleman-Programming/engram/releases/tag/v2.2.1).
- [Checksums oficiales](https://github.com/Gentleman-Programming/engram/releases/download/v2.2.1/checksums.txt).
- [Paquete publicado gentle-engram 0.1.16](https://registry.npmjs.org/gentle-engram/0.1.16).
- [README del commit npm 0.1.16](https://github.com/Gentleman-Programming/engram/blob/818be842f57a95063f62f1b745297a96c407c143/plugin/pi/README.md).
- [Captura y eventos de esa versión](https://github.com/Gentleman-Programming/engram/blob/818be842f57a95063f62f1b745297a96c407c143/plugin/pi/index.ts).

El instalador oficial puede instalar un complemento posterior. El pin de Engram
core no fija automáticamente el paquete npm gentle-engram. No se trata la
preparación de 0.1.17 en `main` como si ya fuese una publicación npm confirmada.
