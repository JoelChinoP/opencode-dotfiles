# opencode-dotfiles

Instalación y configuración automatizada de **OpenCode** en **Windows**
mediante **WSL2 + Debian** y en **Arch Linux** nativo.

El setup base ejecuta un único <code>opencode serve</code> como servicio
<code>systemd</code>. Este proceso expone el API y la web UI en <code>/app</code>,
ambos limitados a <code>127.0.0.1:4096</code>. El navegador, la app de escritorio
y los SDK se conectan directamente a ese servicio.

- [Windows (WSL2 + Debian)](#windows-wsl2--debian)
- [Arch Linux (nativo)](#arch-linux-nativo)
- [Skills y configuración global](#skills-y-configuración-global-paso-opcional-válido-para-arch-y-wsl)

---

# Windows (WSL2 + Debian)

## Qué hace

1. Instala o configura WSL2 y Debian.
2. Copia una <code>.wslconfig</code> preparada para OpenCode y Docker.
3. Habilita <code>systemd</code> dentro de Debian.
4. Instala los paquetes base y OpenCode.
5. Configura Git con <code>core.fileMode=false</code>,
   <code>core.autocrlf=input</code> y <code>core.eol=lf</code>.
6. Crea el servicio permanente <code>opencode-serve</code> en
   <code>127.0.0.1:4096</code>.
7. Crea los comandos <code>opencode</code> y <code>oc</code> para Windows.
8. Opcionalmente instala la app de escritorio mediante Scoop.

La web queda disponible en <code>http://localhost:4096/app</code>. La red
mirrored de WSL permite que el <code>localhost</code> de Windows llegue
directamente al servicio de Debian.

El proveedor de IA se configura después con <code>opencode auth login</code>.

## Requisitos

- Windows 11 22H2 o superior para <code>networkingMode=mirrored</code>.
- Permisos de administrador para instalar y configurar WSL.
- Conexión a internet.

## Instalación rápida

Desde PowerShell:

~~~powershell
git clone <url-de-este-repo> D:\opencode-dotfiles
cd D:\opencode-dotfiles
powershell -ExecutionPolicy Bypass -File .\windows\install.ps1
~~~

El instalador se eleva con UAC solo para el paso que configura WSL. Si Debian ya
existe, permite conservarla o reinstalarla. La app de escritorio se ofrece como
paso opcional.

Si Windows pide reiniciar durante la primera instalación de WSL, reinicia y
vuelve a ejecutar <code>install.ps1</code>.

## Estructura principal

~~~text
opencode-dotfiles/
├─ config/
│  └─ dotfiles.env
├─ windows/
│  ├─ .wslconfig
│  ├─ install.ps1
│  ├─ 01-setup-wsl.ps1
│  ├─ 02-provision.ps1
│  ├─ 03-launchers.ps1
│  └─ 04-desktop.ps1
├─ wsl/
│  ├─ provision.sh
│  ├─ opencode-serve.sh
│  └─ skills.sh
└─ arch/
   ├─ install.sh
   ├─ provision.sh
   ├─ opencode-serve.sh
   ├─ desktop.sh
   └─ skills.sh
~~~

## Configuración central

Edita <code>config/dotfiles.env</code> antes de instalar:

| Clave | Valor inicial | Uso |
|---|---:|---|
| <code>WSL_DISTRO</code> | <code>Debian</code> | Distribución WSL que se instala o reutiliza. |
| <code>OPENCODE_WORKDIR</code> | <code>.config/opencode</code> | Directorio de trabajo del servicio; una ruta relativa parte de <code>$HOME</code>. |
| <code>OPENCODE_SERVE_PORT</code> | <code>4096</code> | Puerto local del API y la web UI. |
| <code>OPENCODE_SERVER_PASSWORD</code> | vacío | Basic Auth opcional; el usuario predeterminado es <code>opencode</code>. |
| <code>SKILLS_REPO</code> | repositorio oficial | Origen de los skills opcionales. |
| <code>SKILLS_REF</code> | <code>main</code> | Rama, tag o commit de los skills. |

El servicio escucha solamente en <code>127.0.0.1</code>. Si cambias el puerto,
reejecuta la provisión para regenerar y reiniciar el servicio.

## Ajustes de WSL

<code>windows/.wslconfig</code> se copia a
<code>%USERPROFILE%\.wslconfig</code> y aplica a todas las distros WSL2. Sus
valores principales son:

| Clave | Valor | Uso |
|---|---:|---|
| <code>memory</code> | <code>8GB</code> | Límite de RAM de la VM. |
| <code>processors</code> | <code>4</code> | Núcleos lógicos disponibles. |
| <code>networkingMode</code> | <code>mirrored</code> | Comparte <code>localhost</code> entre Windows y WSL. |
| <code>dnsTunneling</code> | <code>true</code> | Mejora DNS en VPN y redes corporativas. |
| <code>autoProxy</code> | <code>true</code> | Hereda la configuración de proxy de Windows. |
| <code>firewall</code> | <code>true</code> | Aplica el Firewall de Windows al tráfico WSL. |
| <code>autoMemoryReclaim</code> | <code>gradual</code> | Recupera RAM no usada progresivamente. |
| <code>sparseVhd</code> | <code>true</code> | Reduce el crecimiento de VHDX nuevos. |

Después de editar el archivo, ejecuta <code>wsl --shutdown</code>, espera unos
segundos y vuelve a abrir Debian.

## Uso diario

~~~powershell
opencode
oc
oc git status
oc systemctl status opencode-serve
oc journalctl -u opencode-serve -e
oc opencode auth login
oc opencode upgrade
~~~

- <code>opencode</code> abre el TUI dentro de Debian.
- <code>oc</code> abre una shell de Debian.
- <code>oc &lt;comando&gt;</code> ejecuta un comando en Debian.
- La web se abre en <code>http://localhost:4096/app</code>.
- El API para la app y los SDK está en <code>http://localhost:4096</code>.

Para máximo rendimiento, conserva los repositorios dentro del filesystem Linux
de WSL. Trabajar directamente sobre <code>/mnt/c</code> o <code>/mnt/d</code>
añade el coste del puente entre Windows y Linux.

### Usar otra carpeta temporalmente

~~~bash
oc
sudo systemctl stop opencode-serve
cd /ruta/del/proyecto
opencode serve --hostname 127.0.0.1 --port 4096
~~~

Al terminar, detén ese proceso y ejecuta:

~~~bash
sudo systemctl start opencode-serve
~~~

## App de escritorio en Windows

El paso opcional se puede ejecutar por separado:

~~~powershell
powershell -ExecutionPolicy Bypass -File .\windows\04-desktop.ps1
~~~

En la app, abre **Configuración → Servidores → Añadir servidor**, registra
<code>http://localhost:4096</code>, selecciónalo y cierra la aplicación desde su
menú para que la elección se guarde.

Si aparece otro proceso de OpenCode en un puerto aleatorio, la app sigue usando
su servidor interno. Selecciona la entrada de <code>localhost:4096</code> y
elimina la entrada local anterior desde la propia interfaz.

## Solución de problemas en Windows

- Si <code>opencode</code> no se reconoce, abre una terminal nueva para recargar
  el <code>PATH</code>.
- Si la web no carga, ejecuta <code>oc systemctl status opencode-serve</code> y
  <code>oc journalctl -u opencode-serve -e</code>.
- Si Windows no llega al puerto, confirma que <code>.wslconfig</code> usa
  <code>networkingMode=mirrored</code> y ejecuta <code>wsl --shutdown</code>.
- Si <code>systemctl</code> indica que <code>systemd</code> no está activo,
  reejecuta <code>windows/01-setup-wsl.ps1</code>.
- Si la app de escritorio falla, confirma que el servidor seleccionado es
  <code>http://localhost:4096</code>.

## Notas sobre Git

La provisión WSL aplica:

~~~bash
git config --global core.fileMode false
git config --global core.autocrlf input
git config --global core.eol lf
~~~

El repositorio incluye <code>.gitattributes</code> para conservar en LF los
archivos que se ejecutan dentro de Linux.

---

# Arch Linux (nativo)

En Arch no hay capa WSL. El servicio y los proyectos usan directamente el
filesystem Linux.

## Qué hace

1. Instala OpenCode desde AUR mediante <code>paru</code> o <code>yay</code>; si
   no están disponibles, usa el paquete del repositorio oficial.
2. Instala <code>wl-clipboard</code>, <code>xclip</code> o ambos según la sesión
   gráfica.
3. Crea <code>opencode-serve</code> como servicio <code>systemd</code> en
   <code>127.0.0.1:4096</code>.
4. Opcionalmente instala la app de escritorio nativa.

## Instalación

~~~bash
git clone <url-de-este-repo> ~/opencode-dotfiles
cd ~/opencode-dotfiles
bash arch/install.sh
~~~

Ejecuta el instalador como usuario normal. Pedirá <code>sudo</code> únicamente
cuando sea necesario instalar paquetes o escribir el servicio del sistema.

## Uso diario

~~~bash
opencode
opencode auth login
systemctl status opencode-serve
journalctl -u opencode-serve -e
opencode upgrade
~~~

- Web UI: <code>http://localhost:4096/app</code>
- API y app de escritorio: <code>http://127.0.0.1:4096</code>

El <code>WorkingDirectory</code> del servicio se toma de
<code>OPENCODE_WORKDIR</code>. El TUI se puede abrir desde cualquier proyecto y
trabaja en el directorio actual.

## App de escritorio en Arch

~~~bash
bash arch/desktop.sh
~~~

En la app, añade <code>http://127.0.0.1:4096</code> en **Configuración →
Servidores**, selecciona esa entrada y cierra la aplicación desde su menú para
persistir la elección.

## Solución de problemas en Arch

- Verifica el servicio con <code>systemctl status opencode-serve</code>.
- Consulta los logs con <code>journalctl -u opencode-serve -e</code>.
- Confirma el puerto con <code>ss -tlnp | grep 4096</code>.
- Si la app usa un puerto aleatorio, selecciona explícitamente
  <code>http://127.0.0.1:4096</code> en su lista de servidores.

---

# Skills y configuración global (paso opcional, válido para Arch y WSL)

Hasta aquí el setup base te deja `opencode serve` corriendo permanente con la
web UI y la API. Este paso añade lo que hace falta para que el agente tenga,
**de fábrica**, las capacidades de uso frecuente: Word/PDF, frontend, testing
E2E y documentación de Claude; Context7; búsqueda web; Playwright y GitHub
opt-in; y permisos balanceados.

Funciona idéntico en **Arch nativo** y **WSL**.

## Requisitos

- **Node 20+** (recomendado 22+). El setup verifica al arrancar.
- **Python 3.10+** (recomendado 3.12+). En Arch, el Python global está
  *externally-managed* — por eso usamos venv aislado (no pisa nada).
- **~3 GB libres** en disco:
  - LibreOffice still: ~1 GB
  - Chromium (Playwright): ~300 MB
  - Skills + venvs + node_modules aislado: ~500 MB
  - Resto de binarios (poppler, qpdf, tesseract, pandoc, ghostscript, imagemagick, ffmpeg): ~500 MB

## Instalación

**Arch nativo:**
```bash
cd /home/joel/git/opencode-dotfiles
bash arch/skills.sh
```

**WSL:**
```bash
oc bash ~/opencode-dotfiles/wsl/skills.sh
```

El script es **idempotente**: puedes reejecutarlo cuando quieras (actualiza
skills con `git pull --ff-only` y reinstala deps Python/Node solo si hace falta).

## Qué hace, paso a paso

1. **Binarios del sistema** (pacman/apt): LibreOffice (en Arch `libreoffice-still`;
   en Debian/WSL solo writer/calc/impress con `--no-install-recommends`, que
   ahorra >1 GB), poppler, qpdf, tesseract, pandoc, ghostscript, imagemagick,
   ffmpeg, jq, rsync.
2. **Clona 7 skills frecuentes** de `anthropics/skills` a
   `~/.config/opencode/skills/`:
   - **Documentos:** `docx`, `pdf`, `doc-coauthoring`
   - **Frontend:** `frontend-design`
   - **Testing:** `webapp-testing` (Playwright Python)
   - **API de Claude:** `claude-api`
   - **Meta:** `skill-creator`
   El perfil agresivo retira los 10 skills de bajo uso que instalaban versiones
   anteriores. Skills externos como `context7-mcp` o `mermaid-diagram` no son
   administrados por este listado y se conservan si ya existen.
3. **venv Python aislado** en `~/.venvs/opencode-skills` con: `python-docx`,
   `openpyxl`, `pandas`, `pypdf`, `pdfplumber`, `reportlab`, `pytesseract`,
   `pdf2image`, `markitdown[all]`, `Pillow`, `beautifulsoup4`, `markdown`,
   `playwright`, `fastmcp`, `mcp`, `json5`.
4. **Chromium para Playwright** (~300 MB) en `~/.cache/ms-playwright/`.
5. **node_modules aislado** en `~/.opencode-skills/node/` con: `docx`,
   `pptxgenjs`, `@modelcontextprotocol/sdk`, `@playwright/mcp` (el MCP de
   Playwright se lanza desde aquí, sin `npx` por sesión: arranque más rápido
   y sin re-descargas de Chromium cuando `@latest` cambia).
6. **Genera** `~/.config/opencode/opencode.jsonc` con Context7, Playwright
   registrado pero deshabilitado, y permisos balanceados. Si ya tenías config,
   **se mergea** profundo y se hace backup (no se pisa tu `server` ni otras
   preferencias). Ponytail se elimina de la configuración global; se activa
   únicamente por proyecto.
7. **Genera** un `~/.config/opencode/AGENTS.md` global breve: idioma español,
   documentación actual cuando haga falta y verificación proporcional.
8. **Hook al shell**: añade una función `opencode()` a `~/.zshrc` (y
   `~/.bashrc` si existe) que inyecta los paths aislados solo en esa
   invocación. **No contamina tu shell normal**.
9. **Reinicia `opencode-serve`** para que el systemd también cargue el venv
   y los módulos Node aislados.
10. **Smoke test** automático al final.

## Aislamiento — por qué no rompe tus otros proyectos

- **Python**: las libs viven en `~/.venvs/opencode-skills`, no en el Python
  global ni en `~/.local`. Tus otros venvs/proyectos no las ven.
- **Node**: las libs viven en `~/.opencode-skills/node`, no en `npm -g`.
  `NODE_PATH` actúa como **fallback** (Node prefiere `./node_modules` local),
  así que tus repos resuelven sus propias deps sin interferencia.
- **Shell**: la función `opencode()` usa un subshell `( ... )` para exportar
  las variables; al volver tu shell queda como antes. Si ejecutas `node` o
  `python` por fuera de `opencode`, ves tu entorno normal.

## Web search y tokens opcionales

Para opciones que deban llegar tanto al TUI como a `opencode-serve`, usa
`~/.config/opencode/skills-env.local.sh`. El instalador lo carga pero no lo
crea ni sobrescribe; protégelo con permisos `0600` si contiene claves.

Exa queda habilitado globalmente: la configuración permite `websearch` y
`skills-env.sh` exporta `OPENCODE_ENABLE_EXA=1`, lo que mantiene la herramienta
disponible también con proveedores distintos de OpenCode. No necesita API key.

```bash
# === Context7 (docs de librerías) ===
# Funciona SIN key (rate-limit modesto). Si quieres más rate-limit, crea
# cuenta gratis en https://context7.com → Dashboard → genera una API key
# y exportala (también descomenta el bloque `headers` en opencode.jsonc):
export CONTEXT7_API_KEY=...

# === GitHub MCP ===
# Solo si decides activar el MCP (ver siguiente sección). Genera un PAT en
# https://github.com/settings/tokens (scopes mínimos: repo, read:org, gist).
export GITHUB_TOKEN=ghp_...
```

## Activar Playwright MCP por proyecto (opcional)

Playwright queda registrado globalmente con `"enabled": false`, por lo que sus
23 herramientas no entran en el contexto normal. Para activarlo únicamente en
un proyecto, añade a su `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": { "enabled": true }
  }
}
```

Reinicia OpenCode después de cambiar configuración.

## Activar Ponytail por proyecto (opcional)

Ponytail no se carga globalmente. En el proyecto donde quieras usarlo, añade:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@dietrichgebert/ponytail"]
}
```

Así sus instrucciones y seis skills solo consumen contexto en ese proyecto.

## Activar el MCP de GitHub (opcional)

El GitHub MCP **infla bastante el contexto** (muchas tools). Por eso queda
**comentado** en el opencode.jsonc por defecto. Si lo quieres:

1. Edita `~/.config/opencode/opencode.jsonc` y descomenta el bloque
   `"github": {...}`.
2. Exporta `GITHUB_TOKEN`.
3. Para reducir el impacto, considera deshabilitarlo en sesiones normales y
   activarlo solo en agentes específicos con `"tools": { "github_*": true }`
   en ese agente.

**Alternativa cero-overhead** (recomendada para la mayoría): déjalo comentado
y deja que el agente use `gh` por bash (`gh pr view`, `gh issue list`,
`gh search code`). El `AGENTS.md` global ya recomienda este enfoque.

## Estructura de permisos balanceada

El `opencode.jsonc` que se genera trae un bloque `permission` con esta
filosofía: **el último patrón que coincide gana**, así que los denies van
primero (irreversibles), el catch-all `"ask"` en medio, y los allows
específicos al final.

- **Denies duros** (siempre bloqueados): `sudo`, `rm -rf`, `mkfs`,
  `dd if=/of=/dev/*`, `shutdown`, `reboot`, pipes `curl|sh`, `chmod -R 777`.
- **Allows seguros**: lectura (`ls`, `cat`, `rg`, `grep`, `find`...), git no
  destructivo, runtimes (`python`, `node`, `go run`, `cargo build`...),
  scripts de proyecto (`npm run`, `npm test`, etc.), manipulación no
  destructiva (`mkdir`, `cp`, `mv`, `touch`), toolchain de skills (`soffice`,
  `pdftoppm`, `pandoc`, `convert`, `ffmpeg`...).
- **`pip install` y `npm install` quedan en `ask`** intencionalmente — te
  avisa antes de instalar paquetes (riesgo de typosquatting/malware). Cuando
  OpenCode te pregunte, elige "Always" en esa sesión si confías.
- **`.env`, claves SSH (`id_rsa`, `id_ed25519`), `*.pem`, `secrets/`**
  bloqueados en `read`.

Puedes editar `~/.config/opencode/opencode.jsonc` para ajustar a tu gusto;
el script no lo vuelve a pisar mientras tenga la sentinela.

## Verificación

```bash
bash config/skills-smoke-test.sh
```

Imprime OK/MISS por cada componente: imports Python, requires Node, binarios
del sistema, presencia del conjunto reducido de skills, validez del
`opencode.jsonc`, hook
en el shell, `opencode-serve` activo y MCP de Context7 alcanzable.

Exit code = número de fallos (0 si todo OK).

## Desinstalación limpia

```bash
# 1. Quitar aislamientos
rm -rf ~/.venvs/opencode-skills ~/.opencode-skills

# 2. Quitar skills clonados (NO borra tu config ni tus sesiones)
rm -rf ~/.config/opencode/skills

# 3. (Opcional) Restaurar el opencode.jsonc previo — backups con timestamp:
ls ~/.config/opencode/opencode.jsonc.bak-*
# elige uno y: cp <bak> ~/.config/opencode/opencode.jsonc

# 4. (Opcional) Quitar el hook del .zshrc / .bashrc:
#    busca y elimina el bloque entre las sentinelas:
#    # >>> opencode-dotfiles skills env >>>
#    # <<< opencode-dotfiles skills env <<<

# 5. Reejecutar provision base para reponer el opencode-serve.sh "limpio":
bash arch/install.sh   # o el equivalente WSL
```

Los binarios del sistema (LibreOffice, etc.) los puedes dejar — no estorban.
Si quieres quitarlos: `sudo pacman -Rs libreoffice-still poppler ...`.

## Solución de problemas (skills)

- **`bash arch/skills.sh` aborta por `python venv create`**: en Arch falta el
  paquete `python` (deberías tenerlo); en Debian/WSL es `python3-venv`.
- **`playwright install chromium` cuelga**: red lenta — son ~300 MB. Si la
  ejecución se interrumpe, reejecuta `skills.sh` (es idempotente).
- **`tesseract-data-eng` no existe en Arch**: el script lo detecta y sigue
  sin él; tesseract base trae el OCR de inglés en muchos casos.
- **Smoke test falla en `python imports`**: probablemente el `pip install`
  no completó. Reejecuta `skills.sh` y mira la salida del Step 3.
- **Smoke test falla en `node requires`**: ídem para Step 5. Verifica con
  `ls ~/.opencode-skills/node/node_modules/`.
- **El TUI nuevo no carga los skills**: cierra y abre una terminal nueva
  (para cargar el hook del `.zshrc`). O simplemente `source ~/.zshrc`.
- **El systemd `opencode-serve` no encuentra los skills**: confirma que
  `~/.config/opencode/skills-env.sh` existe y que `opencode-serve.sh` en
  `~/.config/opencode-dotfiles/` tiene el `source` (el `skills.sh` lo
  re-copia automáticamente).
