#!/usr/bin/env bash
# skills-common.sh - logica compartida del paso "skills" entre Arch y WSL.
#
# Lo sourcean arch/skills.sh y wsl/skills.sh tras instalar los binarios del
# sistema con su package manager respectivo. Requiere:
#   - REPO_DIR exportada apuntando al root del repo opencode-dotfiles.
#   - PLATFORM exportada como "arch" o "wsl" (para localizar opencode-serve.sh).
#   - SKILLS_REPO y SKILLS_REF leidas de dotfiles.env.

set -euo pipefail

CONFIG_DIR="$REPO_DIR/config"
OPENCODE_CFG_DIR="$HOME/.config/opencode"
SKILL_DIR="$OPENCODE_CFG_DIR/skills"
PYVENV="$HOME/.venvs/opencode-skills"
NODE_AISLADO="$HOME/.opencode-skills/node"
SKILLS_ENV_FILE="$OPENCODE_CFG_DIR/skills-env.sh"
PONYTAIL_CFG_DIR="$HOME/.config/ponytail"
PONYTAIL_CFG_FILE="$PONYTAIL_CFG_DIR/config.json"
PONYTAIL_STATE_FILE="$OPENCODE_CFG_DIR/.ponytail-active"
DEST="$HOME/.config/opencode-dotfiles"  # donde provision.sh copia los scripts del systemd

# Skills de uso frecuente instalados desde anthropics/skills.
SKILLS=(
    claude-api doc-coauthoring docx frontend-design pdf skill-creator
    webapp-testing
)

# Skills antes instalados por este repo que el perfil agresivo retira. Son
# copias administradas de upstream; eliminarlos evita que sigan anunciandose.
PRUNED_SKILLS=(
    algorithmic-art brand-guidelines canvas-design internal-comms mcp-builder
    pptx slack-gif-creator theme-factory web-artifacts-builder xlsx
)

# Helpers
log()    { printf '\n==> %s\n' "$*"; }
warn()   { printf '   WARN: %s\n' "$*" >&2; }
die()    { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
have()   { command -v "$1" >/dev/null 2>&1; }
require_var() { [ -n "${!1:-}" ] || die "Falta variable $1 (debe exportarla el wrapper de plataforma)"; }

# Pregunta interactiva S/n (default S). Devuelve 0=si, 1=no. Respeta
# SKILLS_ASSUME_YES=1 (para ejecuciones no atendidas) y, si no hay terminal,
# cancela en vez de colgarse esperando una respuesta que nunca llegara.
ask_yes_no() {
    local prompt="$1" ans
    if [ "${SKILLS_ASSUME_YES:-0}" = "1" ]; then return 0; fi
    if [ ! -t 0 ]; then warn "sin terminal interactiva; no puedo preguntar: $prompt"; return 1; fi
    read -r -p "$prompt [S/n]: " ans || return 1
    [[ -z "$ans" || "$ans" =~ ^[SsYy] ]]
}

require_var REPO_DIR
require_var PLATFORM

# Cargar dotfiles.env
# shellcheck disable=SC1091
if [ -f "$DEST/defaults.env" ]; then
    source "$DEST/defaults.env"
else
    source <(sed 's/\r$//' "$CONFIG_DIR/dotfiles.env")
fi
if [ -f "$DEST/dotfiles.env" ]; then
    # shellcheck disable=SC1091
    source "$DEST/dotfiles.env"
elif [ -f "$REPO_DIR/dotfiles.env" ]; then
    # shellcheck disable=SC1091
    source <(sed 's/\r$//' "$REPO_DIR/dotfiles.env")
fi
: "${SKILLS_REPO:=https://github.com/anthropics/skills}"
: "${SKILLS_REF:=main}"
: "${OPENCODE_SERVE_PORT:=4096}"

mkdir -p "$OPENCODE_CFG_DIR" "$SKILL_DIR" "$NODE_AISLADO" "$PONYTAIL_CFG_DIR" "$DEST"
export PATH="$HOME/.local/share/go/bin:$HOME/.local/bin:$PATH"

# --- Step 0: sanity de runtimes -------------------------------------------------
log "Step 0 - chequeo de runtimes"

# Runtimes minimos. Si falta alguno (o Node/Python/Go no llegan al minimo) y el
# wrapper de plataforma definio 'platform_install_runtimes', se OFRECE instalarlo
# con el gestor de paquetes del sistema; si el usuario responde que no, se cancela
# limpio. git/curl deberian venir de provision.sh.
node_ok() {
    have node || return 1
    local maj; maj=$(node -p 'process.versions.node' 2>/dev/null | cut -d. -f1)
    [ -n "$maj" ] && [ "$maj" -ge 20 ] 2>/dev/null
}
python_ok() {
    have python3 || return 1
    python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null
}
go_bootstrap_ok() {
    have go || return 1
    local version major minor
    version=$(go env GOVERSION 2>/dev/null) || return 1
    version=${version#go}
    IFS=. read -r major minor _ <<<"$version"
    [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] \
        && (( major > 1 || (major == 1 && minor >= 21) ))
}

missing=()
python_ok || missing+=(python)
node_ok   || missing+=(node)
go_bootstrap_ok || missing+=(go)
have npm  || [[ " ${missing[*]} " == *" node "* ]] || missing+=(node)  # npm viene con node
have git  || missing+=(git)
have curl || missing+=(curl)

if [ "${#missing[@]}" -gt 0 ]; then
    warn "faltan o no cumplen el minimo: ${missing[*]}"
    if declare -F platform_install_runtimes >/dev/null; then
        if ask_yes_no "Instalarlos ahora con el gestor de paquetes del sistema?"; then
            platform_install_runtimes "${missing[@]}"
            hash -r   # refresca la cache de rutas del shell tras instalar
        else
            die "cancelado: instala manualmente [${missing[*]}] y reejecuta skills.sh"
        fi
    else
        die "faltan [${missing[*]}] y no hay instalador de plataforma; instalalos y reejecuta"
    fi
fi

# Garantia final (tras la posible instalacion): version exacta.
have python3 || die "python3 sigue ausente tras el intento de instalacion"
PYVER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
python_ok || die "se requiere Python 3.10+ (tienes $PYVER)"
node_ok   || die "se requiere Node 20+ (tienes $(node -v 2>/dev/null || echo ninguno))"
go_bootstrap_ok || die "se requiere Go 1.21+ para descargar la toolchain de Engram (tienes $(go env GOVERSION 2>/dev/null || echo ninguno))"
have npm  || die "falta npm (deberia venir con node)"
echo "  Python $PYVER  /  Node $(node -p 'process.versions.node')  /  $(go env GOVERSION)  OK"

# --- Step 2: Engram -------------------------------------------------------------
log "Step 2 - instalar Engram con Go"
mkdir -p "$HOME/.local/bin"
GOTOOLCHAIN=auto GOBIN="$HOME/.local/bin" \
    go install github.com/Gentleman-Programming/engram/cmd/engram@latest
echo "  $($HOME/.local/bin/engram --version)"

# --- Step 3: clonar skills (sparse-checkout) -----------------------------------
# Step 1 (binarios) lo hizo ya el wrapper de plataforma.
log "Step 3 - clonar/actualizar skills desde $SKILLS_REPO ($SKILLS_REF)"
CLONE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/opencode-dotfiles/anthropic-skills"
mkdir -p "$(dirname "$CLONE_DIR")"
if [ -d "$CLONE_DIR/.git" ]; then
    git -C "$CLONE_DIR" fetch --depth 1 origin "$SKILLS_REF" >/dev/null
    git -C "$CLONE_DIR" reset --hard "FETCH_HEAD" >/dev/null
else
    [ ! -e "$CLONE_DIR" ] \
        || die "$CLONE_DIR existe pero no es un clon git; muevelo o eliminalo manualmente"
    git clone --depth 1 --filter=blob:none --sparse \
        --branch "$SKILLS_REF" "$SKILLS_REPO" "$CLONE_DIR" >/dev/null
fi
git -C "$CLONE_DIR" sparse-checkout set "${SKILLS[@]/#/skills/}" >/dev/null

# Verificar que los skills seleccionados esten en el upstream
MISSING_UPSTREAM=()
for s in "${SKILLS[@]}"; do
    [ -d "$CLONE_DIR/skills/$s" ] || MISSING_UPSTREAM+=("$s")
done
if [ ${#MISSING_UPSTREAM[@]} -gt 0 ]; then
    warn "no encontrados en upstream: ${MISSING_UPSTREAM[*]}"
    warn "puede que el repo haya renombrado/eliminado algunos. Reporta el issue."
fi

# rsync -a --delete por skill para idempotencia limpia (sin acumular basura).
have rsync || die "falta rsync (deberia instalarlo el wrapper de plataforma)"
for s in "${SKILLS[@]}"; do
    SRC="$CLONE_DIR/skills/$s"
    DST="$SKILL_DIR/$s"
    [ -d "$SRC" ] || continue
    rsync -a --delete "$SRC/" "$DST/"
done
echo "  skills sincronizados: ${#SKILLS[@]}"

for s in "${PRUNED_SKILLS[@]}"; do
    DST="$SKILL_DIR/$s"
    if [ -d "$DST" ]; then
        rm -rf -- "$DST"
        echo "  skill retirado: $s"
    fi
done

# --- Step 4: venv Python --------------------------------------------------------
log "Step 4 - venv Python aislado en $PYVENV"
if [ ! -x "$PYVENV/bin/python" ]; then
    python3 -m venv "$PYVENV"
fi
"$PYVENV/bin/python" -m pip install --quiet --upgrade pip
"$PYVENV/bin/pip" install --quiet --upgrade --upgrade-strategy only-if-needed \
    python-docx pandas \
    pypdf pdfplumber reportlab pytesseract pdf2image \
    Pillow playwright

# --- Step 5: browsers de Playwright (solo Chromium) ----------------------------
log "Step 5 - browsers de Playwright (chromium)"
HAS_CHROMIUM=0
for d in "$HOME/.cache/ms-playwright/chromium-"*; do
    [ -d "$d" ] && HAS_CHROMIUM=1 && break
done
if [ $HAS_CHROMIUM -eq 0 ]; then
    "$PYVENV/bin/playwright" install chromium
else
    echo "  chromium ya descargado [skip]"
fi

# --- Step 6: node_modules aislado ----------------------------------------------
log "Step 6 - node_modules aislado en $NODE_AISLADO"
# @playwright/mcp se instala aqui (y opencode.json lo lanza con node directo)
# en vez de 'npx -y @latest' por sesion: sin cold-start ni re-descargas cuando
# @latest bumpea. Se actualiza cada vez que reejecutes skills.sh.
cat >"$NODE_AISLADO/package.json" <<'JSON'
{
  "private": true,
  "dependencies": {
    "@playwright/mcp": "latest",
    "docx": "latest"
  }
}
JSON
(cd "$NODE_AISLADO" && npm install --silent --omit=dev --no-audit --no-fund)

# Chromium para la version de Playwright del MCP (no-op si ya esta en
# ~/.cache/ms-playwright; comparte cache con el del venv si coinciden).
PW_BIN="$NODE_AISLADO/node_modules/.bin/playwright"
[ -x "$PW_BIN" ] || PW_BIN="$NODE_AISLADO/node_modules/.bin/playwright-core"
if [ -x "$PW_BIN" ]; then
    "$PW_BIN" install chromium
else
    warn "no encuentro el CLI de playwright en $NODE_AISLADO; el MCP descargara el browser al primer uso"
fi

# --- Step 7: generar skills-env.sh ---------------------------------------------
log "Step 7 - generar $SKILLS_ENV_FILE"
cat >"$SKILLS_ENV_FILE" <<'ENV'
# Generated by opencode-dotfiles skills.sh -- do not edit manually.
# Se cargan los paths aislados de Python y Node de los skills.
# Solo aplican al proceso que sourcee este archivo (el TUI de opencode,
# o el opencode-serve via systemd). No contamina shells del usuario.

export VIRTUAL_ENV="$HOME/.venvs/opencode-skills"
export PATH="$HOME/.local/share/go/bin:$HOME/.local/bin:$VIRTUAL_ENV/bin:$PATH"
# NODE_PATH actua como FALLBACK: Node busca primero en ./node_modules.
# Se appendea para no pisar otros NODE_PATH preexistentes.
export NODE_PATH="${NODE_PATH:+$NODE_PATH:}$HOME/.opencode-skills/node/node_modules"
# Mantiene Exa disponible tambien con proveedores distintos de OpenCode.
export OPENCODE_ENABLE_EXA=1
# Opciones locales adicionales no administradas por este repo.
if [ -f "$HOME/.config/opencode/skills-env.local.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.config/opencode/skills-env.local.sh"
fi
ENV
chmod 0644 "$SKILLS_ENV_FILE"

# --- Step 8: hook al shell -----------------------------------------------------
log "Step 8 - hook al shell del usuario"
SHELL_BLOCK=$(cat <<'BLOCK'
# >>> opencode-dotfiles skills env >>>
# Wrappea `opencode` para que cargue el venv y NODE_PATH aislados solo
# en esa invocacion (no contamina el resto del shell).
opencode() {
    if [ -f "$HOME/.config/opencode/skills-env.sh" ]; then
        ( . "$HOME/.config/opencode/skills-env.sh"; command opencode "$@" )
    else
        command opencode "$@"
    fi
}
# <<< opencode-dotfiles skills env <<<
BLOCK
)
add_hook_if_missing() {
    local rc="$1"
    [ -f "$rc" ] || return 0
    if grep -q "opencode-dotfiles skills env" "$rc"; then
        echo "  [skip] $rc ya tiene el hook"
    else
        printf '\n%s\n' "$SHELL_BLOCK" >>"$rc"
        echo "  hook anadido a $rc"
    fi
}
add_hook_if_missing "$HOME/.zshrc"
add_hook_if_missing "$HOME/.bashrc"

# --- Step 9: configuracion global ----------------------------------------------
log "Step 9 - instalar configuracion global"
CFG_FILE="$OPENCODE_CFG_DIR/opencode.json"
LEGACY_CFG="$OPENCODE_CFG_DIR/opencode.jsonc"
python3 -m json.tool "$CONFIG_DIR/opencode.json" >/dev/null \
    || die "$CONFIG_DIR/opencode.json no es JSON valido"
if [[ ! "$OPENCODE_SERVE_PORT" =~ ^[0-9]+$ ]] \
    || (( OPENCODE_SERVE_PORT < 1 || OPENCODE_SERVE_PORT > 65535 )); then
    die "OPENCODE_SERVE_PORT no es un puerto valido"
fi
for existing in "$CFG_FILE" "$LEGACY_CFG"; do
    if [ -f "$existing" ]; then
        BAK="$existing.bak-$(date +%Y%m%d-%H%M%S)"
        cp -f "$existing" "$BAK"
        echo "  backup: $BAK"
    fi
done
TMP_CFG="$(mktemp --tmpdir opencode.json.XXXXXX)"
trap 'rm -f "$TMP_CFG"' EXIT
python3 - "$CONFIG_DIR/opencode.json" "$OPENCODE_SERVE_PORT" >"$TMP_CFG" <<'PY'
import json, pathlib, sys

config = json.loads(pathlib.Path(sys.argv[1]).read_text())
config["server"]["port"] = int(sys.argv[2])
json.dump(config, sys.stdout, indent=2)
sys.stdout.write("\n")
PY
install -m 0600 "$TMP_CFG" "$CFG_FILE"
rm -f "$LEGACY_CFG"

# Instala el plugin oficial y la statusline; el JSON base conserva la
# configuracion MCP, por eso se repone despues del setup.
"$HOME/.local/bin/engram" setup opencode
install -m 0600 "$TMP_CFG" "$CFG_FILE"
echo "  $CFG_FILE actualizado"

# --- Step 10: Ponytail global apagado ------------------------------------------
log "Step 10 - Ponytail global (modo inicial off)"
if [ -f "$PONYTAIL_CFG_FILE" ]; then
    PONYTAIL_BAK="$PONYTAIL_CFG_FILE.bak-$(date +%Y%m%d-%H%M%S)"
    cp -f "$PONYTAIL_CFG_FILE" "$PONYTAIL_BAK"
    echo "  backup: $PONYTAIL_BAK"
fi
install -m 0600 "$CONFIG_DIR/ponytail.json" "$PONYTAIL_CFG_FILE"
printf '%s\n' off >"$PONYTAIL_STATE_FILE"
chmod 0600 "$PONYTAIL_STATE_FILE"
echo "  $PONYTAIL_CFG_FILE actualizado; modo activo: off"

# --- Step 11: AGENTS.md global -------------------------------------------------
log "Step 11 - AGENTS.md global"
AGENTS_FILE="$OPENCODE_CFG_DIR/AGENTS.md"
AGENTS_TMPL="$CONFIG_DIR/AGENTS.md"
if [ -f "$AGENTS_FILE" ]; then
    if grep -q '<!-- opencode-dotfiles -->' "$AGENTS_FILE"; then
        cp -f "$AGENTS_TMPL" "$AGENTS_FILE"
        echo "  $AGENTS_FILE actualizado (era una version anterior nuestra)"
    else
        BAK="$AGENTS_FILE.bak-$(date +%Y%m%d-%H%M%S)"
        cp -f "$AGENTS_FILE" "$BAK"
        warn "$AGENTS_FILE ya existe y no parece nuestro. Backup en $BAK"
        warn "NO sobrescribo automaticamente. Considera mergear a mano con $AGENTS_TMPL"
    fi
else
    cp -f "$AGENTS_TMPL" "$AGENTS_FILE"
    echo "  $AGENTS_FILE creado"
fi

# --- Step 12: re-copiar opencode-serve.sh al DEST (con source del env) ---------
log "Step 12 - actualizar opencode-serve.sh en $DEST"
SRC_SERVE="$REPO_DIR/$PLATFORM/opencode-serve.sh"
if [ -f "$SRC_SERVE" ]; then
    cp -f "$SRC_SERVE" "$DEST/opencode-serve.sh"
    chmod +x "$DEST/opencode-serve.sh"
    echo "  $DEST/opencode-serve.sh re-copiado desde el repo"
    if systemctl is-active opencode-serve >/dev/null 2>&1; then
        sudo systemctl restart opencode-serve
        echo "  opencode-serve reiniciado"
    else
        warn "opencode-serve no esta activo. Levantalo con: sudo systemctl start opencode-serve"
    fi
else
    warn "no se encontro $SRC_SERVE; ejecuta provision.sh antes de skills.sh"
fi

# --- Step 13: smoke test -------------------------------------------------------
log "Step 13 - smoke test"
bash "$CONFIG_DIR/skills-smoke-test.sh" || warn "el smoke test reporto fallos; revisalos"

echo ""
echo "============================================================"
echo " Skills + configuracion global instaladas."
echo "   Skills:        $SKILL_DIR  (${#SKILLS[@]} skills)"
echo "   venv Python:   $PYVENV"
echo "   node aislado:  $NODE_AISLADO"
echo "   Config:        $OPENCODE_CFG_DIR/opencode.json"
echo "   Engram:        $HOME/.local/bin/engram"
echo "   Ponytail:      $PONYTAIL_CFG_FILE  (off por defecto)"
echo "   Reglas:        $OPENCODE_CFG_DIR/AGENTS.md"
echo "   Env file:      $SKILLS_ENV_FILE"
echo ""
echo " Abre una terminal NUEVA (para cargar el hook del shell) y lanza:"
echo "   opencode"
echo ""
echo " Tokens opcionales (exportalos en tu shell rc si los quieres):"
echo "   CONTEXT7_API_KEY   - mayor rate-limit en docs (https://context7.com)"
echo " Playwright MCP queda desactivado hasta que un proyecto lo habilite."
echo " Ponytail queda cargado pero en off; activalo con /ponytail lite o full."
echo " Exa/websearch queda habilitado globalmente."
echo "============================================================"
