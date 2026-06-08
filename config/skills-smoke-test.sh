#!/usr/bin/env bash
# skills-smoke-test.sh - verificacion end-to-end del setup de skills.
# Imprime OK/MISS por componente. Exit code = numero de MISS.
# No usa set -e: queremos ver TODOS los fallos, no abortar al primero.

PASS=0
FAIL=0
ok()   { printf '  OK    %s\n' "$1"; PASS=$((PASS+1)); }
miss() { printf '  MISS  %s  (%s)\n' "$1" "$2"; FAIL=$((FAIL+1)); }

PYBIN="$HOME/.venvs/opencode-skills/bin/python"
NODEDIR="$HOME/.opencode-skills/node/node_modules"
CFG="$HOME/.config/opencode/opencode.jsonc"
SKILLDIR="$HOME/.config/opencode/skills"

echo "==> Imports de Python (venv ~/.venvs/opencode-skills)"
if [ ! -x "$PYBIN" ]; then
    miss "python venv" "$PYBIN no existe"
else
    "$PYBIN" - <<'PY' 2>/dev/null && ok "imports principales" || miss "imports principales" "alguna lib falta o no carga"
import docx, openpyxl, pandas
import pypdf, pdfplumber, reportlab, pytesseract, pdf2image
import markitdown, PIL, bs4, markdown
import playwright, fastmcp, mcp, json5
PY
fi

echo ""
echo "==> Requires de Node (NODE_PATH=~/.opencode-skills/node/node_modules)"
if [ ! -d "$NODEDIR" ]; then
    miss "node_modules aislado" "$NODEDIR no existe"
else
    NODE_PATH="$NODEDIR" node - <<'JS' 2>/dev/null && ok "requires docx/pptxgenjs/sdk" || miss "requires docx/pptxgenjs/sdk" "alguno no resuelve"
require('docx');
require('pptxgenjs');
require('@modelcontextprotocol/sdk/server/mcp.js');
JS
fi

echo ""
echo "==> Binarios del sistema"
for b in libreoffice pdftoppm pdftotext qpdf tesseract pandoc gs convert ffmpeg jq node python3; do
    if command -v "$b" >/dev/null 2>&1; then
        ok "$b -> $(command -v "$b")"
    else
        miss "$b" "no instalado"
    fi
done

echo ""
echo "==> Skills clonados (~/.config/opencode/skills/)"
if [ -d "$SKILLDIR" ]; then
    COUNT=$(find "$SKILLDIR" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
    if [ "$COUNT" -ge 17 ]; then
        ok "$COUNT skills"
    else
        miss "skills count" "esperado >=17, hay $COUNT"
    fi
    for s in algorithmic-art brand-guidelines canvas-design claude-api doc-coauthoring \
             docx frontend-design internal-comms mcp-builder pdf pptx skill-creator \
             slack-gif-creator theme-factory web-artifacts-builder webapp-testing xlsx; do
        [ -f "$SKILLDIR/$s/SKILL.md" ] && ok "skill: $s" || miss "skill: $s" "SKILL.md ausente"
    done
else
    miss "dir skills" "$SKILLDIR no existe"
fi

echo ""
echo "==> Config global"
if [ -f "$CFG" ]; then
    if [ -x "$PYBIN" ]; then
        "$PYBIN" -c "import json5, pathlib; json5.loads(pathlib.Path('$CFG').read_text())" 2>/dev/null \
            && ok "opencode.jsonc valido" || miss "opencode.jsonc" "no parsea como JSONC"
    fi
    grep -q '"context7"' "$CFG" && ok "MCP context7 registrado" || miss "MCP context7" "no presente"
    grep -q '"playwright"' "$CFG" && ok "MCP playwright registrado" || miss "MCP playwright" "no presente"
    grep -q '"permission"' "$CFG" && ok "bloque permission" || miss "permission" "no presente"
else
    miss "opencode.jsonc" "$CFG no existe"
fi

if [ -f "$HOME/.config/opencode/AGENTS.md" ]; then
    ok "AGENTS.md global"
else
    miss "AGENTS.md global" "$HOME/.config/opencode/AGENTS.md no existe"
fi

if [ -f "$HOME/.config/opencode/skills-env.sh" ]; then
    ok "skills-env.sh"
else
    miss "skills-env.sh" "no generado"
fi

echo ""
echo "==> Hook en shells"
grep -q "opencode-dotfiles skills env" "$HOME/.zshrc" 2>/dev/null \
    && ok "hook .zshrc" || miss "hook .zshrc" "no encontrado"
if [ -f "$HOME/.bashrc" ]; then
    grep -q "opencode-dotfiles skills env" "$HOME/.bashrc" 2>/dev/null \
        && ok "hook .bashrc" || miss "hook .bashrc" "no encontrado"
fi

echo ""
echo "==> opencode-serve y MCP alcanzable"
systemctl is-active opencode-serve >/dev/null 2>&1 \
    && ok "opencode-serve activo" || miss "opencode-serve" "inactivo"
curl -fsS http://127.0.0.1:4096/ -o /dev/null 2>/dev/null \
    && ok "API local responde" || miss "API local" "no responde en :4096"
curl -fsS -o /dev/null --max-time 5 https://mcp.context7.com/ping 2>/dev/null \
    && ok "context7 alcanzable" || miss "context7" "no responde (red?)"

echo ""
echo "============================================================"
printf ' Resumen: %d OK   /   %d MISS\n' "$PASS" "$FAIL"
echo "============================================================"
exit "$FAIL"
