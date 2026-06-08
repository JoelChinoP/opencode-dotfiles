#!/usr/bin/env bash
# skills.sh (Arch) - instala el stack completo de skills + configuracion global.
# Llamar DESPUES de install.sh. Es idempotente: puedes reejecutarlo.
#
# Lo que hace especificamente Arch:
#   1. Instala los binarios del sistema con pacman.
# El resto (clonar skills, venv, node aislado, MCP, permisos, hook al shell,
# patch del systemd) vive en config/skills-common.sh, compartido con WSL.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export REPO_DIR="$(cd "$DIR/.." && pwd)"
export PLATFORM="arch"

# --- Sanity ---
if [ "$(id -u)" -eq 0 ]; then
    echo "ERROR: ejecuta como tu usuario normal (no root). Se usa sudo cuando hace falta." >&2
    exit 1
fi
if ! command -v pacman >/dev/null 2>&1; then
    echo "ERROR: este script es para Arch Linux." >&2
    exit 1
fi

echo "==> Step 1 - binarios del sistema (pacman)"
# Stack completo. tesseract-data-eng en repos Arch; si no, omitir sin abortar.
PKGS=(
    libreoffice-still
    poppler
    qpdf
    tesseract
    pandoc
    ghostscript
    imagemagick
    ffmpeg
    jq
    rsync
)
sudo pacman -S --needed --noconfirm "${PKGS[@]}"

# tesseract-data-eng como paquete separado (mejora OCR). Si no esta en repos,
# tesseract base ya incluye 'osd'+'eng' en muchos casos -> seguir sin abortar.
if pacman -Si tesseract-data-eng >/dev/null 2>&1; then
    sudo pacman -S --needed --noconfirm tesseract-data-eng
else
    echo "   [info] tesseract-data-eng no esta en repos; tesseract base sera suficiente para OCR ingles"
fi

# Cargar la logica compartida
# shellcheck disable=SC1091
source "$REPO_DIR/config/skills-common.sh"
