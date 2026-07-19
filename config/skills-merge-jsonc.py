#!/usr/bin/env python3
"""
skills-merge-jsonc.py - merge profundo de dos archivos JSONC.

Uso:
    python3 skills-merge-jsonc.py BASE OVERLAY [--remove-plugin NAME] > OUT

El OVERLAY gana en colisiones de hojas; los dicts se mergean recursivamente.
Usa json5 para tolerar comments del JSONC (// y /*..*/) y trailing commas.
El BASE puede no existir o estar vacio (se trata como {}).

Imprime JSON estandar en stdout (los comments del BASE se pierden — los
comments del OVERLAY van a un .tmpl junto al script, no aqui).
"""
import json
import pathlib
import sys

try:
    import json5
except ImportError:
    print("ERROR: falta el paquete 'json5'. Instalalo en el venv de skills:", file=sys.stderr)
    print("  ~/.venvs/opencode-skills/bin/pip install json5", file=sys.stderr)
    sys.exit(2)


def deep_merge(a, b):
    """Mergea b dentro de a in-place. b gana en colisiones de hojas."""
    for key, value in b.items():
        if isinstance(value, dict) and isinstance(a.get(key), dict):
            deep_merge(a[key], value)
        elif key == "plugin" and isinstance(value, list) and isinstance(a.get(key), list):
            a[key].extend(item for item in value if item not in a[key])
        else:
            a[key] = value
    return a


def load(path):
    p = pathlib.Path(path)
    if not p.exists():
        return {}
    text = p.read_text(encoding="utf-8").strip()
    if not text:
        return {}
    return json5.loads(text)


def main():
    if len(sys.argv) not in (3, 5) or (len(sys.argv) == 5 and sys.argv[3] != "--remove-plugin"):
        print(f"Uso: {sys.argv[0]} BASE OVERLAY [--remove-plugin NAME] > OUT", file=sys.stderr)
        sys.exit(2)
    base = load(sys.argv[1])
    overlay = load(sys.argv[2])
    if not isinstance(base, dict):
        print(f"ERROR: {sys.argv[1]} no es un objeto JSON", file=sys.stderr)
        sys.exit(1)
    if not isinstance(overlay, dict):
        print(f"ERROR: {sys.argv[2]} no es un objeto JSON", file=sys.stderr)
        sys.exit(1)
    merged = deep_merge(base, overlay)
    if len(sys.argv) == 5:
        plugin = sys.argv[4]
        plugins = merged.get("plugin")
        if isinstance(plugins, list):
            plugins = [item for item in plugins if item != plugin]
            if plugins:
                merged["plugin"] = plugins
            else:
                merged.pop("plugin", None)
    json.dump(merged, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
