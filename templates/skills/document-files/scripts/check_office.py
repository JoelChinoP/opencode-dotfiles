"""Basic DOCX/PPTX package checks, without extracting files or fetching targets."""
from pathlib import Path, PurePosixPath
import posixpath
import sys
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET
import zipfile

P = "http://schemas.openxmlformats.org/presentationml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def check(path):
    suffix = Path(path).suffix.lower()
    main = {".docx": "word/document.xml", ".pptx": "ppt/presentation.xml"}.get(suffix)
    if main is None:
        raise ValueError("Only .docx and .pptx are supported")
    with zipfile.ZipFile(path) as archive:
        files = archive.infolist()
        if len(files) > 10000 or sum(item.file_size for item in files) > 128 * 1024 * 1024:
            raise ValueError("Package exceeds the basic check's 10,000-part / 128 MiB limit")
        names = set(archive.namelist())
        if len(names) != len(files):
            raise ValueError("Duplicate ZIP members")
        for name in names:
            if name.startswith("/") or ".." in PurePosixPath(name).parts or "\\" in name:
                raise ValueError(f"Invalid package path: {name}")
            if name.lower().endswith("vbaproject.bin"):
                raise ValueError("Macro-enabled packages are outside this workflow")
        required = {"[Content_Types].xml", "_rels/.rels", main}
        if not required <= names:
            raise ValueError(f"Missing required parts: {sorted(required - names)}")
        if archive.testzip() is not None:
            raise ValueError("ZIP CRC check failed")
        xml = {}
        for name in names:
            if name.endswith((".xml", ".rels")):
                data = archive.read(name)
                text = data.decode("utf-16" if data.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig")
                if "\x00" in text or "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
                    raise ValueError(f"DTD/entity declarations are unsupported: {name}")
                try:
                    xml[name] = ET.fromstring(data)
                except ET.ParseError as error:
                    raise ValueError(f"Invalid XML in {name}: {error}") from error
        for name, root in xml.items():
            if not name.endswith(".rels"):
                continue
            directory = posixpath.dirname(posixpath.dirname(name))
            ids = set()
            for relation in root.findall(f"{{{REL}}}Relationship"):
                identity = relation.get("Id")
                if not identity or identity in ids:
                    raise ValueError(f"Missing or duplicate relationship ID in {name}")
                ids.add(identity)
                if relation.get("TargetMode") == "External":
                    continue
                target = unquote(urlsplit(relation.get("Target", "")).path)
                resolved = posixpath.normpath(posixpath.join(directory, target)) if not target.startswith("/") else target.lstrip("/")
                if not target or resolved not in names:
                    raise ValueError(f"Broken relationship in {name}: {target}")
        if suffix == ".pptx":
            size = xml[main].find(f"{{{P}}}sldSz")
            if size is None:
                raise ValueError("Missing slide dimensions")
            width, height = int(size.get("cx")), int(size.get("cy"))
            slides = [name for name in xml if name.startswith("ppt/slides/slide") and name.endswith(".xml")]
            if not slides:
                raise ValueError("Presentation has no slides")
            for name in slides:
                tree = xml[name].find(f"{{{P}}}cSld/{{{P}}}spTree")
                if tree is None:
                    raise ValueError(f"Missing shape tree: {name}")
                for shape in tree:
                    # shortcut: simple, unrotated top-level shapes only; use visual QA for groups and rotation.
                    if shape.tag == f"{{{P}}}grpSp":
                        continue
                    transform = shape.find(f"{{{P}}}spPr/{{{A}}}xfrm")
                    if transform is None:
                        transform = shape.find(f"{{{P}}}xfrm")
                    if transform is None or transform.get("rot", "0") != "0":
                        continue
                    offset, extent = transform.find(f"{{{A}}}off"), transform.find(f"{{{A}}}ext")
                    if offset is None or extent is None:
                        continue
                    x, y, w, h = (int(value) for value in (offset.get("x"), offset.get("y"), extent.get("cx"), extent.get("cy")))
                    if min(x, y, w, h) < 0 or x + w > width + 9144 or y + h > height + 9144:
                        raise ValueError(f"Shape outside slide bounds: {name}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -I check_office.py FILE.docx|FILE.pptx")
    try:
        check(sys.argv[1])
    except (OSError, ValueError, TypeError, ET.ParseError, zipfile.BadZipFile, RuntimeError) as error:
        raise SystemExit(str(error)) from error
    print("OK: basic Office package checks; visual review is still required.")
