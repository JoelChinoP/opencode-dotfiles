---
name: presentation-slides
description: Create and improve slide decks and editable PowerPoint presentations (.pptx). Use for slides, presentations, pitch decks, speaker notes, and exporting a deck to PDF, with layout planning and visual review.
---

# Editable presentations

Use the managed `slides-node` runtime (PptxGenJS 4.0.1). Supporting files are
relative to this skill. Load `document-files` for its shared Office checks and
rendering script; use that skill's returned base directory, not a guessed path.

## Plan the deck

1. Establish audience, decision/message, duration, language, aspect ratio and
   required output. Ask only for missing information that changes the result.
2. Read supplied material and reference slides. Preserve facts, units, dates and
   sources; label illustrative data. Never invent evidence to fill a layout.
3. Write a compact slide-by-slide outline: takeaway, evidence, visual and layout.
   Each slide should advance the story. Move supporting detail to speaker notes.
4. Set a coherent palette, type scale and grid suited to the subject or supplied
   brand. Use contrast, alignment and whitespace to establish hierarchy. Prefer
   one clear visual argument over a collection of decorative cards.

Read `references/design.md` before creating a new deck or materially redesigning
one. For a small edit, keep the existing visual language.

## Build

- Check `slides-node -p 'new (require("pptxgenjs"))().version'` and
  `fc-match -f '%{family}\n' 'Noto Sans'`. A substituted font changes text fit.
- Copy `templates/deck.cjs` into the task directory, replace its example content
  and run `slides-node deck.cjs output.pptx`. Keep the edited generator with the
  delivery so the deck is reproducible. The example is a starting point, not a
  fixed visual style for every topic.
- Use native text, shapes, tables and charts whenever they express the content.
  Rasterize only illustrations that need it, not whole slides. Include chart
  units and sources; put detailed citations and assumptions in `addNotes()`.
- PptxGenJS creates decks; it does not import existing PPTX files. For an existing
  deck, inspect its rendered slides and use an available editing integration or
  agree on reconstruction. Preserve the original and disclose fidelity changes.
- Font names in a PPTX do not embed font files. Default to Noto Sans on this
  profile, verify any requested font locally, and deliver a PDF when the recipient
  needs fixed appearance. Record fonts the recipient needs for editable output.
- Never bootstrap packages from the skill. If `slides-node` is missing, use the
  repository installer; dependencies live in a locked, isolated npm runtime.

## Verify before delivery

1. Run `python -I "$DOCUMENT_SKILL/scripts/check_office.py" output.pptx` using
   the base directory obtained when loading `document-files`. It checks the ZIP,
   XML, internal relationships and simple slide bounds, not full Office conformance.
2. Run `bash "$DOCUMENT_SKILL/scripts/render.sh" output.pptx "$PWD/review-01"`.
   The review directory must be new. It contains the PDF, extracted text and an
   image of every slide. Never reuse old images after changing the generator.
3. Compare extracted text with the outline and source. Check native chart data,
   labels, units, notes and slide order; remove all example/placeholder content.
4. Read **every slide image**. Inspect text fit, collisions, chart readability,
   contrast, alignment, margins and visual consistency at presentation scale.
   If a slide is crowded, simplify or split the content before shrinking text.
5. Fix defects in the generator, rebuild, rerender to a new directory and inspect
   the changed slides. Visual QA is part of completion, including in minimal-code
   modes. A successful export or ZIP check alone is not visual approval.
6. Deliver the requested files and editable source. State the checks actually
   performed and any font/rendering limitation; do not claim PowerPoint testing
   when only LibreOffice was used.
