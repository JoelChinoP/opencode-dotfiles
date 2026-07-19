#!/usr/bin/env bash
# provision.sh - se ejecuta DENTRO de Debian (WSL).
# Instala paquetes, OpenCode, aplica la config de git pedida y levanta
# 'opencode-serve' (API + web UI en /app) limitado a localhost. Con la red
# mirrored de WSL, Windows tambien lo alcanza mediante localhost.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
source "$DIR/dotfiles.env"

: "${OPENCODE_WORKDIR:=/home/joel}"
: "${OPENCODE_SERVE_PORT:=4096}"
: "${OPENCODE_SERVER_PASSWORD:=}"

USER_NAME="$(id -un)"
USER_HOME="$HOME"
if [[ "$OPENCODE_WORKDIR" = /* ]]; then
    WORKDIR="$OPENCODE_WORKDIR"
else
    WORKDIR="$USER_HOME/$OPENCODE_WORKDIR"
fi

echo "==> Usuario=$USER_NAME  Workdir=$WORKDIR  API=$OPENCODE_SERVE_PORT"

# --- Aviso si systemd no esta activo (deberia estarlo tras 01-setup-wsl.ps1) ---
if [ "$(ps -p 1 -o comm= 2>/dev/null)" != "systemd" ]; then
    echo "ADVERTENCIA: systemd no parece ser PID 1. Ejecuta 01-setup-wsl.ps1 (habilita" >&2
    echo "             systemd y reinicia WSL) antes de este paso." >&2
fi

# --- 1) Paquetes base ---
echo "==> Instalando paquetes base (nano, git, curl, ca-certificates, unzip)"
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends nano git curl ca-certificates unzip

# --- 2) OpenCode ---
if ! command -v opencode >/dev/null 2>&1 && [ ! -x "$USER_HOME/.opencode/bin/opencode" ]; then
    echo "==> Instalando OpenCode"
    curl -fsSL https://opencode.ai/install | bash
fi
OPENCODE_BIN="$(command -v opencode || true)"
[ -z "$OPENCODE_BIN" ] && [ -x "$USER_HOME/.opencode/bin/opencode" ] && OPENCODE_BIN="$USER_HOME/.opencode/bin/opencode"
if [ -z "$OPENCODE_BIN" ]; then
    echo "ERROR: no se pudo localizar el binario de opencode." >&2
    exit 1
fi
echo "==> OpenCode: $OPENCODE_BIN  ($("$OPENCODE_BIN" --version 2>/dev/null || echo '?'))"

# --- 3) Configuracion de git pedida ---
echo "==> git config global: core.autocrlf=input  core.eol=lf  core.fileMode=false"
git config --global core.fileMode false
git config --global core.autocrlf input
git config --global core.eol lf

# --- 4) Carpeta de trabajo (filesystem nativo, rapido) ---
mkdir -p "$WORKDIR"

# --- 5) Servicio systemd: opencode serve (API + web UI en /app) ---
# Un unico proceso atiende el navegador, la app de escritorio y los SDK/plugins
# IDE mediante localhost y mirrored networking. No hace falta levantar
# 'opencode web' aparte. WorkingDirectory esta fijado a ${WORKDIR}.
echo "==> Creando servicio systemd 'opencode-serve' (API + web UI)"
sudo tee /etc/systemd/system/opencode-serve.service >/dev/null <<EOF
[Unit]
Description=OpenCode API server (opencode-dotfiles)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${WORKDIR}
Environment=HOME=${USER_HOME}
Environment=OPENCODE_SERVE_PORT=${OPENCODE_SERVE_PORT}
Environment=OPENCODE_SERVER_PASSWORD=${OPENCODE_SERVER_PASSWORD}
ExecStart=${DIR}/opencode-serve.sh
Restart=on-failure
RestartSec=3
# Contiene leaks de memoria del server y sus hijos: por encima de este
# umbral systemd hace reclaim suave (no mata el proceso, a diferencia de MemoryMax).
MemoryHigh=4G

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now opencode-serve.service
sleep 2
sudo systemctl restart opencode-serve.service

echo ""
echo "============================================================"
echo " Provision completado."
echo "   Server permanente: 127.0.0.1:${OPENCODE_SERVE_PORT}  (API + web UI en /app)"
echo "   Navegador (Win):   http://localhost:${OPENCODE_SERVE_PORT}/app  (via mirrored)"
echo "   App de escritorio: apuntala a  http://localhost:${OPENCODE_SERVE_PORT}"
echo "   Workspace:         ${WORKDIR}  (lo fija el WorkingDirectory del systemd)"
echo "   Servicio:          systemctl status opencode-serve"
echo "============================================================"
