# Fuentes primarias y procedencia

Consultadas el **20-09-2026**. Las URLs sustituyen las citas opacas `turn…` del
informe original. Los hechos del runtime se detallan en [verificacion.md](verificacion.md).

## OpenCode V2

| Fuente | Uso |
| --- | --- |
| [Configuración V2](https://opencode.ai/v2/docs/config) | Campos nativos y separación global/proyecto |
| [Migración V1 → V2](https://opencode.ai/v2/docs/migrate-v1) | `prune` ignorado, LSP, `small_model`, cambios de API |
| [MCP](https://opencode.ai/v2/docs/mcp-servers) | `servers`, `disabled`, OAuth, Code Mode, timeouts, `_meta.sessionID` |
| [Cargar plugins](https://opencode.ai/v2/docs/plugins) | Paquetes locales, discovery y precedencia |
| [API de plugins](https://opencode.ai/v2/docs/build/plugins) | `setup`, hooks, storage y transforms |
| [API de plugins TUI](https://opencode.ai/v2/docs/build/plugins/cli) | Slots, cache de sesiones, estado y eventos |
| [CLI config](https://opencode.ai/v2/docs/cli/config) | `cli.json` y plugins del cliente |
| [Compactación](https://opencode.ai/v2/docs/compaction) | `keep.tokens`, `buffer`, checkpoints y defaults |
| [Diagnóstico](https://opencode.ai/v2/docs/troubleshooting) | Servicio, API y logs |
| [OpenAPI V2](https://opencode.ai/v2/openapi.json) | Contratos contrastados con 2.0.8 |
| [Instrucciones MCP en código](https://github.com/anomalyco/opencode/blob/ebb7b76eca82342642c78645109e865614533827/packages/opencode/src/session/system.ts) | Bloques `<mcp_instructions><server name="…">` |

El paquete Arch instalado es `opencode 2.0.8-1` del repositorio `extra`, verificado
con `pacman -Q` y `pacman -Si`. [Paquete oficial de Arch](https://archlinux.org/packages/extra/x86_64/opencode/).
La guía muestra rutas explícitas a archivos que este runtime rechazó; por eso la
implementación usa directorios de paquete en lugar de copiar esos ejemplos literalmente.

## Engram

- [Release estable v2.0.0](https://github.com/Gentleman-Programming/engram/releases/tag/v2.0.0),
  publicada 18-09-2026. GitHub API: `prerelease=false`, `draft=false`.
- [Política de releases](https://github.com/Gentleman-Programming/engram/blob/v2.0.0/docs/RELEASE-POLICY.md):
  recomienda la última estable; RC no es el canal de producción.
- [Instalación oficial](https://github.com/Gentleman-Programming/engram/blob/v2.0.0/docs/INSTALLATION.md):
  binarios Linux sin dependencias de runtime. Algunas líneas aún llaman estable a
  v1.20.0; la política y las notas de la release 2.0.0 aclaran el estado vigente.
- [Plugin upstream](https://github.com/Gentleman-Programming/engram/blob/v2.0.0/plugin/opencode/engram.ts):
  usa API V1. La propia release lista [#1220](https://github.com/Gentleman-Programming/engram/issues/1220)
  como limitación; el adaptador V2 de este repositorio es **local**, no oficial.
- [Catálogo e instrucciones MCP](https://github.com/Gentleman-Programming/engram/blob/v2.0.0/internal/mcp/mcp.go):
  perfil agent, `mem_context`, registro de sesión, instrucciones proactivas.
- [Atribución de sesiones #1242](https://github.com/Gentleman-Programming/engram/issues/1242).
- [Checksums oficiales](https://github.com/Gentleman-Programming/engram/releases/download/v2.0.0/checksums.txt).
- Código inspeccionado: commit `f912af998dcbb5c32ea81a17be00123ad49efd33` de la etiqueta v2.0.0.
- Context7 `/gentleman-programming/engram` se usó para localizar documentación;
  sus fragmentos de setup V1 se contrastaron con el código y las notas de release.

SHA-256 fijados en `arch/install.sh`:

```text
23be1c2ce9739c455097ff864736213717b925b3e8821a988dfc619685a5abd5  engram_2.0.0_linux_amd64.tar.gz
a942e73ab424faaa6e2785d1563e0d9d7f20739944dae0c50071223301d44333  engram_2.0.0_linux_arm64.tar.gz
```

## Otros componentes

| Componente | Fuente y procedencia |
| --- | --- |
| Ponytail | [4.10.0](https://github.com/DietrichGebert/ponytail/tree/1d95ff7d39de12d87014ea40d4e22201bddc501b), entrypoint `.opencode/plugins/ponytail.mjs` con hooks V1; adaptación local V2 restaurada (sin npm) y resolución de `PONYTAIL_DEFAULT_MODE` en `hooks/ponytail-config.js`: entorno → `~/.config/ponytail/config.json` → `full` |
| Context7 | [Repositorio oficial](https://github.com/upstash/context7), [MCP/otros clientes](https://context7.com/docs/resources/all-clients); se registra solo `https://mcp.context7.com/mcp`, sin ejecutar el setup que añade skills |
| Skills OpenCode V2 | [Descubrimiento, carga diferida, permisos y `autoinvoke`](https://opencode.ai/v2/docs/skills) |
| frontend-design | [`anthropics/skills` en commit fijado](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/frontend-design), Apache-2.0; se conservan `SKILL.md` y licencia sin cambios |
| Playwright CLI | [`microsoft/playwright-cli` 0.1.21](https://github.com/microsoft/playwright-cli/tree/74354ecc7a43da16d91a9bc54fa8db8283a3fcf5), Apache-2.0; skill adaptada para runtime fijado, perfiles aislados y permisos OpenCode |
| Dependencias Python futuras | [Scripts PEP 723 y locks de uv](https://docs.astral.sh/uv/guides/scripts/), [entornos administrados/PEP 668](https://packaging.python.org/en/latest/specifications/externally-managed-environments/); no se instala uv mientras ninguna skill lo necesite |
| Herdr | [Instalación oficial](https://herdr.dev/docs/integrations/#opencode): `herdr integration install opencode`, soporte V2 y registro de la TUI en `cli.json`; sustituye la adaptación propia |
| subagent-statusline.v2 | Adaptación local restaurada desde la versión de la máquina (estado `done`, `MAX_ROWS`); consolidada en `templates/plugins/` y registrada en `cli.json` como plugin de TUI |
| CodeGraph del informe | [Adaptador OpenCode](https://codegraph.ru/docs/en/integrations/OPENCODE_PLUGIN.html), todavía con hooks V1; no instalado |
| CodeGraph MCP | [Autenticación remota oficial](https://codegraph.ru/docs/en/integrations/REMOTE_MCP_AUTH.html); endpoint `https://api.codegraph.ru/agent-plugin/mcp` y OAuth por proyecto |

Engram, Ponytail y statusline se distribuyen como adaptaciones locales y no se
actualizan mediante npm. Engram no sustituye todas las funciones del plugin
oficial. Al actualizar OpenCode o Engram hay que validar hooks, instrucciones MCP
y parámetros. Las fuentes de permisos, modelos y acceso SSH están en el
[contraste actualizado](contraste-dotfiles.md#fuentes).
