#!/usr/bin/env python3
"""
skills-merge-jsonc.py - merge profundo de dos archivos JSONC.

Uso:
    python3 skills-merge-jsonc.py BASE OVERLAY \
        [--remove-plugin NAME] [--remove-agent NAME] > OUT

El OVERLAY gana en colisiones de hojas; los dicts se mergean recursivamente.
Los plugins se identifican por nombre de paquete (sin version): si BASE ya
tenia el mismo plugin, la entrada administrada del OVERLAY la reemplaza en vez
de duplicarla.
Usa json5 para tolerar comments del JSONC (// y /*..*/) y trailing commas.
El BASE puede no existir o estar vacio (se trata como {}).

Imprime JSON estandar en stdout (los comments del BASE se pierden — los
comments del OVERLAY van a un .tmpl junto al script, no aqui).
"""
import json
import pathlib
import sys
import argparse

try:
    import json5
except ImportError:
    print("ERROR: falta el paquete 'json5'. Instalalo en el venv de skills:", file=sys.stderr)
    print("  ~/.venvs/opencode-skills/bin/pip install json5", file=sys.stderr)
    sys.exit(2)


def plugin_spec(item):
    """Devuelve el spec npm de una entrada string o [spec, options]."""
    if isinstance(item, str):
        return item
    if isinstance(item, list) and item and isinstance(item[0], str):
        return item[0]
    return None


def plugin_identity(item):
    """Normaliza package@version a package sin romper paquetes scoped."""
    spec = plugin_spec(item)
    if not spec:
        return None
    if spec.startswith(("file:", "http:", "https:", "git:", "github:", "/", ".")):
        return spec
    if spec.startswith("@"):
        slash = spec.find("/")
        version_at = spec.rfind("@")
        return spec[:version_at] if slash >= 0 and version_at > slash else spec
    version_at = spec.rfind("@")
    return spec[:version_at] if version_at > 0 else spec


def merge_plugins(base, overlay):
    """Conserva el orden y reemplaza entradas del mismo paquete."""
    result = list(base)
    for candidate in overlay:
        identity = plugin_identity(candidate)
        match = next(
            (index for index, current in enumerate(result)
             if identity is not None and plugin_identity(current) == identity),
            None,
        )
        if match is None:
            if candidate not in result:
                result.append(candidate)
        else:
            result[match] = candidate
    return result


def deep_merge(a, b):
    """Mergea b dentro de a in-place. b gana en colisiones de hojas."""
    for key, value in b.items():
        if isinstance(value, dict) and isinstance(a.get(key), dict):
            deep_merge(a[key], value)
        elif key == "plugin" and isinstance(value, list) and isinstance(a.get(key), list):
            a[key] = merge_plugins(a[key], value)
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
    parser = argparse.ArgumentParser(description="Merge profundo de JSONC")
    parser.add_argument("base")
    parser.add_argument("overlay")
    parser.add_argument("--remove-plugin", action="append", default=[])
    parser.add_argument("--remove-agent", action="append", default=[])
    args = parser.parse_args()

    base = load(args.base)
    overlay = load(args.overlay)
    if not isinstance(base, dict):
        print(f"ERROR: {args.base} no es un objeto JSON", file=sys.stderr)
        sys.exit(1)
    if not isinstance(overlay, dict):
        print(f"ERROR: {args.overlay} no es un objeto JSON", file=sys.stderr)
        sys.exit(1)
    merged = deep_merge(base, overlay)

    for plugin in args.remove_plugin:
        plugins = merged.get("plugin")
        if isinstance(plugins, list):
            target = plugin_identity(plugin)
            plugins = [item for item in plugins if plugin_identity(item) != target]
            if plugins:
                merged["plugin"] = plugins
            else:
                merged.pop("plugin", None)

    agents = merged.get("agent")
    if isinstance(agents, dict):
        for agent in args.remove_agent:
            agents.pop(agent, None)
        if not agents:
            merged.pop("agent", None)

    json.dump(merged, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
