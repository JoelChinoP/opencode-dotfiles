#!/usr/bin/env bash
# provision.sh - instala y configura OpenCode en Arch Linux (nativo).
# Instala OpenCode, las dependencias del portapapeles grafico y el servicio
# systemd 'opencode-serve' (API + web UI en /app) limitado a localhost.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"

# Ruta estable para los scripts/config que usaran los servicios systemd.
DEST="$HOME/.config/opencode-dotfiles"
mkdir -p "$DEST"
cp -f "$REPO/config/dotfiles.env" "$DEST/"
cp -f "$DIR/opencode-serve.sh" "$DEST/"
# Por si el repo se clono en Windows: normaliza finales de linea.
find "$DEST" -type f -exec sed -i 's/\r$//' {} +
chmod +x "$DEST/"*.sh

# shellcheck disable=SC1090
source "$DEST/dotfiles.env"
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

# --- 4) Servicio systemd: opencode serve (API + web UI en /app) ---
# 'opencode serve' tambien sirve la web UI en la ruta /app, asi que este
# unico proceso atiende al mismo tiempo el navegador, la app de escritorio
# y los SDK/plugins IDE.
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
echo "   Navegador:         http://localhost:${OPENCODE_SERVE_PORT}/app"
echo "   TUI:               ejecuta  opencode  en la carpeta del proyecto"
echo "   Workspace web:     ${WORKDIR}  (lo fija el WorkingDirectory del systemd)"
echo "   Servicio:          systemctl status opencode-serve"
echo ""
echo "   App de escritorio (opcional): bash $DIR/desktop.sh"
echo "                  Instala opencode-desktop-bin (AUR) y la apunta al serve local."
echo "============================================================"
