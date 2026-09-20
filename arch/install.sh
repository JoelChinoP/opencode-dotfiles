#!/usr/bin/env bash
set -euo pipefail
umask 077

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
start=true
case "${1:-}" in
  --no-start) start=false ;;
  '') ;;
  *) printf 'Uso: bash arch/install.sh [--no-start]\n' >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || exit 2
[[ $EUID -ne 0 ]] || { echo 'Ejecuta como usuario, sin sudo.' >&2; exit 1; }
[[ -f /etc/arch-release ]] || { echo 'Este instalador es para Arch Linux.' >&2; exit 1; }

missing=()
for command in opencode python node npm curl tar sha256sum git rg pandoc libreoffice pdfinfo pdftotext pdftoppm chromium; do
  command -v "$command" >/dev/null || missing+=("$command")
done
if ((${#missing[@]})); then
  printf 'Faltan comandos: %s\n' "${missing[*]}" >&2
  echo 'Ejecuta: sudo pacman -Syu --needed opencode python nodejs npm curl tar coreutils git ripgrep pandoc libreoffice-still poppler chromium' >&2
  exit 1
fi
[[ $(opencode --version) == 'opencode v2.'* ]] || { echo 'Se requiere OpenCode V2.' >&2; exit 1; }
node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ $node_major =~ ^[0-9]+$ && $node_major -ge 20 ]] || { echo 'Playwright CLI requiere Node.js 20 o posterior.' >&2; exit 1; }

config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
config_dir="$config_home/opencode"
install_dir="$data_home/opencode-dotfiles-v2"
[[ $config_home == /* && $data_home == /* ]] || { echo 'Las rutas XDG deben ser absolutas.' >&2; exit 1; }
mkdir -p "$config_home" "$install_dir/bin" "$install_dir/backups" "$install_dir/tools"
work="$(mktemp -d "$config_home/.opencode-v2.XXXXXXXX")"
stage="$work/opencode"
mkdir "$stage"
tool_work=''
cleanup() {
  if [[ -e $work/previous || -L $work/previous ]] && [[ ! -e $config_dir && ! -L $config_dir ]]; then
    mv -- "$work/previous" "$config_dir" || { echo "Recupera el perfil de $work/previous" >&2; return 1; }
  fi
  if [[ -n $tool_work && -d $tool_work ]]; then rm -rf -- "$tool_work"; fi
  rm -rf -- "$work"
}
trap cleanup EXIT

# Versión estable fijada: actualizar versión y checksums juntos tras verificar.
case "$(uname -m)" in
  x86_64) arch=amd64; checksum=23be1c2ce9739c455097ff864736213717b925b3e8821a988dfc619685a5abd5 ;;
  aarch64) arch=arm64; checksum=a942e73ab424faaa6e2785d1563e0d9d7f20739944dae0c50071223301d44333 ;;
  *) echo 'Arquitectura sin binario Engram verificado.' >&2; exit 1 ;;
esac
engram="$install_dir/bin/engram-2.0.0"
if [[ ! -x $engram ]]; then
  archive="engram_2.0.0_linux_${arch}.tar.gz"
  curl --fail --location --silent --show-error --retry 2 --connect-timeout 15 --max-time 180 \
    "https://github.com/Gentleman-Programming/engram/releases/download/v2.0.0/$archive" -o "$stage/$archive"
  printf '%s  %s\n' "$checksum" "$stage/$archive" | sha256sum --check --status
  tar -xzf "$stage/$archive" -C "$stage" engram
  install -m 755 "$stage/engram" "$engram"
  rm -- "$stage/$archive" "$stage/engram"
fi

[[ $("$engram" version) == 'engram 2.0.0' ]] || { echo 'Binario Engram inválido.' >&2; exit 1; }

# Playwright CLI queda aislado del prefijo npm global. El lockfile fija también
# playwright/playwright-core y --ignore-scripts evita hooks de instalación.
playwright_version=0.1.21
playwright_dir="$install_dir/tools/playwright-cli-$playwright_version"
playwright_entry="$playwright_dir/node_modules/@playwright/cli/playwright-cli.js"
validate_playwright_runtime() {
  node - "$1" "$2" <<'JS'
const [root, expected] = process.argv.slice(2);
for (const [name, version] of [
  ["@playwright/cli", expected],
  ["playwright", "1.64.0-alpha-1789764292000"],
  ["playwright-core", "1.64.0-alpha-1789764292000"],
]) {
  const actual = require(`${root}/node_modules/${name}/package.json`).version;
  if (actual !== version) throw new Error(`${name}: ${actual}, esperado ${version}`);
}
JS
}
playwright_valid=false
if [[ -f $playwright_entry ]] && validate_playwright_runtime "$playwright_dir" "$playwright_version" >/dev/null 2>&1; then
  playwright_valid=true
fi
if ! $playwright_valid; then
  tool_work="$(mktemp -d "$install_dir/.playwright-cli.XXXXXXXX")"
  cp "$root/templates/tools/playwright-cli/package.json" "$root/templates/tools/playwright-cli/package-lock.json" "$tool_work/"
  npm ci --prefix "$tool_work" --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
  validate_playwright_runtime "$tool_work" "$playwright_version"
  if [[ -e $playwright_dir || -L $playwright_dir ]]; then
    invalid="$install_dir/backups/playwright-cli-$playwright_version.invalid.$(date +%s).$$"
    mv -- "$playwright_dir" "$invalid"
    printf 'Runtime Playwright anterior apartado en %s\n' "$invalid" >&2
  fi
  mv -- "$tool_work" "$playwright_dir"
  tool_work=''
fi

wrapper="$work/playwright-cli"
cat >"$wrapper" <<EOF
#!/bin/sh
set -eu
export NO_UPDATE_NOTIFIER=1
base="\$(CDPATH= cd -- "\$(dirname -- "\$0")/.." && pwd)"
if [ -z "\${PLAYWRIGHT_MCP_EXECUTABLE_PATH:-}" ]; then
  PLAYWRIGHT_MCP_EXECUTABLE_PATH="\$(command -v chromium)"
  export PLAYWRIGHT_MCP_EXECUTABLE_PATH
fi
exec node "\$base/tools/playwright-cli-$playwright_version/node_modules/@playwright/cli/playwright-cli.js" "\$@"
EOF
install -m 755 "$wrapper" "$install_dir/bin/playwright-cli"
export PATH="$install_dir/bin:$PATH"
[[ $(playwright-cli --version) == *"$playwright_version"* ]] || { echo 'Playwright CLI inválido.' >&2; exit 1; }

cp "$root/templates/opencode.jsonc" "$root/templates/cli.json" "$root/templates/AGENTS.md" "$root/templates/skills-lock.json" "$stage/"
cp -R "$root/templates/plugins" "$root/templates/skills" "$stage/"
# La conexión al servicio pertenece al runtime, no al perfil de agentes.
if [[ -f $config_dir/service.json ]]; then cp "$config_dir/service.json" "$stage/"; fi
python -I - "$stage" "$engram" "$config_dir" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
path = root / "opencode.jsonc"
config = json.loads(path.read_text())
config["mcp"]["servers"]["engram"]["command"][0] = sys.argv[2]
config["skills"] = [str(pathlib.Path(sys.argv[3]) / "skills")]
path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")
# Solo se edita el staging; formato generado por service set hostname en V2.
path = root / "service.json"
service = json.loads(path.read_text()) if path.exists() else {}
service["hostname"] = "127.0.0.1"
path.write_text(json.dumps(service, indent=2) + "\n")
PY

# Fallar antes de respaldar/mover el perfil o modificar los archivos de shell.
bash "$root/arch/verify.sh" --config-dir "$stage"
node "$root/arch/check.mjs"

# Respaldo SQLite coherente incluso si la base usa WAL; no copiar solo engram.db.
backup="$(mktemp -d "$install_dir/backups/install.XXXXXXXX")"
python -I - "${ENGRAM_DATA_DIR:-$HOME/.engram}/engram.db" "$backup/engram.db" <<'PY'
import pathlib, sqlite3, sys
source = pathlib.Path(sys.argv[1])
if source.is_file():
    with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as db:
        with sqlite3.connect(sys.argv[2]) as backup:
            db.backup(backup)
PY
if [[ -e $config_dir || -L $config_dir ]]; then
  # Seguir solo el enlace raíz; un respaldo no debe depender de su ubicación.
  cp -a -- "$config_dir/." "$backup/opencode"
  mv -- "$config_dir" "$work/previous"
fi
if ! mv -- "$stage" "$config_dir"; then
  exit 1
fi
cleanup
trap - EXIT
printf 'Perfil instalado en %s\nRespaldo: %s\n' "$config_dir" "$backup"

# Ponytail: nivel inicial `lite` en el entorno de la shell. El plugin local ya
# usa lite por defecto; la variable también cubre a los agentes que la respetan.
export PONYTAIL_DEFAULT_MODE=lite
case "$(basename -- "${SHELL:-}")" in
  zsh) env_file="${ZDOTDIR:-$HOME}/.zshenv" ;;
  bash) env_file="$HOME/.bashrc" ;;
  *) env_file="$HOME/.profile" ;;
esac
if [[ -f $env_file ]]; then cp -L -- "$env_file" "$backup/ponytail-env"; fi
python -I - "$env_file" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text() if path.exists() else ""
line = "export PONYTAIL_DEFAULT_MODE=lite"
path_line = 'export PATH="${XDG_DATA_HOME:-$HOME/.local/share}/opencode-dotfiles-v2/bin:$PATH"'
# Solo sustituir asignaciones simples; conservar comandos/otras variables en la línea.
pattern = r'''^export PONYTAIL_DEFAULT_MODE=(?:\w+|'\w+'|"\w+")([ \t]*(?:#.*)?)$'''
if re.search(pattern, text, re.MULTILINE):
    updated = re.sub(pattern, lambda match: line + match[1], text, flags=re.MULTILINE)
else:
    updated = text + "\n# opencode-dotfiles-v2: nivel inicial de Ponytail\n" + line + "\n"
if path_line not in updated.splitlines():
    updated += "\n# opencode-dotfiles-v2: herramientas administradas\n" + path_line + "\n"
if updated != text:
    path.write_text(updated)
PY
printf 'Ponytail lite y herramientas administradas configurados en %s\n' "$env_file"

# Atajos interactivos al servicio compartido nativo.
rm -f -- "$install_dir/bin/oc-status"
case "$(basename -- "${SHELL:-}")" in
  zsh) aliases_file="${ZDOTDIR:-$HOME}/.zshrc" ;;
  bash) aliases_file="$HOME/.bashrc" ;;
  *) aliases_file='' ;;
esac
if [[ -n $aliases_file ]]; then
  if [[ -f $aliases_file ]]; then cp -L -- "$aliases_file" "$backup/shellrc"; fi
  python -I - "$aliases_file" <<'PY'
import pathlib, shlex, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text() if path.exists() else ""
lines = []
for line in text.splitlines(keepends=True):
    try:
        words = shlex.split(line, comments=True)
    except ValueError:
        words = []
    if len(words) == 2 and words[0] == "alias" and words[1].split("=", 1)[0] in ("oc-attach", "oc-status"):
        continue
    lines.append(line)
updated = "".join(lines)
for definition in ("alias oc='command opencode'", "alias oc-last='command opencode --continue'"):
    if definition not in updated.splitlines():
        updated += "\n" + definition + "\n"
if updated != text:
    path.write_text(updated)
PY
  printf 'Atajos oc y oc-last instalados en %s; abre una terminal nueva.\n' "$aliases_file"
else
  echo 'Atajos automáticos disponibles para Bash/Zsh. En tu shell: oc → opencode; oc-last → opencode --continue.'
fi

if $start; then
  if ! timeout --kill-after=5s 60s opencode service restart; then
    echo 'Perfil desplegado; el servicio no arrancó. Revisa opencode service status y el log del servidor.' >&2
    exit 1
  fi
  bash "$root/arch/verify.sh" --live
else
  echo 'Para activar: opencode service restart; después bash arch/verify.sh --live'
fi
