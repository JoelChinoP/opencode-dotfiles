#!/bin/sh
set -eu

case "${HERDR_PLUGIN_CLICKED_URL:-}" in
  file:///*|file://localhost/*) ;;
  *) echo 'Se requiere un enlace file:// local.' >&2; exit 2 ;;
esac

# ponytail: solo escritorio Linux local; acceso remoto requiere otro manejador.
exec busctl --user --timeout=5s call \
  org.freedesktop.FileManager1 /org/freedesktop/FileManager1 \
  org.freedesktop.FileManager1 ShowItems ass 1 "$HERDR_PLUGIN_CLICKED_URL" ''
