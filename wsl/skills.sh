#!/usr/bin/env bash
# skills.sh (WSL/Debian) - instala el stack completo de skills + config global.
# Llamar DESPUES de wsl/provision.sh. Idempotente.
#
# Lo unico especifico de Debian/WSL es la instalacion de binarios via apt.
# El resto vive en config/skills-common.sh, compartido con Arch.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export REPO_DIR="$(cd "$DIR/.." && pwd)"
export PLATFORM="wsl"

# --- Sanity ---
if [ "$(id -u)" -eq 0 ]; then
    echo "ERROR: ejecuta como tu usuario normal (no root). Se usa sudo cuando hace falta." >&2
    exit 1
fi
if ! command -v apt-get >/dev/null 2>&1; then
    echo "ERROR: este script es para WSL/Debian/Ubuntu (no encuentro apt-get)." >&2
    exit 1
fi

echo "==> Step 1 - binarios del sistema (apt-get)"
sudo apt-get update -y
sudo apt-get install -y \
    libreoffice \
    poppler-utils \
    qpdf \
    tesseract-ocr \
    tesseract-ocr-eng \
    pandoc \
    ghostscript \
    imagemagick \
    ffmpeg \
    jq \
    rsync

# Cargar la logica compartida
# shellcheck disable=SC1091
source "$REPO_DIR/config/skills-common.sh"
