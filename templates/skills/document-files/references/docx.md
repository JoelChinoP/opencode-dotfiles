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

Keep Markdown as the source and generate a new DOCX:

```sh
pandoc source.md --output=output.docx
```

When the user supplies an approved style template:

```sh
pandoc source.md --reference-doc=reference.docx --output=output.docx
```

Use semantic Markdown headings, lists, tables, captions, and alt text. Do not
fake layout with repeated spaces or literal bullet characters. Do not use an
untrusted reference document or macro-enabled Office file.

## Validate and render

Test the ZIP container using Python's standard library:

```sh
python -I -m zipfile -t output.docx
```

Render through a task-local LibreOffice profile so a running desktop instance
does not share state with the conversion:

```sh
mkdir -p /tmp/opencode-doc-profile /tmp/opencode-doc-render
libreoffice -env:UserInstallation=file:///tmp/opencode-doc-profile \
  --headless --convert-to pdf --outdir /tmp/opencode-doc-render output.docx
```

Use unique task-local directories rather than the literal example when jobs
may overlap. Render representative PDF pages with `pdftoppm` and inspect them
for clipping, missing fonts, malformed tables, blank pages, header/footer
problems, and bad page breaks.

## Convert existing DOCX to PDF

Use the same isolated LibreOffice command and preserve the DOCX. Validate the
result using the PDF workflow. Conversion can reflow fonts not installed on
the machine; disclose that limitation instead of claiming pixel equivalence.

This base workflow intentionally does not edit arbitrary OOXML in place or
promise preservation of comments, revisions, content controls, embedded
objects, or complex forms.
