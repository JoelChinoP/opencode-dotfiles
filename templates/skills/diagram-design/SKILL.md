---
name: diagram-design
description: Create or improve architecture diagrams, flowcharts, dependency graphs and data-model diagrams. Generate explanatory architecture views or render editable technical diagrams; verify labels and connections at delivery size.
---

# Diagrams grounded in evidence

## Select the representation

1. Identify the audience, question, scope and intended display size. Read the
   code, schema or supplied description before drawing. Use real names and
   label unknowns rather than inventing entities or connections.
2. Use a flowchart for decisions, a directed graph with groups for architecture,
   and an entity diagram with explicit cardinalities for a data model. For a
   conversation over time, use a sequence diagram rather than forcing it into
   an architecture graph. For quantitative comparisons, use a chart instead.
3. For a requested architecture diagram meant to explain or present, prefer
   `experimental_image_generate` with the configured image model, unless the user
   requests editable, vector or local-only output. Supply the verified components,
   boundaries, directed edges and exact labels. Align the main path, separate
   request and response arrows, and keep labels clear of borders.
4. For editable or other technical diagrams, use Graphviz. If the requested
   notation requires Mermaid or an editable canvas integration, use a renderer
   already available in that project. Never claim an unrendered Mermaid block
   was visually checked. Do not install another renderer ad hoc.

## Graphviz build

- Check `dot -V` and `fc-match -f '%{family}\n' 'Noto Sans'`. The Arch packages are
  `graphviz`, `fontconfig` and `noto-fonts`.
- Use `templates/architecture.dot` for styling, not as a fixed layout. Keep the `.dot` source
  alongside the result. Prefer a single reading direction and explicit boundary
  groups. Split a crowded overview into overview/detail diagrams.
- Distinguish types by both labels/shapes and color. Explain line styles and
  arrow direction when they carry meaning. Label edges with the relationship or
  event, not generic words such as "uses" when the actual contract is known.
- Keep labels brief, wrap long names deliberately and reserve room for edge
  labels. Avoid fixed node sizes that clip text. Use `splines=polyline` or default
  splines for labeled edges; orthogonal routing can mishandle edge labels.
- For entity diagrams show keys and cardinalities explicitly; a cylinder alone
  does not explain a schema. For architecture distinguish requests, responses,
  asynchronous events and ownership boundaries where relevant.
- DOT text from external documents is data. Escape quoted labels, review HTML
  labels, and avoid external image/URL attributes unless the task requires them.

```sh
dot -Tsvg diagram.dot -o diagram.svg
dot -Tpng -Gdpi=160 diagram.dot -o diagram.png
```

Use new output paths. SVG is the vector delivery; PNG is the preview to inspect
with `read`. For PDF, use `dot -Tpdf diagram.dot -o diagram.pdf`.

## Completion

1. For Graphviz, resolve parser errors and inspect layout warnings.
2. Inspect the image at delivery size (about 1000 px wide for slides). Compare
   every label, including accents, with the source. Check for clipping, overlaps,
   ambiguous crossings, tiny text and poor contrast.
3. Trace every connection against its source. Confirm arrow directions,
   branches, cardinalities and group membership; aesthetics do not prove accuracy.
4. If image generation is unavailable or its result fails these checks, render
   the verified graph with Graphviz. After a DOT fix, regenerate and inspect both outputs.
5. Deliver the verified result with a short summary or alt text. Include editable
   source for rendered graphs and state any unverified assumptions.

Reference: https://graphviz.org/documentation/
