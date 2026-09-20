#!/usr/bin/env bash
# Verificacion minima del setup de skills y configuracion global.

PASS=0
FAIL=0
ok()   { printf '  OK    %s\n' "$1"; PASS=$((PASS+1)); }
miss() { printf '  MISS  %s  (%s)\n' "$1" "$2"; FAIL=$((FAIL+1)); }

PYBIN="$HOME/.venvs/opencode-skills/bin/python"
NODEDIR="$HOME/.opencode-skills/node/node_modules"
CFG="$HOME/.config/opencode/opencode.json"
SKILLDIR="$HOME/.config/opencode/skills"
ENGRAM="$HOME/.local/bin/engram"
if [ -f "$HOME/.config/opencode-dotfiles/defaults.env" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.config/opencode-dotfiles/defaults.env"
fi
if [ -f "$HOME/.config/opencode-dotfiles/dotfiles.env" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.config/opencode-dotfiles/dotfiles.env"
fi
: "${OPENCODE_SERVE_PORT:=4096}"

echo "==> Runtimes y dependencias"
if [ -x "$PYBIN" ]; then
    "$PYBIN" - <<'PY' 2>/dev/null \
        && ok "imports Python" || miss "imports Python" "alguna dependencia no carga"
import docx, pandas, pypdf, pdfplumber, reportlab
import pytesseract, pdf2image, PIL, playwright
PY
else
    miss "python venv" "$PYBIN no existe"
fi

if [ -d "$NODEDIR" ]; then
    NODE_PATH="$NODEDIR" node -e "require('docx')" 2>/dev/null \
        && ok "docx para Node" || miss "docx para Node" "no resuelve"
    [ -f "$NODEDIR/@playwright/mcp/cli.js" ] \
        && ok "Playwright MCP" || miss "Playwright MCP" "cli.js ausente"
else
    miss "node_modules aislado" "$NODEDIR no existe"
fi

if [ -x "$ENGRAM" ] && ENGRAM_VERSION=$($ENGRAM --version 2>/dev/null); then
    ok "$ENGRAM_VERSION"
else
    miss "Engram" "$ENGRAM no existe o no arranca"
fi

for bin in libreoffice pdftoppm pdftotext qpdf tesseract pandoc gs convert ffmpeg go; do
    command -v "$bin" >/dev/null 2>&1 \
        && ok "$bin" || miss "$bin" "no instalado"
done

echo ""
echo "==> Skills"
for skill in claude-api doc-coauthoring docx frontend-design pdf skill-creator webapp-testing; do
    [ -f "$SKILLDIR/$skill/SKILL.md" ] \
        && ok "$skill" || miss "$skill" "SKILL.md ausente"
done

echo ""
echo "==> Configuracion"
if [ -f "$CFG" ]; then
    python3 - "$CFG" "$OPENCODE_SERVE_PORT" <<'PY' 2>/dev/null \
        && ok "opencode.json reconciliado" \
        || miss "opencode.json" "invalido o incompleto"
import json, pathlib, sys

cfg = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert cfg["default_agent"] == "build"
assert cfg["server"] == {"hostname": "127.0.0.1", "port": int(sys.argv[2])}
assert cfg["mcp"]["engram"]["command"] == ["{env:HOME}/.local/bin/engram", "mcp", "--tools=agent"]
assert cfg["mcp"]["context7"]["enabled"] is True
assert cfg["mcp"]["codegraph"]["enabled"] is False
assert cfg["mcp"]["playwright"]["enabled"] is False
assert cfg["permission"]["question"] == "allow"
assert cfg["permission"]["websearch"] == "allow"
rules = list(cfg["permission"]["bash"])
assert rules.index("*") < rules.index("sudo") < rules.index("ls")
assert "@dietrichgebert/ponytail@4.8.4" in cfg["plugin"]
assert not any(token in name.lower() for name in cfg.get("provider", {}) for token in ("kimi", "modal", "mdal"))
PY
else
    miss "opencode.json" "$CFG no existe"
fi

[ ! -f "$HOME/.config/opencode/opencode.jsonc" ] \
    && ok "sin JSONC duplicado" || miss "opencode.jsonc" "debe reemplazarse por opencode.json"
[ -f "$HOME/.config/opencode/plugins/engram.ts" ] \
    && ok "plugin Engram" || miss "plugin Engram" "ejecuta engram setup opencode"
grep -qs 'opencode-subagent-statusline' \
    "$HOME/.config/opencode/tui.json" "$HOME/.config/opencode/tui.jsonc" \
    && ok "statusline Engram" || miss "statusline Engram" "tui.json no configurado"

PONYTAIL_CFG="$HOME/.config/ponytail/config.json"
if [ -f "$PONYTAIL_CFG" ]; then
    python3 - "$PONYTAIL_CFG" <<'PY' 2>/dev/null \
        && ok "Ponytail defaultMode=off" || miss "Ponytail" "defaultMode debe ser off"
import json, pathlib, sys
assert json.loads(pathlib.Path(sys.argv[1]).read_text()).get("defaultMode") == "off"
PY
else
    miss "Ponytail" "$PONYTAIL_CFG no existe"
fi

[ -f "$HOME/.config/opencode/AGENTS.md" ] \
    && ok "AGENTS.md global" || miss "AGENTS.md" "ausente"
if [ -f "$HOME/.config/opencode/skills-env.sh" ]; then
    grep -q 'HOME/.local/bin' "$HOME/.config/opencode/skills-env.sh" \
        && ok "PATH de Engram" || miss "PATH de Engram" "~/.local/bin ausente"
else
    miss "skills-env.sh" "ausente"
fi

echo ""
echo "==> Shell y servicio"
grep -q "opencode-dotfiles skills env" "$HOME/.zshrc" 2>/dev/null \
    && ok "hook .zshrc" || miss "hook .zshrc" "no encontrado"
if [ -f "$HOME/.bashrc" ]; then
    grep -q "opencode-dotfiles skills env" "$HOME/.bashrc" 2>/dev/null \
        && ok "hook .bashrc" || miss "hook .bashrc" "no encontrado"
fi

systemctl is-active opencode-serve >/dev/null 2>&1 \
    && ok "opencode-serve activo" || miss "opencode-serve" "inactivo"
HEALTH_URL="http://127.0.0.1:${OPENCODE_SERVE_PORT}/global/health"
HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || true)
if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ || "$HTTP_CODE" = 401 ]]; then
    ok "API local responde"
else
    miss "API local" "no responde en :${OPENCODE_SERVE_PORT}"
fi

echo ""
printf 'Resumen: %d OK / %d MISS\n' "$PASS" "$FAIL"
exit "$FAIL"
