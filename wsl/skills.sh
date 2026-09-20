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
    rsync

# Instalador de runtimes que skills-common.sh (Step 0) invoca si faltan node,
# python, etc. Traduce tokens abstractos a paquetes apt. Node va via NodeSource
# para garantizar 20+ (el de los repos Debian suele ir por detras).
platform_install_go() {
    local version=go1.25.10 arch filename archive checksum install_root tmpdir
    case "$(uname -m)" in
        x86_64) arch=amd64 ;;
        aarch64|arm64) arch=arm64 ;;
        *) echo "ERROR: arquitectura no soportada para Go: $(uname -m)" >&2; return 1 ;;
    esac
    filename="${version}.linux-${arch}.tar.gz"
    archive=$(mktemp --suffix=.tar.gz)
    curl -fsSL "https://go.dev/dl/$filename" -o "$archive"
    checksum=$(curl -fsSL 'https://go.dev/dl/?mode=json&include=all' | python3 -c '
import json, sys
version, filename = sys.argv[1:]
for release in json.load(sys.stdin):
    if release["version"] == version:
        for file in release["files"]:
            if file["filename"] == filename:
                print(file["sha256"])
                raise SystemExit
raise SystemExit(1)
' "$version" "$filename")
    printf '%s  %s\n' "$checksum" "$archive" | sha256sum -c -
    install_root="$HOME/.local/share/go"
    tmpdir=$(mktemp -d)
    tar -C "$tmpdir" -xzf "$archive"
    rm -rf "$install_root"
    mkdir -p "$(dirname "$install_root")"
    mv "$tmpdir/go" "$install_root"
    rmdir "$tmpdir"
    rm -f "$archive"
    export PATH="$install_root/bin:$PATH"
}

platform_install_runtimes() {
    local t pkgs=() want_node=0 want_go=0
    for t in "$@"; do
        case "$t" in
            python) pkgs+=(python3 python3-venv python3-pip) ;;
            node)   want_node=1 ;;
            go)     want_go=1 ;;
            git)    pkgs+=(git) ;;
            curl)   pkgs+=(curl ca-certificates) ;;
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
    if [ "$want_go" -eq 1 ]; then
        echo "==> Instalando Go 1.25.10 desde go.dev"
        platform_install_go
    fi
}

# Cargar la logica compartida
# shellcheck disable=SC1091
source "$REPO_DIR/config/skills-common.sh"
