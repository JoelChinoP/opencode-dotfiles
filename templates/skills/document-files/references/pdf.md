# PDF workflow

## Inspect and extract

1. Use OpenCode `read` for ordinary reading and visual inspection.
2. Use `pdfinfo input.pdf` for page count, encryption, page size, and metadata.
3. Use `pdftotext -layout input.pdf output.txt` when layout-aware plain text is
   needed. Limit pages with `-f FIRST -l LAST` for large documents.
4. Use `pdftoppm -f FIRST -l LAST -jpeg -r 120 input.pdf page` only for pages
   that need visual inspection or OCR; do not render an entire large PDF by
   default.

Empty or nonsensical extracted text usually means the PDF is scanned. For OCR,
render the required pages and run Tesseract with an explicit language, for
example `tesseract page-1.jpg stdout -l spa`. Never invent unreadable text;
mark uncertain OCR and preserve page references.

## Page operations with qpdf

Write a new file and validate it with `qpdf --check output.pdf` plus `pdfinfo`.

```sh
# Merge complete files.
qpdf --empty --pages first.pdf second.pdf -- merged.pdf

# Extract a range.
qpdf input.pdf --pages . 1-5 -- pages-1-5.pdf

# Rotate page 1 clockwise.
qpdf input.pdf rotated.pdf --rotate=+90:1
```

Do not remove encryption without confirmed authorization. Never place a
password in a command, repository, log, or generated script; ask the user to
handle sensitive credentials through an appropriate interactive mechanism.

## Create and verify

For text-first documents, keep Markdown as the editable source, create DOCX
with the DOCX workflow, and convert that DOCX to PDF with headless LibreOffice.
This avoids adding a TeX or Python PDF stack.

After creation:

1. Run `qpdf --check output.pdf` and `pdfinfo output.pdf`.
2. Render representative pages with `pdftoppm`.
3. Inspect the images for clipping, missing glyphs, broken tables, blank pages,
   and unintended page breaks.

Poppler is required for `pdfinfo`, `pdftotext`, and `pdftoppm`; qpdf and
Tesseract are optional capabilities.
