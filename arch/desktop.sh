#!/usr/bin/env bash
# desktop.sh - instala la APP DE ESCRITORIO de OpenCode en Arch Linux (AUR).
# Equivalente al 04-desktop.ps1 de Windows, pero MUCHO mas simple: la app y el
# servidor corren en la misma maquina, asi que no hay puente WSL ni espejo de red.
# La app se conecta al servicio 'opencode-serve' (127.0.0.1:OPENCODE_SERVE_PORT)
# que dejo levantado provision.sh.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"

# --- Sanity checks ---
if ! command -v pacman >/dev/null 2>&1; then
    echo "ERROR: este script es para Arch Linux." >&2
    exit 1
fi
if [ "$(id -u)" -eq 0 ]; then
    echo "ERROR: ejecuta como tu usuario normal (no root). paru/yay no deben correrse como root." >&2
    exit 1
fi

# --- Cargar configuracion ---
# Preferimos la copia que dejo el provision en ~/.config/opencode-dotfiles/
# Si no existe (corriste desktop.sh antes que provision), caemos al repo.
if [ -f "$HOME/.config/opencode-dotfiles/dotfiles.env" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.config/opencode-dotfiles/dotfiles.env"
else
    # shellcheck disable=SC1091
    source "$REPO/config/dotfiles.env"
fi
: "${OPENCODE_SERVE_PORT:=4096}"

# --- 1) Instalar opencode-desktop-bin desde AUR ---
echo "==> Instalando opencode-desktop-bin (AUR)"
if command -v paru >/dev/null 2>&1; then
    paru -S --needed --noconfirm opencode-desktop-bin
elif command -v yay >/dev/null 2>&1; then
    yay -S --needed --noconfirm opencode-desktop-bin
else
    echo "ERROR: no se encontro paru ni yay. Instala uno para acceder al AUR." >&2
    echo "       sudo pacman -S --needed base-devel git && cd /tmp && git clone https://aur.archlinux.org/paru-bin.git && cd paru-bin && makepkg -si" >&2
    exit 1
fi

# --- 2) Apuntar la app al servicio 'opencode-serve' via opencode.jsonc ---
# Metodo oficial (mismo que usa Windows): seccion "server" en
# ~/.config/opencode/opencode.jsonc. Sin esto, la app levantaria su propio
# servidor local en vez de reutilizar el systemd que ya esta corriendo.
CFG_DIR="$HOME/.config/opencode"
CFG_FILE="$CFG_DIR/opencode.jsonc"
mkdir -p "$CFG_DIR"

read -r -d '' JSON_TPL <<EOF || true
{
  "\$schema": "https://opencode.ai/config.json",
  "server": {
    "hostname": "127.0.0.1",
    "port": ${OPENCODE_SERVE_PORT}
  }
}
EOF

if [ -f "$CFG_FILE" ]; then
    BAK="$CFG_FILE.bak-$(date +%Y%m%d-%H%M%S)"
    cp -f "$CFG_FILE" "$BAK"
    echo "==> Ya existia $CFG_FILE; respaldado en $BAK"
    echo "    NO se sobrescribio tu config. Si te falta la seccion 'server', anade:"
    echo "      \"server\": { \"hostname\": \"127.0.0.1\", \"port\": ${OPENCODE_SERVE_PORT} }"
else
    printf '%s\n' "$JSON_TPL" > "$CFG_FILE"
    echo "==> Config creada: $CFG_FILE  (server -> 127.0.0.1:${OPENCODE_SERVE_PORT})"
fi

# --- 3) Aviso sobre OPENCODE_PORT en el entorno ---
# Si esta exportada, la app intentara levantar su propio servidor en ese puerto
# y NO se conectara al opencode-serve. Mismo issue que documenta 04-desktop.ps1.
if [ -n "${OPENCODE_PORT:-}" ]; then
    echo ""
    echo "AVISO: tienes OPENCODE_PORT=${OPENCODE_PORT} exportada en tu shell."
    echo "       Esto puede hacer que la app levante su PROPIO servidor en lugar de"
    echo "       conectarse al opencode-serve. Si la app falla, retira la variable"
    echo "       de tu ~/.bashrc / ~/.zshrc, o lanzala con:"
    echo "         env -u OPENCODE_PORT opencode-desktop"
fi

# --- 4) Validacion: el opencode-serve responde? ---
echo ""
echo "==> Validando conexion con 127.0.0.1:${OPENCODE_SERVE_PORT}"
if ss -tlnH "sport = :${OPENCODE_SERVE_PORT}" 2>/dev/null | grep -q LISTEN; then
    echo "    OK: hay un servidor escuchando. La app deberia conectar."
else
    echo "    AVISO: nada escucha en :${OPENCODE_SERVE_PORT}."
    echo "    Asegurate de que el servicio este activo:"
    echo "      sudo systemctl enable --now opencode-serve"
    echo "      systemctl status opencode-serve"
fi

# --- 5) Detectar el ejecutable instalado ---
DESKTOP_BIN=""
if command -v opencode-desktop >/dev/null 2>&1; then
    DESKTOP_BIN="$(command -v opencode-desktop)"
elif pacman -Q opencode-desktop-bin >/dev/null 2>&1; then
    DESKTOP_BIN="$(pacman -Ql opencode-desktop-bin 2>/dev/null | awk '$2 ~ /^\/usr\/bin\/[^\/]+$/ {print $2; exit}')"
fi

echo ""
echo "============================================================"
echo " App de escritorio instalada."
echo "   Ejecutable:    ${DESKTOP_BIN:-(buscalo en el menu de apps)}"
echo "   Server URL:    http://localhost:${OPENCODE_SERVE_PORT}"
echo "   (lo lee de ${CFG_FILE})"
echo "============================================================"
