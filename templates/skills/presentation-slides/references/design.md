# Presentation design and implementation

## Content and composition

- Lead with the audience's question or decision, then show the evidence and the
  next action. Slide titles should communicate a takeaway, not just a category.
- Choose the visual from the information: time series for change, bars for
  comparison, a diagram for relationships, a table for lookup, a short statement
  when the statement itself is the point. Avoid decorative charts and invented data.
- Keep comparable items on the same scale. Label axes and units, explain unusual
  baselines, and distinguish measured values from forecasts.
- Plan a few complementary layouts (opening, evidence, process, conclusion).
  Vary them when the content changes, while preserving type, spacing and palette.
- Default to 16:9, about 0.6 inches of outer clearance, 32–40 pt titles and
  20–24 pt main text. Small source notes may use 12–14 pt. Adjust for the real
  screen and audience; moving detail to notes beats making body text tiny.
- Use a restrained palette with semantic roles: background, text, muted text and
  emphasis. Color must not be the only way to distinguish outcomes or series.
- Give dense tables their own slide or appendix. Never put a screenshot of a
  spreadsheet on a slide and assume its contents remain readable.

## PptxGenJS conventions

- Set `layout = "LAYOUT_WIDE"` and `theme` before adding slides. This canvas is
  approximately 13.333 × 7.5 inches; coordinates and sizes use inches, fonts use pt.
- Use six-digit RGB strings without `#`. Express alpha through the relevant
  transparency option. Build fresh options objects for separate elements.
- Set text box margins explicitly when aligning text to the grid. Leave room for
  font substitution and wrapping; preview the final text, not placeholder lengths.
- Use `addChart()` for editable charts and `addTable()` for editable tables.
  Check the current PptxGenJS documentation for advanced chart options instead of
  assuming every Office feature is supported.
- `addNotes()` holds presenter detail. `writeFile({ fileName })` is asynchronous;
  await it and propagate failures. Write to a new output path.
- An intentional full-bleed background can touch the canvas edge. Text and normal
  content should remain inside the safe area. The basic bounds checker does not
  understand rotated/grouped shapes or text wrapping; image review is essential.

Official API: https://gitbrent.github.io/PptxGenJS/docs/usage/
