# Guía de este repositorio

- El perfil instalable de OpenCode V2 vive en `templates/`; el `AGENTS.md` de la
  raíz guía este checkout, mientras `templates/AGENTS.md` se instala como regla
  global. Lo específico de plataforma va en `arch/` o `windows/`.
- La instalación completa está implementada solo para Arch; `windows/README.md`
  copia manualmente `opencode.jsonc`, sin desplegar plugins ni skills.
- Consulta la documentación de V2 al modificar configuración o plugins:
  https://opencode.ai/v2/docs/config.

## Perfil y despliegue

- `templates/opencode.jsonc` registra los plugins de servidor Engram, Ponytail y
  Account Quota; la statusline, el lanzador de editores y `image-preview` de la TUI se registran en
  `templates/cli.json`. Tras desplegar el perfil, el instalador vuelve a ejecutar
  la integración oficial de Herdr si encuentra Herdr estable >= 0.9.1 en el PATH.
- Account Quota (`/quota`) es una copia solo de ejecución de su propio proyecto:
  no la edites aquí. Su única entrada trae también su TUI y su RPC, nunca va en
  `cli.json` y activa `experimentalCodexUsage` y `experimentalClaudeUsage`. Para
  actualizarla, vuelve a copiar los archivos de `runtime_files` de su
  `scripts/host-lab.sh` y fija `version` y `content_sha256` en `arch/check.mjs`.
- Ponytail usa el paquete oficial `@dietrichgebert/ponytail@5.3.3`, con API V2.
  El instalador fija `lite` en `ponytail/config.json` y `opencode/.ponytail-active`;
  el nivel elegido se comparte entre sesiones. No reinstales el adaptador antiguo.
- Engram usa el binario 3.6.1 y la política local V2 sin captura automática.
  Al actualizar su versión, verifica checksums, migración en copia y contratos MCP.
- Deja plantillas sin credenciales ni rutas personales: `arch/install.sh` escribe
  en el staging las rutas absolutas de Engram y skills y fuerza loopback en
  `service.json` antes de validar y reemplazar el perfil global. El instalador
  **reemplaza**, no fusiona, y respalda el perfil anterior y la base Engram.
- Si modificas una skill, actualiza su `content_sha256` en
  `templates/skills-lock.json`; Playwright CLI también tiene un lock npm en
  `templates/tools/playwright-cli/` y usa Chromium del sistema.

## Verificación

- `node arch/check.mjs`: plugins, permisos, modelos y hashes de skills sobre las
  plantillas, sin red ni servicio. `python arch/check-install.py`: instalador en
  HOME/XDG aislados con dobles de binarios; requiere Bash, Zsh y herramientas de
  Arch. `bash arch/check-documents.sh`: smoke DOCX/PDF con Pandoc, LibreOffice y Poppler.
- `python -I arch/check-visuals.py --output DIR-NUEVO`: DOCX editorial, PPTX con
  PptxGenJS, diagramas Graphviz y regresiones del validador. Requiere `slides-node`
  del perfil; conserva renders para inspección visual. No llama modelos.
- `bash arch/verify.sh` valida el perfil *instalado*, no `templates/`; usa
  `--config-dir DIR` para un staging preparado o `--live` después de activar el
  servicio. Para `--live`, invoca el script por ruta absoluta desde un directorio
  sin configuración de proyecto, para no alterar las comprobaciones de MCPs.
