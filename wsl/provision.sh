#!/usr/bin/env bash
# provision.sh - se ejecuta DENTRO de Debian (WSL).
# Instala paquetes, OpenCode, aplica la config de git pedida, levanta el
# reverse proxy elegido (nginx o Caddy) apuntando al API de 'opencode-serve'
# (:4096), que TAMBIEN sirve la web UI en /app. Asi un solo proceso atiende
# al navegador (via proxy), a la app de escritorio (via mirrored networking)
# y a los SDK/plugins IDE.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
source "$DIR/dotfiles.env"

: "${OPENCODE_WORKDIR:=code}"
: "${OPENCODE_SERVE_PORT:=4096}"
: "${OPENCODE_DOMAIN:=opencode.local}"
: "${OPENCODE_SERVER_PASSWORD:=}"

USER_NAME="$(id -un)"
USER_HOME="$HOME"
WORKDIR="$USER_HOME/$OPENCODE_WORKDIR"

echo "==> Usuario=$USER_NAME  Workdir=$WORKDIR  API=$OPENCODE_SERVE_PORT  Dominio=$OPENCODE_DOMAIN"

# --- Aviso si systemd no esta activo (deberia estarlo tras 01-setup-wsl.ps1) ---
if [ "$(ps -p 1 -o comm= 2>/dev/null)" != "systemd" ]; then
    echo "ADVERTENCIA: systemd no parece ser PID 1. Ejecuta 01-setup-wsl.ps1 (habilita" >&2
    echo "             systemd y reinicia WSL) antes de este paso." >&2
fi

# --- 1) Paquetes base ---
echo "==> Instalando paquetes base (nano, git, curl, ca-certificates, unzip)"
sudo apt-get update -y
sudo apt-get install -y nano git curl ca-certificates unzip

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
echo "==> git config global: core.fileMode=false  core.autocrlf=input"
git config --global core.fileMode false
git config --global core.autocrlf input

# --- 4) Carpeta de trabajo (filesystem nativo, rapido) ---
mkdir -p "$WORKDIR"

# --- 5) /etc/hosts dentro de WSL: dominio -> 127.0.0.1 ---
if ! grep -q -- "$OPENCODE_DOMAIN" /etc/hosts; then
    echo "127.0.0.1 $OPENCODE_DOMAIN" | sudo tee -a /etc/hosts >/dev/null
    echo "==> /etc/hosts: anadido 127.0.0.1 $OPENCODE_DOMAIN"
fi

# Sustituye los marcadores __PORT__ / __DOMAIN__ de las plantillas. El proxy
# apunta al puerto del API (opencode-serve), que tambien sirve la web en /app.
render() { sed -e "s|__PORT__|${OPENCODE_SERVE_PORT}|g" -e "s|__DOMAIN__|${OPENCODE_DOMAIN}|g" "$1"; }

# --- 6) Reverse proxy: lo decide el usuario (nginx http / Caddy https), no ambos ---
echo ""
echo "Reverse proxy para ${OPENCODE_DOMAIN}:"
echo "  [N] nginx -> http://${OPENCODE_DOMAIN}    (sin TLS, ligero, por defecto)"
echo "  [C] Caddy -> https://${OPENCODE_DOMAIN}   (TLS local automatico)"
read -r -p "Elige N/C [N]: " PROXY_CHOICE || true
PROXY_CHOICE="${PROXY_CHOICE:-N}"

if [[ "$PROXY_CHOICE" =~ ^[Cc] ]]; then
    echo "==> Instalando Caddy (y desactivando nginx si estaba)"
    sudo systemctl disable --now nginx 2>/dev/null || true
    sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    sudo apt-get update -y
    sudo apt-get install -y caddy
    render "$DIR/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
    sudo systemctl enable --now caddy
    sudo systemctl restart caddy
    PROXY_NAME="caddy"; SCHEME="https"
else
    echo "==> Instalando nginx (y desactivando Caddy si estaba)"
    sudo systemctl disable --now caddy 2>/dev/null || true
    sudo apt-get install -y nginx
    render "$DIR/nginx-opencode.conf" | sudo tee /etc/nginx/sites-available/opencode >/dev/null
    sudo ln -sf /etc/nginx/sites-available/opencode /etc/nginx/sites-enabled/opencode
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t
    sudo systemctl enable --now nginx
    sudo systemctl restart nginx
    PROXY_NAME="nginx"; SCHEME="http"
fi

# --- 7) Servicio systemd: opencode serve (API + web UI en /app) ---
# Un unico proceso atiende: navegador (via proxy + /app), app de escritorio
# (via mirrored networking) y SDK/plugins IDE. No hace falta levantar
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
echo "   Navegador (Win):   ${SCHEME}://${OPENCODE_DOMAIN}/app    (proxy -> :${OPENCODE_SERVE_PORT})"
echo "                      o directo: http://localhost:${OPENCODE_SERVE_PORT}/app  (via mirrored)"
echo "   App de escritorio: apuntala a  http://localhost:${OPENCODE_SERVE_PORT}"
echo "   Workspace:         ${WORKDIR}  (lo fija el WorkingDirectory del systemd)"
echo "   Servicios:         systemctl status opencode-serve ${PROXY_NAME}"
if [ "$SCHEME" = "https" ]; then
    echo ""
    echo " NOTA Caddy/HTTPS: para que el navegador de Windows confie en el"
    echo " certificado, importa la CA local de Caddy (ver README)."
fi
echo "============================================================"
