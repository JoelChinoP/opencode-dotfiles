#!/usr/bin/env bash
# provision.sh - instala y configura OpenCode en Arch Linux (nativo).
# Instala OpenCode, las dependencias del portapapeles grafico y el servicio
# systemd 'opencode-serve' (API + web UI) limitado a localhost.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"

# Ruta estable para los scripts/config que usaran los servicios systemd.
DEST="$HOME/.config/opencode-dotfiles"
DEFAULTS_SRC="$REPO/config/dotfiles.env"
CONFIG_SRC="$REPO/dotfiles.env"
if [[ ! -f "$CONFIG_SRC" ]]; then
    echo "ERROR: falta $CONFIG_SRC. Copia config/dotfiles.env para crear la configuracion privada." >&2
    exit 1
fi
chmod 600 "$CONFIG_SRC"

# shellcheck disable=SC1090
source <(sed 's/\r$//' "$DEFAULTS_SRC")
# shellcheck disable=SC1090
source <(sed 's/\r$//' "$CONFIG_SRC")
: "${OPENCODE_WORKDIR:=/home/joel}"
: "${OPENCODE_SERVE_PORT:=4096}"
if [[ ! "$OPENCODE_SERVE_PORT" =~ ^[0-9]+$ ]] \
    || (( OPENCODE_SERVE_PORT < 1 || OPENCODE_SERVE_PORT > 65535 )); then
    echo "ERROR: OPENCODE_SERVE_PORT no es un puerto valido." >&2
    exit 1
fi

install -Dm 0644 "$DEFAULTS_SRC" "$DEST/defaults.env"
install -Dm 0600 "$CONFIG_SRC" "$DEST/dotfiles.env"
install -Dm 0755 "$DIR/opencode-serve.sh" "$DEST/opencode-serve.sh"
# Por si el repo se clono en Windows: normaliza finales de linea.
find "$DEST" -type f -exec sed -i 's/\r$//' {} +

USER_NAME="$(id -un)"
USER_HOME="$HOME"
if [[ "$OPENCODE_WORKDIR" = /* ]]; then
    WORKDIR="$OPENCODE_WORKDIR"
else
    WORKDIR="$USER_HOME/$OPENCODE_WORKDIR"
fi
echo "==> Usuario=$USER_NAME  Workdir=$WORKDIR  API=$OPENCODE_SERVE_PORT"

# --- 1) OpenCode ---
echo "==> Instalando OpenCode"
if pacman -Si opencode >/dev/null 2>&1; then
    sudo pacman -S --needed --noconfirm opencode       # repo oficial (extra)
else
    echo "==> El paquete oficial no esta disponible; usando AUR como fallback"
    if command -v paru >/dev/null 2>&1; then
        paru -S --needed --noconfirm opencode-bin
    elif command -v yay >/dev/null 2>&1; then
        yay -S --needed --noconfirm opencode-bin
    else
        echo "ERROR: no se encontro el paquete oficial ni un helper de AUR." >&2
        exit 1
    fi
fi
if [[ ! -x /usr/bin/opencode ]]; then
    echo "ERROR: la instalacion no creo /usr/bin/opencode." >&2
    exit 1
fi
echo "==> OpenCode: /usr/bin/opencode  ($(/usr/bin/opencode --version 2>/dev/null || echo '?'))"

# --- 2) Dependencias del portapapeles grafico (para pegar imagenes en el TUI) ---
echo "==> Dependencias graficas (clipboard)"
case "${XDG_SESSION_TYPE:-}" in
    wayland) sudo pacman -S --needed --noconfirm wl-clipboard ;;
    x11)     sudo pacman -S --needed --noconfirm xclip ;;
    *)       sudo pacman -S --needed --noconfirm wl-clipboard xclip ;;
esac

# --- 3) Carpeta de trabajo ---
mkdir -p "$WORKDIR"

# --- 4) Servicio systemd: opencode serve (API + web UI) ---
# 'opencode serve' tambien sirve la web UI en la raiz, asi que este
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
echo "   Server permanente: 127.0.0.1:${OPENCODE_SERVE_PORT}  (API + web UI)"
echo "   Navegador:         http://localhost:${OPENCODE_SERVE_PORT}/"
echo "   TUI:               ejecuta  opencode  en la carpeta del proyecto"
echo "   Workspace web:     ${WORKDIR}  (lo fija el WorkingDirectory del systemd)"
echo "   Servicio:          systemctl status opencode-serve"
echo ""
echo "   App de escritorio (opcional): bash $DIR/desktop.sh"
echo "                  Instala opencode-desktop-bin (AUR) y la apunta al serve local."
echo "============================================================"
