#!/usr/bin/env bash
set -euo pipefail

for command in python pandoc libreoffice pdfinfo pdftotext pdftoppm; do
  command -v "$command" >/dev/null || { echo "Falta $command para el smoke documental." >&2; exit 1; }
done

work="$(mktemp -d "${TMPDIR:-/tmp}/opencode-documents.XXXXXXXX")"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
mkdir "$work/profile" "$work/render" "$work/pages"

cat >"$work/source.md" <<'EOF'
# Verificación documental

Este documento comprueba **DOCX**, conversión PDF y extracción local.

| Componente | Estado |
|---|---|
| Pandoc | listo |
| LibreOffice | listo |

- Texto en español.
- Lista semántica.
EOF

pandoc "$work/source.md" --output="$work/output.docx"
python -I -m zipfile -t "$work/output.docx" >/dev/null
pandoc "$work/output.docx" --to=gfm --output="$work/roundtrip.md"
grep -Fq 'Verificación documental' "$work/roundtrip.md"
grep -Fq '| Pandoc' "$work/roundtrip.md"

profile_uri="$(python -I - "$work/profile" <<'PY'
import pathlib, sys
print(pathlib.Path(sys.argv[1]).resolve().as_uri())
PY
)"
libreoffice "-env:UserInstallation=$profile_uri" --headless --convert-to pdf \
  --outdir "$work/render" "$work/output.docx" >/dev/null
pdfinfo "$work/render/output.pdf" >"$work/pdfinfo.txt"
grep -Eq '^Pages:[[:space:]]+1$' "$work/pdfinfo.txt"
grep -Eq '^Encrypted:[[:space:]]+no$' "$work/pdfinfo.txt"
pdftotext -layout "$work/render/output.pdf" "$work/output.txt"
grep -Fq 'Verificación documental' "$work/output.txt"
pdftoppm -f 1 -l 1 -png -r 96 "$work/render/output.pdf" "$work/pages/page"
test -s "$work/pages/page-1.png"

if command -v qpdf >/dev/null; then qpdf --check "$work/render/output.pdf" >/dev/null; fi
echo 'OK: DOCX creado/leído y PDF convertido, validado, extraído y renderizado.'
