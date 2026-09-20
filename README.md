# opencode-dotfiles

Instalacion reproducible de OpenCode para Arch Linux y Windows 11 con
WSL2/Debian. Configura un unico `opencode serve` en `127.0.0.1:4096` y, de
forma opcional, instala skills, MCP y herramientas de documentos.

## Configuracion Base

`config/opencode.json` es la fuente de verdad y se puede usar directamente:

```bash
mkdir -p ~/.config/opencode
install -m 0600 config/opencode.json ~/.config/opencode/opencode.json
rm -f ~/.config/opencode/opencode.jsonc
```

Incluye la configuracion validada de este equipo:

- servidor local en `127.0.0.1:4096`;
- agente `build` por defecto y Ponytail 4.8.4;
- Engram habilitado con el perfil MCP `agent`;
- Context7 habilitado con API key opcional desde `CONTEXT7_API_KEY`;
- Codegraph y Playwright registrados pero deshabilitados;
- permisos de lectura, ejecucion y proteccion de secretos.

El proveedor y los modelos Kimi/Modal no se versionan. Tampoco se incluyen sus
credenciales.

OpenCode carga la configuracion al iniciar. Cierra y vuelve a abrir el TUI o
reinicia `opencode-serve` despues de modificarla.

## Arch Linux

```bash
git clone <url-del-repo> ~/opencode-dotfiles
cd ~/opencode-dotfiles
cp config/dotfiles.env dotfiles.env
chmod 600 dotfiles.env
${EDITOR:-nano} dotfiles.env
bash arch/install.sh
```

El instalador usa el paquete oficial `extra/opencode` y recurre a
`opencode-bin` de AUR solo si no esta disponible. Tambien crea y habilita el
servicio `opencode-serve`.

La app de escritorio es opcional:

```bash
bash arch/desktop.sh
```

## Windows con WSL2

Requiere Windows 11 22H2 o posterior. Desde PowerShell:

```powershell
git clone <url-del-repo> D:\opencode-dotfiles
Set-Location D:\opencode-dotfiles
powershell -ExecutionPolicy Bypass -File .\windows\install.ps1
```

El instalador:

1. instala o reutiliza Debian en WSL2;
2. aplica `windows/.wslconfig` y habilita systemd;
3. instala OpenCode dentro de Debian;
4. crea `opencode-serve` y los launchers `opencode` y `oc`;
5. ofrece instalar la app de escritorio con Scoop.

Si Windows solicita reiniciar durante la instalacion de WSL, reinicia y vuelve
a ejecutar el mismo comando.

## Variables

`config/dotfiles.env` contiene los valores predeterminados. `dotfiles.env` en
la raiz es la copia privada ignorada por Git.

| Variable | Predeterminado | Uso |
|---|---|---|
| `WSL_DISTRO` | `Debian` | Distribucion WSL que se instala o reutiliza. |
| `OPENCODE_WORKDIR` | `.config/opencode` | Directorio de trabajo de `opencode-serve`. |
| `OPENCODE_SERVE_PORT` | `4096` | Puerto local del API y la web. |
| `OPENCODE_SERVER_PASSWORD` | vacio | Basic Auth opcional en Arch; WSL lo ignora. |
| `SKILLS_REPO` | `anthropics/skills` | Origen de los skills oficiales. |
| `SKILLS_REF` | `main` | Rama, tag o commit del repositorio de skills. |

## Skills, MCP y Engram

Este paso opcional requiere Node 20+ y Python 3.10+. En WSL instala Go 1.25.10
desde `go.dev` en `~/.local/share/go` si falta un bootstrap 1.21+; Arch usa el
paquete `go` actual.
`go install` descarga automaticamente cualquier toolchain posterior que exija
Engram. Si falta algun runtime, el script ofrece instalarlo.

Arch:

```bash
bash arch/skills.sh
```

WSL, usando la ruta del repositorio visible dentro de Linux:

```bash
oc bash /ruta/al/repositorio/wsl/skills.sh
```

El script instala:

- `claude-api`, `doc-coauthoring`, `docx`, `frontend-design`, `pdf`,
  `skill-creator` y `webapp-testing`;
- un venv Python en `~/.venvs/opencode-skills`;
- dependencias Node en `~/.opencode-skills/node`;
- Chromium para Playwright;
- Engram mediante `go install` en `~/.local/bin/engram`;
- el plugin oficial de Engram mediante `engram setup opencode`;
- `config/opencode.json`, `config/AGENTS.md` y la configuracion de Ponytail.

Antes de reemplazar una configuracion existente crea un backup con sufijo
`.bak-YYYYmmdd-HHMMSS`. El antiguo `opencode.jsonc` se retira para evitar que
OpenCode mezcle dos configuraciones globales.

Para instalar solamente Engram y la configuracion base:

```bash
mkdir -p ~/.local/bin ~/.config/opencode
GOTOOLCHAIN=auto GOBIN="$HOME/.local/bin" go install github.com/Gentleman-Programming/engram/cmd/engram@latest
~/.local/bin/engram setup opencode
install -m 0600 config/opencode.json ~/.config/opencode/opencode.json
rm -f ~/.config/opencode/opencode.jsonc
```

## Opciones

Context7 funciona sin clave con un limite menor. Para ampliar el limite, define
la variable en `~/.config/opencode/skills-env.local.sh`:

```bash
export CONTEXT7_API_KEY=...
```

Playwright queda deshabilitado globalmente para no cargar sus herramientas en
todas las sesiones. Un proyecto puede activarlo con:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": {
      "enabled": true
    }
  }
}
```

Ponytail queda instalado y apagado por defecto:

```text
/ponytail lite
/ponytail full
/ponytail off
```

## Uso

```bash
opencode
opencode auth login
systemctl status opencode-serve
journalctl -u opencode-serve -e
```

- Web: `http://localhost:4096/`
- API y app de escritorio: `http://127.0.0.1:4096`

En Windows, `opencode` abre el TUI dentro de Debian; `oc` abre una shell y
`oc <comando>` ejecuta un comando en la distribucion.

## Verificacion

```bash
bash config/skills-smoke-test.sh
python3 -m json.tool config/opencode.json >/dev/null
```

El smoke test comprueba runtimes, dependencias, siete skills, Engram, la
configuracion reconciliada y el servicio local.

## Solucion de Problemas

- Si la web no carga, revisa `systemctl status opencode-serve` y el journal.
- En WSL, confirma `networkingMode=mirrored` y ejecuta `wsl --shutdown` tras
  cambiar `.wslconfig`.
- Si Engram no aparece, confirma que `~/.local/bin` esta en `PATH` y ejecuta
  `engram setup opencode`.
- Si Playwright no tiene Chromium, reejecuta `arch/skills.sh` o `wsl/skills.sh`.
- Si cambias `opencode.json`, reinicia OpenCode; la configuracion no se recarga
  durante una sesion activa.
