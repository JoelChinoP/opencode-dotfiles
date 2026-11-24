# DOCX workflow

## Read

Extract readable content without changing the original:

```sh
pandoc input.docx --to=gfm --output=extracted.md
```

Pandoc is suitable for content review, not for proving exact Word layout,
tracked-change state, comments, or advanced field behavior. State that limit
when it matters.

## Create

Keep Markdown as the source. Use the approved reference if supplied, otherwise
generate the editorial reference from this skill (`$DOCUMENT_SKILL` is the base
directory returned by the skill tool):

```sh
python -I "$DOCUMENT_SKILL/scripts/reference_doc.py" reference.docx
pandoc source.md --reference-doc=reference.docx --output=output.docx
```

Use document metadata rather than manually styled title paragraphs:

```yaml
---
title: Informe de operaciones
subtitle: Resultados y decisiones
lang: es-ES
---
```

Use semantic Markdown headings, lists, tables, captions, and alt text. Do not
fake layout with repeated spaces or literal bullet characters. Do not use an
untrusted reference document or macro-enabled Office file.

## Validate and render

Check the package without extracting it:

```sh
python -I "$DOCUMENT_SKILL/scripts/check_office.py" output.docx
```

Render through the shared helper. It isolates LibreOffice, rejects an existing
review directory and produces PDF, text and an image of every page:

```sh
bash "$DOCUMENT_SKILL/scripts/render.sh" output.docx "$PWD/review-01"
```

Read the printed image paths. Inspect every page of a new document for clipping,
missing fonts, malformed tables, blank pages, header/footer problems and bad page
breaks. After a correction, rebuild and render into a new review directory.

## Convert existing DOCX to PDF

Use the same isolated rendering helper and preserve the DOCX. Validate the
result using the PDF workflow. Conversion can reflow fonts not installed on
the machine; disclose that limitation instead of claiming pixel equivalence.

This base workflow intentionally does not edit arbitrary OOXML in place or
promise preservation of comments, revisions, content controls, embedded
objects, or complex forms.
