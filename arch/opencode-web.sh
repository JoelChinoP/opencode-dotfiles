#!/usr/bin/env bash
# opencode-web.sh - lanzador del servidor web de OpenCode (lo usa opencode-web.service).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
source "$DIR/dotfiles.env"

: "${OPENCODE_WORKDIR:=code}"
: "${OPENCODE_PORT:=47917}"

# Asegura el bin de opencode (curl installer lo deja en ~/.opencode/bin; pacman en /usr/bin).
export PATH="$HOME/.opencode/bin:$HOME/.local/bin:/usr/bin:$PATH"

cd "$HOME/$OPENCODE_WORKDIR"

export OPENCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}"
export BROWSER="${BROWSER:-/bin/true}"   # evita abrir un navegador (es un servicio)

exec opencode web --hostname 127.0.0.1 --port "$OPENCODE_PORT"
