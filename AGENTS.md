# Guía de este repositorio

- El perfil instalable de OpenCode V2 vive en `templates/`; el `AGENTS.md` de la
  raíz guía este checkout, mientras `templates/AGENTS.md` se instala como regla
  global. Lo específico de plataforma va en `arch/` o `windows/`.
- La instalación completa está implementada solo para Arch; `windows/README.md`
  copia manualmente `opencode.jsonc`, sin desplegar plugins ni skills.
- Consulta la documentación de V2 al modificar configuración o plugins:
  https://opencode.ai/v2/docs/config.

## Perfil y despliegue

- `templates/opencode.jsonc` registra los plugins de servidor Engram y Ponytail;
  la statusline de TUI se registra aparte en `templates/cli.json`. Herdr es
  opcional y lo instala su integración oficial, después de desplegar el perfil;
  una reinstalación limpia requiere volver a integrarlo.
- Mantén la adaptación local de Ponytail: el entrypoint upstream 4.10.0 usa
  hooks V1. Su nivel inicial es `lite` (entorno `PONYTAIL_DEFAULT_MODE` antes que
  opción del plugin); `/ponytail` sin argumento usa `full`.
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
- `bash arch/verify.sh` valida el perfil *instalado*, no `templates/`; usa
  `--config-dir DIR` para un staging preparado o `--live` después de activar el
  servicio. Para `--live`, invoca el script por ruta absoluta desde un directorio
  sin configuración de proyecto, para no alterar las comprobaciones de MCPs.
