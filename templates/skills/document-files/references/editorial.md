# Editorial layout

## Before writing

Establish the reader, purpose, required format and length. Read the source facts,
brand/reference document and delivery constraints. Ask only for consequential
missing information; otherwise use reasonable defaults and state them briefly.

Plan the information hierarchy: title and summary, sections in reading order,
evidence/tables, conclusions or actions, references. A short memo rarely needs a
separate cover or table of contents. A long report needs navigation and page numbers.

## Reproducible starting point

When no approved reference is supplied, `scripts/reference_doc.py` generates an
A4 Pandoc reference with 20 mm margins, Noto Sans body text, Noto Serif headings,
table cell spacing, heading keep-with-next and a page-number footer. It uses
Pandoc's own reference document and Python's standard library. Run it into the
task directory, not the skill directory, and keep it with the editable source.

Check the real font match, not just command availability:

```sh
fc-match -f '%{family}\n' 'Noto Sans'
fc-match -f '%{family}\n' 'Noto Serif'
```

A different family means substitution. The Arch packages are `fontconfig` and
`noto-fonts`. For a supplied brand, copy and adapt the local generator or use the
approved reference DOCX; don't override brand decisions with these defaults.
Word recipients also need the selected fonts; a PDF preserves the rendered result.

## Composition

- Use semantic heading levels and consistent paragraph/list styles. Keep body
  text readable (normally 10.5–12 pt) and lines a comfortable length.
- Use actual tables for comparisons and actual lists for lists. Give columns
  meaningful headings and units; avoid dense tables squeezed onto portrait pages.
- Include descriptive captions and alt text for meaningful illustrations. A
  diagram's labels must remain readable at the inserted size; split if necessary.
- Keep headings with their following content. Watch widows/orphans, split table
  rows, nearly blank pages and inconsistent header/footer placement.
- Sources, dates, totals and names must agree with supplied material. Mark
  assumptions and sample data instead of inventing missing evidence.

## Acceptance

Check the editable document's structure, then render and read its pages. Review
the extracted text for omissions and the images for layout. Fix the Markdown or
reference, regenerate and inspect the affected pages again. For a long document,
review images in batches rather than silently sampling a few pages. If review
cannot be completed, say which pages remain unchecked.

Basic ZIP/XML/relationship checks are not full OOXML schema validation, and a
LibreOffice render is not a guarantee of identical Microsoft Word pagination.
