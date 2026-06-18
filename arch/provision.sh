#!/usr/bin/env bash
# provision.sh - instala y configura OpenCode en Arch Linux (nativo).
# Instala opencode (repo oficial o AUR), instala las dependencias del
# portapapeles grafico, levanta el reverse proxy elegido (nginx o Caddy)
# apuntando al API del servicio systemd 'opencode-serve' (puerto 4096), que
# tambien sirve la web UI en /app. Asi un solo proceso atiende TUI, web, app
# de escritorio y SDK.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"

# Ruta estable para los scripts/config que usaran los servicios systemd.
DEST="$HOME/.config/opencode-dotfiles"
mkdir -p "$DEST"
cp -f "$REPO/config/dotfiles.env" "$DEST/"
cp -f "$DIR/opencode-serve.sh" "$DEST/"
cp -f "$DIR/nginx-opencode.conf" "$DIR/nginx-opencode-map.conf" "$DIR/Caddyfile" "$DEST/"
# Por si el repo se clono en Windows: normaliza finales de linea.
find "$DEST" -type f -exec sed -i 's/\r$//' {} +
chmod +x "$DEST/"*.sh

# shellcheck disable=SC1090
source "$DEST/dotfiles.env"
: "${OPENCODE_WORKDIR:=/home/joel}"
: "${OPENCODE_SERVE_PORT:=4096}"
: "${OPENCODE_DOMAIN:=opencode.local}"
: "${OPENCODE_SERVER_PASSWORD:=}"

USER_NAME="$(id -un)"
USER_HOME="$HOME"
if [[ "$OPENCODE_WORKDIR" = /* ]]; then
    WORKDIR="$OPENCODE_WORKDIR"
else
    WORKDIR="$USER_HOME/$OPENCODE_WORKDIR"
fi
echo "==> Usuario=$USER_NAME  Workdir=$WORKDIR  API=$OPENCODE_SERVE_PORT  Dominio=$OPENCODE_DOMAIN"

# --- 1) OpenCode (comando recomendado) ---
if ! command -v opencode >/dev/null 2>&1; then
    echo "==> Instalando OpenCode"
    if command -v paru >/dev/null 2>&1; then
        paru -S --needed --noconfirm opencode-bin      # AUR, siempre al dia
    elif command -v yay >/dev/null 2>&1; then
        yay -S --needed --noconfirm opencode-bin       # AUR, siempre al dia
    else
        sudo pacman -S --needed --noconfirm opencode   # repo oficial (extra)
    fi
fi
echo "==> OpenCode: $(command -v opencode)  ($(opencode --version 2>/dev/null || echo '?'))"

# --- 2) Dependencias del portapapeles grafico (para pegar imagenes en el TUI) ---
echo "==> Dependencias graficas (clipboard)"
case "${XDG_SESSION_TYPE:-}" in
    wayland) sudo pacman -S --needed --noconfirm wl-clipboard ;;
    x11)     sudo pacman -S --needed --noconfirm xclip ;;
    *)       sudo pacman -S --needed --noconfirm wl-clipboard xclip ;;
esac

# --- 3) Carpeta de trabajo ---
mkdir -p "$WORKDIR"

# --- 4) /etc/hosts: dominio -> 127.0.0.1 ---
if ! grep -q -- "$OPENCODE_DOMAIN" /etc/hosts; then
    echo "127.0.0.1 $OPENCODE_DOMAIN" | sudo tee -a /etc/hosts >/dev/null
    echo "==> /etc/hosts: anadido 127.0.0.1 $OPENCODE_DOMAIN"
fi

render() { sed -e "s|__PORT__|${OPENCODE_SERVE_PORT}|g" -e "s|__DOMAIN__|${OPENCODE_DOMAIN}|g" "$1"; }

# --- 5) Reverse proxy: lo decide el usuario (nginx http / Caddy https), no ambos ---
echo ""
echo "Reverse proxy para ${OPENCODE_DOMAIN}:"
echo "  [N] nginx -> http://${OPENCODE_DOMAIN}    (sin TLS, ligero, por defecto)"
echo "  [C] Caddy -> https://${OPENCODE_DOMAIN}   (TLS local automatico)"
read -r -p "Elige N/C [N]: " PROXY_CHOICE || true
PROXY_CHOICE="${PROXY_CHOICE:-N}"

if [[ "$PROXY_CHOICE" =~ ^[Cc] ]]; then
    echo "==> Instalando Caddy (y desactivando nginx si estaba)"
    sudo systemctl disable --now nginx 2>/dev/null || true
    sudo pacman -S --needed --noconfirm caddy
    sudo mkdir -p /etc/caddy
    render "$DEST/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
    sudo systemctl enable --now caddy
    sudo systemctl restart caddy
    PROXY_NAME="caddy"; SCHEME="https"
else
    echo "==> Instalando nginx (y desactivando Caddy si estaba)"
    sudo systemctl disable --now caddy 2>/dev/null || true
    sudo pacman -S --needed --noconfirm nginx
    # En Arch, nginx.conf NO incluye conf.d por defecto (a diferencia de Debian).
    sudo cp -n /etc/nginx/nginx.conf "/etc/nginx/nginx.conf.bak-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
    if ! grep -qE 'include[[:space:]]+.*conf\.d/\*\.conf' /etc/nginx/nginx.conf; then
        sudo sed -i '0,/http[[:space:]]*{/s//http {\n    include \/etc\/nginx\/conf.d\/*.conf;/' /etc/nginx/nginx.conf
    fi
    sudo mkdir -p /etc/nginx/conf.d
    sudo cp -f "$DEST/nginx-opencode-map.conf" /etc/nginx/conf.d/opencode-map.conf
    render "$DEST/nginx-opencode.conf" | sudo tee /etc/nginx/conf.d/opencode.conf >/dev/null
    sudo nginx -t
    sudo systemctl enable --now nginx
    sudo systemctl restart nginx
    PROXY_NAME="nginx"; SCHEME="http"
fi

# --- 6) Servicio systemd: opencode serve (API + web UI en /app) ---
# 'opencode serve' tambien sirve la web UI en la ruta /app, asi que este
# unico proceso atiende al mismo tiempo: la app de escritorio, los SDK/IDE,
# y el navegador via reverse proxy (opencode.local -> /app).
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
ExecStart=${DEST}/opencode-serve.sh
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
echo " Provision completado (Arch Linux)."
echo "   Server permanente: 127.0.0.1:${OPENCODE_SERVE_PORT}  (API + web UI en /app)"
echo "   Navegador:         ${SCHEME}://${OPENCODE_DOMAIN}    (proxy -> :${OPENCODE_SERVE_PORT}/app)"
echo "                      o directo: http://localhost:${OPENCODE_SERVE_PORT}/app"
echo "   TUI:               ejecuta  opencode  en la carpeta del proyecto"
echo "   Workspace web:     ${WORKDIR}  (lo fija el WorkingDirectory del systemd)"
echo "   Servicios:         systemctl status opencode-serve ${PROXY_NAME}"
echo ""
echo "   App de escritorio (opcional): bash $DIR/desktop.sh"
echo "                  Instala opencode-desktop-bin (AUR) y la apunta al serve local."
if [ "$SCHEME" = "https" ]; then
    echo ""
    echo " NOTA Caddy/HTTPS: la CA local de Caddy esta en"
    echo "   /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt"
    echo " Importala en tu navegador si quieres evitar el aviso de certificado."
fi
echo "============================================================"
