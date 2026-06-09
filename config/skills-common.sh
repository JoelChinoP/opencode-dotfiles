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
DEST="$HOME/.config/opencode-dotfiles"  # donde provision.sh copia los scripts del systemd

# Lista oficial de skills a instalar (las 17 del repo anthropics/skills).
SKILLS=(
    algorithmic-art brand-guidelines canvas-design claude-api doc-coauthoring
    docx frontend-design internal-comms mcp-builder pdf pptx skill-creator
    slack-gif-creator theme-factory web-artifacts-builder webapp-testing xlsx
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
source "$CONFIG_DIR/dotfiles.env"
: "${SKILLS_REPO:=https://github.com/anthropics/skills}"
: "${SKILLS_REF:=main}"

mkdir -p "$OPENCODE_CFG_DIR" "$SKILL_DIR" "$NODE_AISLADO" "$DEST"

# --- Step 0: sanity de runtimes -------------------------------------------------
log "Step 0 - chequeo de runtimes"

# Runtimes minimos. Si falta alguno (o Node/Python no llegan al minimo) y el
# wrapper de plataforma definio 'platform_install_runtimes', se OFRECE instalarlo
# con el gestor de paquetes del sistema; si el usuario responde que no, se cancela
# limpio. git/curl deberian venir de provision.sh; jq lo instala el Step 1.
node_ok() {
    have node || return 1
    local maj; maj=$(node -p 'process.versions.node' 2>/dev/null | cut -d. -f1)
    [ -n "$maj" ] && [ "$maj" -ge 20 ] 2>/dev/null
}
python_ok() {
    have python3 || return 1
    python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null
}

missing=()
python_ok || missing+=(python)
node_ok   || missing+=(node)
have npm  || [[ " ${missing[*]} " == *" node "* ]] || missing+=(node)  # npm viene con node
have git  || missing+=(git)
have curl || missing+=(curl)
have jq   || missing+=(jq)

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
have npm  || die "falta npm (deberia venir con node)"
have jq   || die "falta jq"
echo "  Python $PYVER  /  Node $(node -p 'process.versions.node')  OK"

# --- Step 2: clonar skills (sparse-checkout) -----------------------------------
# Step 1 (binarios) lo hizo ya el wrapper de plataforma.
log "Step 2 - clonar/actualizar skills desde $SKILLS_REPO ($SKILLS_REF)"
CLONE_DIR="/tmp/anthropic-skills-clone"
if [ -d "$CLONE_DIR/.git" ]; then
    git -C "$CLONE_DIR" fetch --depth 1 origin "$SKILLS_REF" >/dev/null
    git -C "$CLONE_DIR" reset --hard "FETCH_HEAD" >/dev/null
else
    rm -rf "$CLONE_DIR"
    git clone --depth 1 --filter=blob:none --sparse \
        --branch "$SKILLS_REF" "$SKILLS_REPO" "$CLONE_DIR" >/dev/null
    git -C "$CLONE_DIR" sparse-checkout set skills >/dev/null
fi

# Verificar que los 17 esten en el upstream
MISSING_UPSTREAM=()
for s in "${SKILLS[@]}"; do
    [ -d "$CLONE_DIR/skills/$s" ] || MISSING_UPSTREAM+=("$s")
done
if [ ${#MISSING_UPSTREAM[@]} -gt 0 ]; then
    warn "no encontrados en upstream: ${MISSING_UPSTREAM[*]}"
    warn "puede que el repo haya renombrado/eliminado algunos. Reporta el issue."
fi

# rsync -a --delete por skill para idempotencia limpia (sin acumular basura).
if ! have rsync; then
    warn "rsync no esta instalado; usando cp -r (puede dejar archivos viejos)."
fi
for s in "${SKILLS[@]}"; do
    SRC="$CLONE_DIR/skills/$s"
    DST="$SKILL_DIR/$s"
    [ -d "$SRC" ] || continue
    if have rsync; then
        rsync -a --delete "$SRC/" "$DST/"
    else
        rm -rf "$DST"
        cp -r "$SRC" "$DST"
    fi
done
echo "  skills sincronizados: ${#SKILLS[@]}"

# --- Step 3: venv Python --------------------------------------------------------
log "Step 3 - venv Python aislado en $PYVENV"
if [ ! -x "$PYVENV/bin/python" ]; then
    python3 -m venv "$PYVENV"
fi
"$PYVENV/bin/python" -m pip install --quiet --upgrade pip
"$PYVENV/bin/pip" install --quiet --upgrade --upgrade-strategy only-if-needed \
    python-docx openpyxl pandas \
    pypdf pdfplumber reportlab pytesseract pdf2image \
    "markitdown[all]" \
    Pillow beautifulsoup4 markdown \
    playwright fastmcp mcp json5

# --- Step 4: browsers de Playwright (solo Chromium) ----------------------------
log "Step 4 - browsers de Playwright (chromium)"
HAS_CHROMIUM=0
for d in "$HOME/.cache/ms-playwright/chromium-"*; do
    [ -d "$d" ] && HAS_CHROMIUM=1 && break
done
if [ $HAS_CHROMIUM -eq 0 ]; then
    "$PYVENV/bin/playwright" install chromium
else
    echo "  chromium ya descargado [skip]"
fi

# --- Step 5: node_modules aislado ----------------------------------------------
log "Step 5 - node_modules aislado en $NODE_AISLADO"
if [ ! -f "$NODE_AISLADO/package.json" ]; then
    (cd "$NODE_AISLADO" && npm init -y >/dev/null)
fi
(cd "$NODE_AISLADO" && npm install --silent --omit=dev --no-audit --no-fund \
    docx pptxgenjs @modelcontextprotocol/sdk)

# --- Step 6: generar skills-env.sh ---------------------------------------------
log "Step 6 - generar $SKILLS_ENV_FILE"
cat >"$SKILLS_ENV_FILE" <<'ENV'
# Generated by opencode-dotfiles skills.sh -- do not edit manually.
# Se cargan los paths aislados de Python y Node de los skills.
# Solo aplican al proceso que sourcee este archivo (el TUI de opencode,
# o el opencode-serve via systemd). No contamina shells del usuario.

export VIRTUAL_ENV="$HOME/.venvs/opencode-skills"
export PATH="$VIRTUAL_ENV/bin:$PATH"
# NODE_PATH actua como FALLBACK: Node busca primero en ./node_modules.
# Se appendea para no pisar otros NODE_PATH preexistentes.
export NODE_PATH="${NODE_PATH:+$NODE_PATH:}$HOME/.opencode-skills/node/node_modules"
# Habilita la herramienta websearch (Exa). NO necesita API key:
# la doc oficial dice "the tool connects directly to Exa AI's hosted MCP
# service without authentication" (https://opencode.ai/docs/tools).
export OPENCODE_ENABLE_EXA=1
ENV
chmod 0644 "$SKILLS_ENV_FILE"

# --- Step 7: hook al shell -----------------------------------------------------
log "Step 7 - hook al shell del usuario"
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

# --- Step 8: merge del opencode.jsonc global -----------------------------------
log "Step 8 - merge de $OPENCODE_CFG_DIR/opencode.jsonc"
CFG_FILE="$OPENCODE_CFG_DIR/opencode.jsonc"
TMPL="$CONFIG_DIR/opencode.jsonc.tmpl"
TMP_OUT="$(mktemp --tmpdir opencode.jsonc.XXXXXX)"
trap 'rm -f "$TMP_OUT"' EXIT

if [ -f "$CFG_FILE" ]; then
    BAK="$CFG_FILE.bak-$(date +%Y%m%d-%H%M%S)"
    cp -f "$CFG_FILE" "$BAK"
    echo "  backup: $BAK"
fi
# Ejecutar el merger usando el python del venv (donde json5 esta instalado).
if ! "$PYVENV/bin/python" "$CONFIG_DIR/skills-merge-jsonc.py" \
        "${CFG_FILE:-/dev/null}" "$TMPL" >"$TMP_OUT"; then
    die "fallo el merge del opencode.jsonc; revisa $CFG_FILE manualmente. Backup en $BAK"
fi
# Validar resultado
if ! "$PYVENV/bin/python" -c "import json,sys; json.load(open(sys.argv[1]))" "$TMP_OUT"; then
    die "merge produjo JSON invalido; abortando. Backup intacto en $BAK"
fi
mv -f "$TMP_OUT" "$CFG_FILE"
chmod 0600 "$CFG_FILE"
echo "  $CFG_FILE actualizado"

# --- Step 9: AGENTS.md global --------------------------------------------------
log "Step 9 - AGENTS.md global"
AGENTS_FILE="$OPENCODE_CFG_DIR/AGENTS.md"
AGENTS_TMPL="$CONFIG_DIR/AGENTS.md.tmpl"
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

# --- Step 10: re-copiar opencode-serve.sh al DEST (con source del env) ---------
log "Step 10 - actualizar opencode-serve.sh en $DEST"
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

# --- Step 11: smoke test -------------------------------------------------------
log "Step 11 - smoke test"
bash "$CONFIG_DIR/skills-smoke-test.sh" || warn "el smoke test reporto fallos; revisalos"

echo ""
echo "============================================================"
echo " Skills + configuracion global instaladas."
echo "   Skills:        $SKILL_DIR  (${#SKILLS[@]} skills)"
echo "   venv Python:   $PYVENV"
echo "   node aislado:  $NODE_AISLADO"
echo "   Config:        $OPENCODE_CFG_DIR/opencode.jsonc"
echo "   Reglas:        $OPENCODE_CFG_DIR/AGENTS.md"
echo "   Env file:      $SKILLS_ENV_FILE"
echo ""
echo " Abre una terminal NUEVA (para cargar el hook del shell) y lanza:"
echo "   opencode"
echo ""
echo " Tokens opcionales (exportalos en tu shell rc si los quieres):"
echo "   CONTEXT7_API_KEY   - mayor rate-limit en docs (https://context7.com)"
echo "   GITHUB_TOKEN       - GitHub MCP (descomenta tambien el bloque en"
echo "                        $CFG_FILE)"
echo " EXA (web search) ya esta activado: OPENCODE_ENABLE_EXA=1 funciona sin key."
echo "============================================================"
