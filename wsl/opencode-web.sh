#!/usr/bin/env bash
# opencode-web.sh - lanzador del servidor web de OpenCode.
# Lo invoca el servicio systemd 'opencode-web'. Tambien puedes ejecutarlo a mano.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
source "$DIR/dotfiles.env"

: "${OPENCODE_WORKDIR:=code}"
: "${OPENCODE_PORT:=47917}"

# systemd arranca con un PATH minimo; aseguramos el bin de opencode.
export PATH="$HOME/.opencode/bin:$HOME/.local/bin:$PATH"

cd "$HOME/$OPENCODE_WORKDIR"

# Basic Auth opcional (vacio = sin auth). Usuario por defecto del server: 'opencode'.
export OPENCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}"
# Evita que opencode intente abrir un navegador (es un servicio en segundo plano).
export BROWSER="${BROWSER:-/bin/true}"

# Escucha SOLO en localhost; el reverse proxy (nginx/Caddy) expone el dominio.
exec opencode web --hostname 127.0.0.1 --port "$OPENCODE_PORT"
