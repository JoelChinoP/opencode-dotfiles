#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
live=false
case "${1:-}" in
  '') [[ $# == 0 ]] || exit 2 ;;
  --live) [[ $# == 1 ]] || exit 2; live=true ;;
  --config-dir) [[ $# == 2 ]] || exit 2; config_dir=$2 ;;
  *) echo 'Uso: bash arch/verify.sh [--live | --config-dir DIR]' >&2; exit 2 ;;
esac
for script in "$root"/arch/*.sh; do bash -n "$script"; done
node --check "$config_dir/plugins/engram/index.js"
python -I - "$config_dir" <<'PY'
import hashlib, json, os, pathlib, shutil, subprocess, sys
root = pathlib.Path(sys.argv[1])
config = json.loads((root / "opencode.jsonc").read_text())
servers = config["mcp"]["servers"]
assert set(servers) == {"context7", "engram", "codegraph"}
assert not servers["context7"].get("disabled")
assert not servers["engram"].get("disabled")
assert servers["codegraph"] == {"type": "local", "command": ["codegraph", "serve", "--mcp"], "disabled": True}
assert "agent" not in config
assert config["default_agent"] == "build"
assert config["tool_output"]["max_bytes"] == 32768
expected_skill_source = pathlib.Path(os.environ.get("XDG_CONFIG_HOME", pathlib.Path.home() / ".config")) / "opencode/skills"
assert config["skills"] == [str(expected_skill_source)]
rules = config["permissions"]
for action, resource, effect in (
    ("shell", "*", "ask"), ("shell", "sudo *", "deny"),
    ("subagent", "*", "ask"), ("read", "node_modules/*", "ask"),
    ("read", "*/node_modules/*", "ask"),
    ("engram_mem_save_prompt", "*", "deny"), ("engram_mem_capture_passive", "*", "deny"),
):
    assert {"action": action, "resource": resource, "effect": effect} in rules
expected_skills = {"document-files", "presentation-slides", "diagram-design", "frontend-design", "modern-web-guidance", "playwright-cli", "skill-governance"}
for skill_id in (*expected_skills, "opencode", "report", "ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help"):
    assert {"action": "skill", "resource": skill_id, "effect": "allow"} in rules
assert {"action": "skill", "resource": "*", "effect": "deny"} in rules
assert "./plugins/engram" in config["plugins"]
assert "@dietrichgebert/ponytail@5.3.3" in config["plugins"]
assert not (root / "plugins/ponytail").exists(), "Retira el adaptador antiguo para evitar dos Ponytail"
assert (root / ".ponytail-active").read_text().strip() in {"lite", "full", "ultra", "off"}
plugin = root / "plugins/engram"
manifest = json.loads((plugin / "package.json").read_text())
assert (plugin / manifest.get("exports", {}).get(".", "./index.js")).is_file()
cli = json.loads((root / "cli.json").read_text())
assert cli["session"]["permissions"] == "prompt"
turn_tokens = cli.get("debug", {}).get("turn_tokens", False)
assert isinstance(turn_tokens, bool) or turn_tokens == "verbose", "debug.turn_tokens debe ser boolean o verbose"
assert json.loads((root / "service.json").read_text())["hostname"] == "127.0.0.1"
for entry in ("./plugins/subagent-statusline.v2", "./plugins/open-editor", "./plugins/image-preview"):
    assert entry in cli["plugins"], entry
    plugin = root / entry
    tui = json.loads((plugin / "package.json").read_text())["exports"]["./tui"]
    assert (plugin / tui).is_file(), entry

skills = root / "skills"
assert {path.name for path in skills.iterdir() if path.is_dir()} == expected_skills
assert not any(path.is_symlink() for path in skills.rglob("*")), "Las skills administradas no admiten symlinks"
lock = json.loads((root / "skills-lock.json").read_text())
assert lock["version"] == 1
entries = {entry["id"]: entry for entry in lock["skills"]}
assert set(entries) == expected_skills
def tree_sha256(directory):
    digest = hashlib.sha256()
    for path in sorted(path for path in directory.rglob("*") if path.is_file()):
        digest.update(path.relative_to(directory).as_posix().encode() + b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()
for skill_id in expected_skills:
    text = (skills / skill_id / "SKILL.md").read_text()
    assert text.startswith("---\n") and "\ndescription:" in text.split("\n---\n", 1)[0], skill_id
    assert tree_sha256(skills / skill_id) == entries[skill_id]["content_sha256"], skill_id
assert "opencode/autoinvoke: false" in (skills / "skill-governance/SKILL.md").read_text()
assert entries["skill-governance"]["autoinvoke"] is False
assert (skills / "document-files/references/pdf.md").is_file()
assert (skills / "document-files/references/docx.md").is_file()
assert entries["document-files"]["runtime"]["type"] == "system"
for skill_id in ("document-files", "presentation-slides", "diagram-design"):
    for command in entries[skill_id]["runtime"]["required_commands"]:
        if command != "slides-node":  # Se verifica por ruta absoluta, incluso antes de abrir una shell nueva.
            assert shutil.which(command), f"Falta dependencia de {skill_id}: {command}"
for font in entries["document-files"]["runtime"]["required_fonts"]:
    assert subprocess.check_output(["fc-match", "-f", "%{family}", font], text=True) == font, f"Falta fuente: {font}"
assert (skills / "document-files/scripts/check_office.py").is_file()
assert (skills / "document-files/scripts/render.sh").is_file()

frontend = entries["frontend-design"]
assert frontend["source"]["commit"] == "34040c9c568585f6929bedeaad110ad08f079624"
assert frontend["license"] == "Apache-2.0"
assert (skills / "frontend-design/LICENSE.txt").is_file()
assert frontend["source"]["commit"] in (skills / "frontend-design/UPSTREAM.md").read_text()

playwright = entries["playwright-cli"]
assert playwright["source"]["commit"] == "74354ecc7a43da16d91a9bc54fa8db8283a3fcf5"
assert playwright["runtime"]["version"] == "0.1.21"
assert playwright["runtime"]["integrity"] == "sha512-FfxmVJj2wJlsxPksUO+4N7gqimPEQPajpocl2Mk97ENIGfAVZ4aElzPb5sDdGXHI9J/3Y8EtUiUTas0VsTm/sg=="
assert playwright["license"] == "Apache-2.0"
assert (skills / "playwright-cli/LICENSE").is_file()
assert len(list((skills / "playwright-cli/references").glob("*.md"))) == 10
playwright_text = (skills / "playwright-cli/SKILL.md").read_text()
assert "npm install -g" not in playwright_text and "allowed-tools:" not in playwright_text
assert playwright["source"]["commit"] in (skills / "playwright-cli/UPSTREAM.md").read_text()
data_home = pathlib.Path(os.environ.get("XDG_DATA_HOME", pathlib.Path.home() / ".local/share"))
web = entries["modern-web-guidance"]
assert web["source"]["commit"] in (skills / "modern-web-guidance/UPSTREAM.md").read_text()
for filename in web["files"]:
    assert (skills / "modern-web-guidance" / filename).is_file(), filename
web_cli = data_home / "opencode-dotfiles-v2/bin/modern-web-guidance"
def web_run(*args):
    return subprocess.check_output([web_cli, *args], text=True, timeout=30)
assert web_run("--version").strip() == web["runtime"]["version"]
assert "light-dismiss-a-dialog" in {result["id"] for result in json.loads(web_run("search", "light dismiss dialog"))}
assert "closedby" in web_run("retrieve", "light-dismiss-a-dialog")
playwright_wrapper = data_home / "opencode-dotfiles-v2/bin/playwright-cli"
assert playwright_wrapper.is_file() and os.access(playwright_wrapper, os.X_OK)
playwright_version = subprocess.check_output([playwright_wrapper, "--version"], text=True, timeout=30).strip()
assert "0.1.21" in playwright_version, playwright_version
slides_wrapper = data_home / "opencode-dotfiles-v2/bin/slides-node"
assert slides_wrapper.is_file() and os.access(slides_wrapper, os.X_OK)
slides_version = subprocess.check_output([slides_wrapper, "-p", 'new (require("pptxgenjs"))().version'], text=True, timeout=30).strip()
assert slides_version == entries["presentation-slides"]["runtime"]["version"], slides_version

binary = servers["engram"]["command"][0]
version = subprocess.check_output([binary, "version"], text=True, timeout=15).strip()
assert version == "engram 3.6.1", version
print(f"OK: configuración V2, {len(expected_skills)} skills fijadas, consulta web local, runtime PPTX, fuentes, Graphviz, Playwright CLI, Ponytail 5.3.3 y Engram 3.6.1.")
PY
if $live; then
  opencode service status
  python -I - <<'PY'
import json, subprocess, time
def api(path):
    result = json.loads(subprocess.check_output(["opencode", "api", "get", path], text=True, timeout=60))
    return result.get("data", result) if isinstance(result, dict) else result
info = api("/api/info")
print("OpenCode", info["version"])
managed_skills = {"document-files", "presentation-slides", "diagram-design", "frontend-design", "modern-web-guidance", "playwright-cli", "skill-governance"}
for attempt in range(30):
    plugins = {p.get("id", str(p["source"])): p["state"]["status"] for p in api("/api/plugin")}
    failed = [name for name, status in plugins.items() if status == "failed"]
    if failed:
        raise SystemExit("Plugins fallidos: " + ", ".join(failed))
    servers = {s["name"]: s["status"]["status"] for s in api("/api/mcp")}
    skills = {s["id"]: s for s in api("/api/skill")}
    ready = plugins.get("engram") == "active" and plugins.get("ponytail") == "active"
    ready = ready and servers == {"context7": "connected", "engram": "connected", "codegraph": "disabled"}
    ready = ready and managed_skills <= set(skills)
    ready = ready and skills.get("modern-web-guidance", {}).get("autoinvoke", True) is True
    ready = ready and {"ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help"} <= set(skills)
    ready = ready and skills.get("skill-governance", {}).get("autoinvoke") is False
    if ready:
        break
    time.sleep(0.5)
print("Plugins servidor:", {name: plugins.get(name) for name in ("engram", "ponytail")})
print("MCP:", servers)
print("Skills administradas:", sorted(set(skills) & managed_skills))
if not ready:
    raise SystemExit("Integración pendiente. Revisa opencode mcp list; autentica Context7 en /mcps si lo solicita.")
print("OK: plugins Engram y Ponytail activos y conexiones MCP. Abre la TUI para ver la statusline.")
PY
fi
