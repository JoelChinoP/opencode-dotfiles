#!/usr/bin/env python3
"""Real DOCX/PPTX/Graphviz smoke and negative Office checks; no model calls."""
import argparse
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
skills = root / "templates/skills"
documents = skills / "document-files"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, help="new directory to keep artifacts for visual review")
args = parser.parse_args()
temporary = None
if args.output:
    work = args.output.resolve()
    work.mkdir(parents=True, exist_ok=False)
else:
    temporary = tempfile.TemporaryDirectory(prefix="opencode-visuals-")
    work = Path(temporary.name)


def run(*command):
    return subprocess.run([str(part) for part in command], check=True, capture_output=True, text=True)


def pdf_text(path):
    return run("pdftotext", path, "-").stdout


def rejects(path, expected):
    try:
        checker.check(path)
    except ValueError as error:
        assert expected in str(error), str(error)
    else:
        raise AssertionError(f"Accepted invalid package: {path}")


def alter(source, output, name, data):
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(output, "w") as changed:
        for part in original.namelist():
            changed.writestr(part, data if part == name else original.read(part))


try:
    for command in ("python", "pandoc", "libreoffice", "pdfinfo", "pdftoppm", "pdftotext", "dot", "fc-match", "slides-node"):
        assert shutil.which(command), f"Missing {command}; install the managed profile first"
    spec = importlib.util.spec_from_file_location("office_check", documents / "scripts/check_office.py")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)

    reference = work / "reference.docx"
    run("python", "-I", documents / "scripts/reference_doc.py", reference)
    checker.check(reference)
    before = reference.read_bytes()
    result = subprocess.run(["python", "-I", str(documents / "scripts/reference_doc.py"), str(reference)], capture_output=True)
    assert result.returncode != 0 and reference.read_bytes() == before, "Existing reference must survive"
    with zipfile.ZipFile(reference) as archive:
        assert b"Noto Sans" in archive.read("word/styles.xml")
        assert b"Noto Serif" in archive.read("word/styles.xml")
        assert b"PAGE" in archive.read("word/footer-editorial.xml")

    source = work / "report.md"
    source.write_text("""---
title: Revisión de entregables
subtitle: Ejemplo de informe editorial
lang: es-ES
---

# Resumen

Este informe comprueba tipografía, navegación y formatos editables. Los datos
son ilustrativos: no representan una evaluación de modelos.

## Evidencia por formato

| Entregable | Fuente editable | Verificación |
|:---|:---|:---|
| Documento | Markdown y referencia DOCX | Texto, estructura y páginas |
| Presentación | JavaScript y PPTX | Notas, gráfico nativo y diapositivas |
| Diagrama | DOT | Relaciones y renderizado |

## Decisión

- Conservar las fuentes junto al resultado.
- Revisar cada página antes de entregar.
- Corregir el origen y regenerar tras los cambios.

**Fuente:** ejemplo local con contenido sintético.
""", encoding="utf-8")
    docx = work / "report.docx"
    run("pandoc", source, f"--reference-doc={reference}", f"--output={docx}")
    checker.check(docx)
    run("bash", documents / "scripts/render.sh", docx, work / "document-review")
    assert "Revisión de entregables" in pdf_text(work / "document-review/report.pdf")
    assert len(list((work / "document-review").glob("page-*.png"))) == 1
    result = subprocess.run(["bash", str(documents / "scripts/render.sh"), str(docx), str(work / "document-review")], capture_output=True)
    assert result.returncode != 0, "Existing render directory must be rejected"

    deck = work / "deck.pptx"
    run("slides-node", skills / "presentation-slides/templates/deck.cjs", deck)
    checker.check(deck)
    with zipfile.ZipFile(deck) as archive:
        assert "ppt/charts/chart1.xml" in archive.namelist(), "Chart must remain editable"
        assert any(name.endswith(".xlsx") for name in archive.namelist()), "Chart data must be embedded"
        assert "ppt/notesSlides/notesSlide1.xml" in archive.namelist(), "Speaker notes missing"
        slide = archive.read("ppt/slides/slide1.xml")
    run("bash", documents / "scripts/render.sh", deck, work / "slide-review")
    assert len(list((work / "slide-review").glob("page-*.png"))) == 3
    assert "datos editables" in pdf_text(work / "slide-review/deck.pdf")
    shape = ET.fromstring(slide)
    offset = shape.find(f".//{{{checker.P}}}spPr/{{{checker.A}}}xfrm/{{{checker.A}}}off")
    offset.set("x", "999999999")
    alter(deck, work / "outside.pptx", "ppt/slides/slide1.xml", ET.tostring(shape))
    rejects(work / "outside.pptx", "outside slide bounds")
    alter(deck, work / "broken.pptx", "_rels/.rels", f'<Relationships xmlns="{checker.REL}"><Relationship Id="bad" Target="absent.xml" /></Relationships>')
    rejects(work / "broken.pptx", "Broken relationship")
    alter(deck, work / "entity.pptx", "ppt/slides/slide1.xml", '<!DOCTYPE x [<!ENTITY x "value">]><x>&x;</x>')
    rejects(work / "entity.pptx", "DTD/entity")

    dot = skills / "diagram-design/templates/architecture.dot"
    shutil.copy2(dot, work / "diagram.dot")
    for extension in ("svg", "png", "pdf"):
        run("dot", f"-T{extension}", "-Gdpi=160", dot, "-o", work / f"diagram.{extension}")
        assert (work / f"diagram.{extension}").stat().st_size > 0
    svg = ET.parse(work / "diagram.svg")
    assert any("Fuentes" in (node.text or "") for node in svg.iter()), "Missing diagram labels"
    assert "Producción local" in pdf_text(work / "diagram.pdf")
    for name in ("outside.pptx", "broken.pptx", "entity.pptx"):
        (work / name).unlink()
    print("OK: DOCX editorial, PPTX editable con gráfico/notas, SVG/PNG/PDF, renderizados y rechazos de regresiones.")
    if args.output:
        print(f"Revisión visual pendiente: {work}")
finally:
    if temporary:
        temporary.cleanup()
