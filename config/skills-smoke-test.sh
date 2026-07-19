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
ORCHESTRATOR_PKG="$HOME/.cache/opencode/packages/opencode-orchestrator@1.7.8/node_modules/opencode-orchestrator/package.json"

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
    if [ "$COUNT" -ge 7 ]; then
        ok "$COUNT skills"
    else
        miss "skills count" "esperado >=7, hay $COUNT"
    fi
    for s in claude-api doc-coauthoring docx frontend-design pdf skill-creator webapp-testing; do
        [ -f "$SKILLDIR/$s/SKILL.md" ] && ok "skill: $s" || miss "skill: $s" "SKILL.md ausente"
    done
    for s in algorithmic-art brand-guidelines canvas-design internal-comms mcp-builder \
             pptx slack-gif-creator theme-factory web-artifacts-builder xlsx; do
        [ ! -d "$SKILLDIR/$s" ] && ok "skill retirado: $s" || miss "skill: $s" "deberia estar retirado"
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
    "$PYBIN" - "$CFG" <<'PY' 2>/dev/null \
        && ok "MCP playwright deshabilitado" \
        || miss "MCP playwright" "debe tener enabled=false"
import json5, pathlib, sys
cfg = json5.loads(pathlib.Path(sys.argv[1]).read_text())
raise SystemExit(0 if cfg.get("mcp", {}).get("playwright", {}).get("enabled") is False else 1)
PY
    if grep -q '@dietrichgebert/ponytail' "$CFG"; then
        miss "Ponytail opt-in" "sigue presente en la config global"
    else
        ok "Ponytail opt-in"
    fi
    "$PYBIN" - "$CFG" <<'PY' 2>/dev/null \
        && ok "Exa/websearch habilitado" \
        || miss "Exa/websearch" "debe tener permission.websearch=allow"
import json5, pathlib, sys
cfg = json5.loads(pathlib.Path(sys.argv[1]).read_text())
raise SystemExit(0 if cfg.get("permission", {}).get("websearch") == "allow" else 1)
PY
    "$PYBIN" - "$CFG" <<'PY' 2>/dev/null \
        && ok "Orchestrator 1.7.8 y perfiles por rol" \
        || miss "OpenCode Orchestrator" "plugin, concurrencia o perfiles no coinciden"
import json5, pathlib, sys
cfg = json5.loads(pathlib.Path(sys.argv[1]).read_text())

expected_agents = {
    "Commander": ("openai/gpt-5.6-sol", "high"),
    "Planner": ("openai/gpt-5.6-terra", "high"),
    "Worker": ("openai/gpt-5.6-terra", "medium"),
    "Reviewer": ("openai/gpt-5.6-sol", "xhigh"),
}
for name, (model, effort) in expected_agents.items():
    agent = cfg.get("agent", {}).get(name, {})
    assert agent.get("model") == model
    assert agent.get("reasoningEffort") == effort
assert not ({"commander", "planner", "worker", "reviewer"} & set(cfg.get("agent", {})))

entry = next(
    item for item in cfg.get("plugin", [])
    if isinstance(item, list) and item and item[0] == "opencode-orchestrator@1.7.8"
)
options = entry[1]
assert options["agentConcurrency"] == {
    "commander": 1, "planner": 1, "worker": 4, "reviewer": 1
}
assert options["missionLoop"] == {
    "ledger": True, "markdownMemory": True, "maxEvidenceEvents": 20
}
assert cfg.get("permission", {}).get("question") == "allow"
PY
    grep -q '"permission"' "$CFG" && ok "bloque permission" || miss "permission" "no presente"
else
    miss "opencode.jsonc" "$CFG no existe"
fi

if [ -f "$ORCHESTRATOR_PKG" ]; then
    ORCHESTRATOR_VERSION=$(node -p "require('$ORCHESTRATOR_PKG').version" 2>/dev/null || true)
    [ "$ORCHESTRATOR_VERSION" = "1.7.8" ] \
        && ok "paquete Orchestrator 1.7.8 en cache" \
        || miss "paquete Orchestrator" "version inesperada: ${ORCHESTRATOR_VERSION:-?}"
else
    miss "paquete Orchestrator" "aun no descargado; reinicia OpenCode"
fi

if [ -f "$HOME/.config/opencode/AGENTS.md" ]; then
    ok "AGENTS.md global"
else
    miss "AGENTS.md global" "$HOME/.config/opencode/AGENTS.md no existe"
fi

if [ -f "$HOME/.config/opencode/skills-env.sh" ]; then
    ok "skills-env.sh"
    grep -q '^export OPENCODE_ENABLE_EXA=1$' "$HOME/.config/opencode/skills-env.sh" \
        && ok "OPENCODE_ENABLE_EXA=1" || miss "Exa env" "flag ausente"
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
