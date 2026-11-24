"""Generate an editorial DOCX reference from Pandoc's own template; stdlib only."""
import io
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
ET.register_namespace("w", W)
ET.register_namespace("r", R)


def child(parent, name, **attributes):
    element = parent.find(f"{{{W}}}{name}")
    if element is None:
        element = ET.SubElement(parent, f"{{{W}}}{name}")
    element.attrib.update({f"{{{W}}}{key}": str(value) for key, value in attributes.items()})
    return element


def typography(properties, font, size, color="243746"):
    fonts = child(properties, "rFonts")
    fonts.attrib.clear()  # Theme font attributes would override the chosen family.
    fonts.attrib.update({f"{{{W}}}{key}": font for key in ("ascii", "hAnsi", "cs", "eastAsia")})
    child(properties, "sz", val=size)
    child(properties, "szCs", val=size)
    child(properties, "color", val=color)


def create(output):
    template = subprocess.check_output(["pandoc", "--print-default-data-file=reference.docx"])
    with zipfile.ZipFile(io.BytesIO(template)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    styles = ET.fromstring(parts["word/styles.xml"])
    defaults = child(child(styles, "docDefaults"), "rPrDefault")
    typography(child(defaults, "rPr"), "Noto Sans", 22)
    for style in styles.findall(f"{{{W}}}style"):
        name = style.get(f"{{{W}}}styleId")
        if name in {"Normal", "BodyText", "FirstParagraph", "Compact"}:
            typography(child(style, "rPr"), "Noto Sans", 22)
            paragraph = child(style, "pPr")
            child(paragraph, "spacing", after=140, line=276, lineRule="auto")
            child(paragraph, "widowControl")
        elif name in {"Title", "Heading1", "Heading2", "Heading3"}:
            size = {"Title": 56, "Heading1": 36, "Heading2": 28, "Heading3": 24}[name]
            typography(child(style, "rPr"), "Noto Serif", size, "183A37")
            paragraph = child(style, "pPr")
            child(paragraph, "keepNext")
            child(paragraph, "keepLines")
            child(paragraph, "spacing", before=280, after=120)
        elif name in {"Subtitle", "Caption", "TableCaption", "ImageCaption"}:
            typography(child(style, "rPr"), "Noto Sans", 20, "53636B")
        elif name == "Table":
            table = child(style, "tblPr")
            margins = child(table, "tblCellMar")
            for side in ("top", "left", "bottom", "right"):
                child(margins, side, w=100, type="dxa")

    document = ET.fromstring(parts["word/document.xml"])
    section = document.find(f".//{{{W}}}sectPr")
    if section is None:
        raise ValueError("Pandoc reference has no section properties")
    child(section, "pgSz", w=11906, h=16838)
    child(section, "pgMar", top=1134, right=1134, bottom=1134, left=1134, header=567, footer=567, gutter=0)
    for old in section.findall(f"{{{W}}}footerReference"):
        section.remove(old)
    section.insert(0, ET.Element(f"{{{W}}}footerReference", {f"{{{W}}}type": "default", f"{{{R}}}id": "rIdEditorialFooter"}))

    footer = ET.Element(f"{{{W}}}ftr")
    paragraph = child(footer, "p")
    child(child(paragraph, "pPr"), "jc", val="center")
    field = ET.SubElement(paragraph, f"{{{W}}}fldSimple", {f"{{{W}}}instr": " PAGE "})
    run = child(field, "r")
    typography(child(run, "rPr"), "Noto Sans", 18, "53636B")
    child(run, "t").text = "1"
    relationships = ET.fromstring(parts["word/_rels/document.xml.rels"])
    ET.SubElement(relationships, f"{{{PKG}}}Relationship", {
        "Id": "rIdEditorialFooter", "Type": f"{R}/footer", "Target": "footer-editorial.xml",
    })
    types = ET.fromstring(parts["[Content_Types].xml"])
    ET.SubElement(types, f"{{{CT}}}Override", {
        "PartName": "/word/footer-editorial.xml",
        "ContentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
    })
    for name, element in {
        "word/styles.xml": styles, "word/document.xml": document,
        "word/footer-editorial.xml": footer, "word/_rels/document.xml.rels": relationships,
        "[Content_Types].xml": types,
    }.items():
        if element in (relationships, types):
            ET.register_namespace("", PKG if element is relationships else CT)
        parts[name] = ET.tostring(element, encoding="utf-8", xml_declaration=True)
    with Path(output).open("xb") as stream, zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in parts.items():
            archive.writestr(name, content)


if __name__ == "__main__":
    if len(sys.argv) != 2 or Path(sys.argv[1]).suffix.lower() != ".docx":
        raise SystemExit("Usage: python -I reference_doc.py NEW-REFERENCE.docx")
    try:
        create(sys.argv[1])
    except (OSError, ValueError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        raise SystemExit(str(error)) from error
