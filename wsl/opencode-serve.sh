#!/usr/bin/env bash
# opencode-serve.sh - lanzador del servidor API headless de OpenCode.
# Lo invoca el servicio systemd 'opencode-serve'. A este servidor se conecta
# la APP DE ESCRITORIO (Server URL = http://localhost:OPENCODE_SERVE_PORT) y el SDK.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
source "$DIR/dotfiles.env"

# Si el paso opcional 'skills.sh' ya se ejecuto, carga los paths aislados de
# Python (venv) y Node (NODE_PATH) para que los skills encuentren sus
# dependencias. No hace nada si el archivo no existe.
if [ -f "$HOME/.config/opencode/skills-env.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.config/opencode/skills-env.sh"
fi

: "${OPENCODE_WORKDIR:=code}"
: "${OPENCODE_SERVE_PORT:=4096}"

# systemd arranca con un PATH minimo; aseguramos el bin de opencode.
export PATH="$HOME/.opencode/bin:$HOME/.local/bin:$PATH"

cd "$HOME/$OPENCODE_WORKDIR"

# Basic Auth opcional (vacio = sin auth). Usuario por defecto del server: 'opencode'.
export OPENCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}"

# Escucha SOLO en localhost. Con networkingMode=mirrored, la app de escritorio
# de Windows alcanza este puerto via http://localhost:OPENCODE_SERVE_PORT.
exec opencode serve --hostname 127.0.0.1 --port "$OPENCODE_SERVE_PORT"
