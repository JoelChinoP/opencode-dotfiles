#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 ]] || { echo 'Usage: bash render.sh INPUT.docx|INPUT.pptx|INPUT.pdf NEW-REVIEW-DIR' >&2; exit 2; }
input="$(realpath -- "$1")"
[[ -f $input ]] || { echo 'Input file not found.' >&2; exit 1; }
case "${input,,}" in
  *.docx|*.pptx|*.pdf) ;;
  *) echo 'Supported inputs: DOCX, PPTX and PDF.' >&2; exit 2 ;;
esac
for command in python libreoffice pdfinfo pdftotext pdftoppm timeout; do
  command -v "$command" >/dev/null || { printf 'Missing command: %s\n' "$command" >&2; exit 1; }
done
mkdir -- "$2" # A new directory prevents stale previews from passing review.
review="$(realpath -- "$2")"
profile="$(mktemp -d "$review/.lo-profile.XXXXXXXX")"
trap 'rm -rf -- "$profile"' EXIT
if [[ ${input,,} == *.pdf ]]; then
  pdf="$review/$(basename -- "$input")"
  cp -- "$input" "$pdf"
else
  profile_uri="$(python -I -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).as_uri())' "$profile")"
  timeout --kill-after=5s 120s libreoffice "-env:UserInstallation=$profile_uri" \
    --headless --convert-to pdf --outdir "$review" "$input" >/dev/null
  name="$(basename -- "$input")"
  pdf="$review/${name%.*}.pdf"
fi
[[ -s $pdf ]] || { echo 'Conversion did not produce a PDF.' >&2; exit 1; }
pdfinfo "$pdf" >"$review/info.txt"
pdftotext -layout "$pdf" "$review/text.txt"
pdftoppm -r 120 -png "$pdf" "$review/page"
if command -v qpdf >/dev/null; then qpdf --check "$pdf" >/dev/null; fi
printf '%s\n' "$review"/page-*.png
