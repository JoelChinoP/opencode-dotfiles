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
for command in opencode python node npm curl tar sha256sum git rg pandoc libreoffice pdfinfo pdftotext pdftoppm chromium dot fc-match timeout; do
  command -v "$command" >/dev/null || missing+=("$command")
done
if ((${#missing[@]})); then
  printf 'Faltan comandos: %s\n' "${missing[*]}" >&2
  echo 'Ejecuta: sudo pacman -Syu --needed opencode python nodejs npm curl tar coreutils git ripgrep pandoc libreoffice-still poppler chromium graphviz fontconfig noto-fonts' >&2
  exit 1
fi
[[ $(opencode --version) == 'opencode v2.'* ]] || { echo 'Se requiere OpenCode V2.' >&2; exit 1; }
node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ $node_major =~ ^[0-9]+$ && $node_major -ge 22 ]] || { echo 'Modern Web Guidance requiere Node.js 22 o posterior.' >&2; exit 1; }
for font in 'Noto Sans' 'Noto Serif'; do
  [[ $(fc-match -f '%{family}' "$font") == "$font" ]] || { echo "Falta $font: instala noto-fonts." >&2; exit 1; }
done

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
  x86_64) arch=amd64; checksum=b06d6436ce5c7f1e838b9ec454870e7ec9e5b3e0f89b6edc5e5d2e41fe13edcf ;;
  aarch64) arch=arm64; checksum=14fce398ebdaed8b11d6116f4c14795f77ed5d160e74de0ae3f9a77a01e390bc ;;
  *) echo 'Arquitectura sin binario Engram verificado.' >&2; exit 1 ;;
esac
engram="$install_dir/bin/engram-3.6.1"
if [[ ! -x $engram ]]; then
  archive="engram_3.6.1_linux_${arch}.tar.gz"
  curl --fail --location --silent --show-error --retry 2 --connect-timeout 15 --max-time 180 \
    "https://github.com/Gentleman-Programming/engram/releases/download/v3.6.1/$archive" -o "$stage/$archive"
  printf '%s  %s\n' "$checksum" "$stage/$archive" | sha256sum --check --status
  tar -xzf "$stage/$archive" -C "$stage" engram
  install -m 755 "$stage/engram" "$engram"
  rm -- "$stage/$archive" "$stage/engram"
fi

[[ $("$engram" version) == 'engram 3.6.1' ]] || { echo 'Binario Engram inválido.' >&2; exit 1; }

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

web_src="$root/templates/tools/modern-web-guidance"
web_dir="$install_dir/tools/modern-web-guidance-1.0.2"
if [[ ! -x $web_dir/node_modules/.bin/modern-web-guidance ]] || ! cmp -s "$web_src/package-lock.json" "$web_dir/package-lock.json"; then
  tool_work="$(mktemp -d "$install_dir/.modern-web-guidance.XXXXXXXX")"
  cp "$web_src/"package*.json "$tool_work/"
  npm ci --prefix "$tool_work" --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
  if [[ -e $web_dir || -L $web_dir ]]; then
    mv -- "$web_dir" "$install_dir/backups/modern-web-guidance.invalid.$(date +%s).$$"
  fi
  mv -- "$tool_work" "$web_dir"
  tool_work=''
fi
install -m 755 "$web_src/modern-web-guidance" "$install_dir/bin/modern-web-guidance"

# El hash del lock identifica el runtime completo, incluidas sus transitivas.
slides_lock="$(sha256sum "$root/templates/tools/presentations/package-lock.json")"
slides_lock="${slides_lock%% *}"
slides_dir="$install_dir/tools/presentations-$slides_lock"
if [[ ! -f $slides_dir/node_modules/pptxgenjs/package.json ]]; then
  tool_work="$(mktemp -d "$install_dir/.presentations.XXXXXXXX")"
  cp "$root/templates/tools/presentations/"package*.json "$tool_work/"
  npm ci --prefix "$tool_work" --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
  if [[ -e $slides_dir || -L $slides_dir ]]; then
    mv -- "$slides_dir" "$install_dir/backups/presentations.invalid.$(date +%s).$$"
  fi
  mv -- "$tool_work" "$slides_dir"
  tool_work=''
fi
node -e 'if (require(process.argv[1]).version !== "4.0.1") process.exit(1)' "$slides_dir/node_modules/pptxgenjs/package.json"
cat >"$work/slides-node" <<EOF
#!/bin/sh
set -eu
base="\$(CDPATH= cd -- "\$(dirname -- "\$0")/.." && pwd)"
NODE_PATH="\$base/tools/presentations-$slides_lock/node_modules"
export NODE_PATH
exec node "\$@"
EOF
install -m 755 "$work/slides-node" "$install_dir/bin/slides-node"
[[ $(slides-node -p 'new (require("pptxgenjs"))().version') == '4.0.1' ]] || { echo 'Runtime de presentaciones inválido.' >&2; exit 1; }

cp "$root/templates/opencode.jsonc" "$root/templates/cli.json" "$root/templates/AGENTS.md" "$root/templates/skills-lock.json" "$stage/"
cp -R "$root/templates/plugins" "$root/templates/skills" "$stage/"
printf 'lite\n' > "$stage/.ponytail-active"
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
python -I - "$config_home/ponytail/config.json" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
if path.exists():
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(config, dict):
        raise SystemExit("La configuración global de Ponytail debe ser un objeto JSON")
PY
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

# Ponytail oficial: nivel persistente en OpenCode y default global, incluso
# cuando el servicio ya estaba iniciado y no recibe el entorno de esta shell.
mkdir -p "$config_home/ponytail"
if [[ -f $config_home/ponytail/config.json ]]; then
  cp -L -- "$config_home/ponytail/config.json" "$backup/ponytail-config.json"
fi
python -I - "$config_home/ponytail/config.json" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
config = json.loads(path.read_text(encoding="utf-8-sig")) if path.exists() else {}
config["defaultMode"] = "lite"
path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")
PY
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

# Herdr administra su integración; solo registrarla cuando el binario soporte V2.
if command -v herdr >/dev/null; then
  herdr_version="$(herdr --version)"
  if python -I - "$herdr_version" <<'PY'
import re, sys
version = re.fullmatch(r"herdr (\d+)\.(\d+)\.(\d+)", sys.argv[1].strip())
sys.exit(0 if version and tuple(map(int, version.groups())) >= (0, 9, 1) else 1)
PY
  then
    if ! herdr integration install opencode; then
      echo 'Perfil desplegado; falló la integración opcional de Herdr. Revisa herdr integration status y vuelve a instalarla.' >&2
      exit 1
    fi
  else
    printf 'Herdr omitido: se requiere una versión estable >= 0.9.1; detectado %s.\n' "$herdr_version" >&2
  fi
fi

if $start; then
  if ! timeout --kill-after=5s 60s opencode service restart; then
    echo 'Perfil desplegado; el servicio no arrancó. Revisa opencode service status y el log del servidor.' >&2
    exit 1
  fi
  bash "$root/arch/verify.sh" --live
else
  echo 'Perfil desplegado sin reiniciar; OpenCode recarga la configuración. Comprueba con arch/verify.sh --live desde un directorio sin configuración de proyecto.'
fi
