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
# --no-install-recommends + componentes sueltos de LibreOffice en vez del
# metapaquete completo: ahorra >1 GB de disco y minutos de instalacion.
# fonts-liberation/dejavu: fuentes minimas para que las conversiones a PDF
# salgan bien (con no-recommends ya no entran solas).
sudo apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-liberation \
    fonts-dejavu-core \
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

# Instalador de runtimes que skills-common.sh (Step 0) invoca si faltan node,
# python, etc. Traduce tokens abstractos a paquetes apt. Node va via NodeSource
# para garantizar 20+ (el de los repos Debian suele ir por detras).
platform_install_runtimes() {
    local t pkgs=() want_node=0
    for t in "$@"; do
        case "$t" in
            python) pkgs+=(python3 python3-venv python3-pip) ;;
            node)   want_node=1 ;;
            git)    pkgs+=(git) ;;
            curl)   pkgs+=(curl ca-certificates) ;;
            jq)     pkgs+=(jq) ;;
        esac
    done
    sudo apt-get update -y
    if [ "${#pkgs[@]}" -gt 0 ]; then
        sudo apt-get install -y --no-install-recommends "${pkgs[@]}"
    fi
    if [ "$want_node" -eq 1 ]; then
        echo "==> Instalando Node 22 LTS (NodeSource)"
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y --no-install-recommends nodejs
    fi
}

# Cargar la logica compartida
# shellcheck disable=SC1091
source "$REPO_DIR/config/skills-common.sh"
