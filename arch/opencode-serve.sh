#!/usr/bin/env bash
# opencode-serve.sh - lanzador del servidor API headless (lo usa opencode-serve.service).
# A este servidor se conecta la app de escritorio (Server URL = http://localhost:OPENCODE_SERVE_PORT)
# y el SDK. En Arch (misma maquina) normalmente usaras el TUI/web local y este servicio es opcional.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
source "$DIR/dotfiles.env"

: "${OPENCODE_WORKDIR:=code}"
: "${OPENCODE_SERVE_PORT:=4096}"

export PATH="$HOME/.opencode/bin:$HOME/.local/bin:/usr/bin:$PATH"

cd "$HOME/$OPENCODE_WORKDIR"

export OPENCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}"

exec opencode serve --hostname 127.0.0.1 --port "$OPENCODE_SERVE_PORT"
