# Fuentes primarias y procedencia

Consultadas inicialmente el **20-09-2026**; Engram y Ponytail actualizados el
**03-11-2026**. Las URLs sustituyen las citas opacas `turn…` del
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

- [Release estable v3.6.1](https://github.com/Gentleman-Programming/engram/releases/tag/v3.6.1),
  publicada 03-11-2026: correcciones de sesiones, sincronización, búsquedas y Unicode.
- [Soporte OpenCode 2.x desde 3.0.0](https://github.com/Gentleman-Programming/engram/releases/tag/v3.0.0).
- [Plugin upstream V1/V2](https://github.com/Gentleman-Programming/engram/blob/v3.6.1/plugin/opencode/engram.ts):
  ofrece `server` y `setup`. Conservamos la política local para evitar la captura
  automática de prompts y los guardados obligatorios después de compactar.
- [Política de actualización y rollback](https://github.com/Gentleman-Programming/engram/blob/v3.6.1/docs/RELEASE-POLICY.md):
  respaldo y validación antes de adoptar un nuevo core.
- [Checksums oficiales](https://github.com/Gentleman-Programming/engram/releases/download/v3.6.1/checksums.txt).
- Contrato MCP comprobado contra el binario: 23 herramientas en `--tools=agent`,
  `mem_save.capture_prompt`, `mem_context.compact/max_bytes`,
  `mem_session_start.directory` y `mem_update.expected_project`.

SHA-256 fijados en `arch/install.sh`:

```text
b06d6436ce5c7f1e838b9ec454870e7ec9e5b3e0f89b6edc5e5d2e41fe13edcf  engram_3.6.1_linux_amd64.tar.gz
14fce398ebdaed8b11d6116f4c14795f77ed5d160e74de0ae3f9a77a01e390bc  engram_3.6.1_linux_arm64.tar.gz
```

## Otros componentes

| Componente | Fuente y procedencia |
| --- | --- |
| Ponytail | [5.3.3 oficial](https://github.com/DietrichGebert/ponytail/releases/tag/v5.3.3), npm `@dietrichgebert/ponytail@5.3.3`; API V2 `setup`, instrucciones en contexto/compactación y seis comandos/skills. Nivel compartido en `.ponytail-active`, default de entorno/configuración. MIT. Integridad npm: `sha512-Gq0ESMi1ZkcY+dvH1dyhOzR3+pYQ/LGW39E4dExcCzhaLe1AMPE43sPrW/JbEiaC986dUWeSzs97WfTABLkdDg==` |
| Context7 | [Repositorio oficial](https://github.com/upstash/context7), [MCP/otros clientes](https://context7.com/docs/resources/all-clients); se registra solo `https://mcp.context7.com/mcp`, sin ejecutar el setup que añade skills |
| Skills OpenCode V2 | [Descubrimiento, carga diferida, permisos y `autoinvoke`](https://opencode.ai/v2/docs/skills) |
| frontend-design | [`anthropics/skills` en commit fijado](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/frontend-design), Apache-2.0; se conservan `SKILL.md` y licencia sin cambios |
| Playwright CLI | [`microsoft/playwright-cli` 0.1.21](https://github.com/microsoft/playwright-cli/tree/74354ecc7a43da16d91a9bc54fa8db8283a3fcf5), Apache-2.0; skill adaptada para runtime fijado, perfiles aislados y permisos OpenCode |
| Dependencias Python futuras | [Scripts PEP 723 y locks de uv](https://docs.astral.sh/uv/guides/scripts/), [entornos administrados/PEP 668](https://packaging.python.org/en/latest/specifications/externally-managed-environments/); no se instala uv mientras ninguna skill lo necesite |
| Herdr | [Instalación oficial](https://herdr.dev/docs/integrations/#opencode): `herdr integration install opencode`, soporte V2 y registro de la TUI en `cli.json`; sustituye la adaptación propia |
| subagent-statusline.v2 | Adaptación local restaurada desde la versión de la máquina (estado `done`, `MAX_ROWS`); consolidada en `templates/plugins/` y registrada en `cli.json` como plugin de TUI |
| CodeGraph del informe | [Adaptador OpenCode](https://codegraph.ru/docs/en/integrations/OPENCODE_PLUGIN.html), todavía con hooks V1; no instalado |
| CodeGraph MCP histórico | [Autenticación remota oficial](https://codegraph.ru/docs/en/integrations/REMOTE_MCP_AUTH.html); endpoint usado en la preparación inicial, sustituido el 27-09-2026 por la entrada local desactivada `codegraph serve --mcp` elegida por el usuario |

La política Engram y la statusline son locales. Ponytail usa el paquete oficial
fijado en la configuración. Engram no sustituye todas las funciones del plugin
oficial. Al actualizar OpenCode o Engram hay que validar hooks, instrucciones MCP
y parámetros. Las fuentes de permisos, modelos y acceso SSH están en el
[contraste actualizado](contraste-dotfiles.md#fuentes).
