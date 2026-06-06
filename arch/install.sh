#!/usr/bin/env bash
# install.sh - punto de entrada del setup de OpenCode en Arch Linux (nativo).
# Equivalente al install.ps1 de Windows, pero mucho mas simple: Arch es Linux
# nativo, no hay WSL, ni .wslconfig, ni cruce de mundos, y systemd ya esta activo.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "opencode-dotfiles - instalacion en Arch Linux"

if ! command -v pacman >/dev/null 2>&1; then
    echo "ERROR: no se encontro pacman. Este script es para Arch Linux." >&2
    exit 1
fi
if [ "$(id -u)" -eq 0 ]; then
    echo "ERROR: ejecuta como tu usuario normal (no root). Se usara sudo cuando haga falta." >&2
    exit 1
fi

bash "$DIR/provision.sh"
