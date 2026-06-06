#!/usr/bin/env bash
# provision.sh - instala y configura OpenCode en Arch Linux (nativo).
# Instala opencode (repo oficial o AUR), aplica la config de git, instala las
# dependencias del portapapeles grafico, levanta el reverse proxy elegido
# (nginx o Caddy) y crea los servicios systemd (web + serve) que arrancan solos.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"

# Ruta estable para los scripts/config que usaran los servicios systemd.
DEST="$HOME/.config/opencode-dotfiles"
mkdir -p "$DEST"
cp -f "$REPO/config/dotfiles.env" "$DEST/"
cp -f "$DIR/opencode-web.sh" "$DIR/opencode-serve.sh" "$DEST/"
cp -f "$DIR/nginx-opencode.conf" "$DIR/Caddyfile" "$DEST/"
# Por si el repo se clono en Windows: normaliza finales de linea.
find "$DEST" -type f -exec sed -i 's/\r$//' {} +
chmod +x "$DEST/"*.sh

# shellcheck disable=SC1090
source "$DEST/dotfiles.env"
: "${OPENCODE_WORKDIR:=code}"
: "${OPENCODE_PORT:=47917}"
: "${OPENCODE_SERVE_PORT:=4096}"
: "${OPENCODE_DOMAIN:=opencode.local}"
: "${OPENCODE_SERVER_PASSWORD:=}"

USER_NAME="$(id -un)"
USER_HOME="$HOME"
WORKDIR="$USER_HOME/$OPENCODE_WORKDIR"
echo "==> Usuario=$USER_NAME  Workdir=$WORKDIR  Web=$OPENCODE_PORT  API=$OPENCODE_SERVE_PORT  Dominio=$OPENCODE_DOMAIN"

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

# --- 2) Configuracion de git pedida ---
echo "==> git config global: core.fileMode=false  core.autocrlf=input"
git config --global core.fileMode false
git config --global core.autocrlf input

# --- 3) Dependencias del portapapeles grafico (para pegar imagenes en el TUI) ---
echo "==> Dependencias graficas (clipboard)"
case "${XDG_SESSION_TYPE:-}" in
    wayland) sudo pacman -S --needed --noconfirm wl-clipboard ;;
    x11)     sudo pacman -S --needed --noconfirm xclip ;;
    *)       sudo pacman -S --needed --noconfirm wl-clipboard xclip ;;
esac

# --- 4) Carpeta de trabajo ---
mkdir -p "$WORKDIR"

# --- 5) /etc/hosts: dominio -> 127.0.0.1 ---
if ! grep -q -- "$OPENCODE_DOMAIN" /etc/hosts; then
    echo "127.0.0.1 $OPENCODE_DOMAIN" | sudo tee -a /etc/hosts >/dev/null
    echo "==> /etc/hosts: anadido 127.0.0.1 $OPENCODE_DOMAIN"
fi

render() { sed -e "s|__PORT__|${OPENCODE_PORT}|g" -e "s|__DOMAIN__|${OPENCODE_DOMAIN}|g" "$1"; }

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
    render "$DEST/nginx-opencode.conf" | sudo tee /etc/nginx/conf.d/opencode.conf >/dev/null
    sudo nginx -t
    sudo systemctl enable --now nginx
    sudo systemctl restart nginx
    PROXY_NAME="nginx"; SCHEME="http"
fi

# --- 7) Servicio systemd: opencode serve (API) para la APP DE ESCRITORIO ---
# NOTA: 'opencode web' NO se ejecuta como servicio permanente. La web se usa
# bajo demanda (ver README): vas a la carpeta del proyecto y ejecutas
# 'opencode web', con lo que tambien puedes abrir cualquier directorio.
echo "==> Creando servicio systemd 'opencode-serve' (API para la app de escritorio)"
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
echo "   API (serve):   127.0.0.1:${OPENCODE_SERVE_PORT}  (servicio PERMANENTE, app de escritorio / SDK)"
echo "   Web (bajo demanda): ve a la carpeta del proyecto y ejecuta:"
echo "                       opencode web --port ${OPENCODE_PORT}"
echo "                  (asi opencode.local lo sirve; o usa el puerto que abra opencode)"
echo "   TUI:           ejecuta  opencode  en la carpeta del proyecto"
echo "   Proxy listo:   ${SCHEME}://${OPENCODE_DOMAIN}  (responde cuando la web corre en ${OPENCODE_PORT})"
echo "   Servicio:      systemctl status opencode-serve ${PROXY_NAME}"
if [ "$SCHEME" = "https" ]; then
    echo ""
    echo " NOTA Caddy/HTTPS: la CA local de Caddy esta en"
    echo "   /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt"
    echo " Importala en tu navegador si quieres evitar el aviso de certificado."
fi
echo "============================================================"
