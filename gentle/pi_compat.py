#!/usr/bin/env python3
"""Quitar recursos Gentle redundantes antes de ejecutar el Pi fijado."""
import os
from pathlib import Path
import sys


def arguments_without_duplicates(arguments, package_root):
    boundary = arguments.index("--") if "--" in arguments else len(arguments)
    options = arguments[:boundary]
    package = Path(package_root).resolve()
    loaded_as_package = any(
        value in ("-e", "--extension") and index + 1 < len(options)
        and Path(options[index + 1]).resolve() == package
        for index, value in enumerate(options)
    )
    if not loaded_as_package:
        return arguments
    # Ponytail: solo la inyección de carpetas del mismo paquete; retirar cuando
    # Gentle Shell corrija su launcher. No filtrar recursos ajenos ni tras --.
    redundant = {
        "--skill": package / "skills",
        "--prompt-template": package / "prompts",
        "--theme": package / "themes",
    }
    result = []
    index = 0
    while index < len(options):
        value = options[index]
        if value in redundant and index + 1 < len(options):
            if Path(options[index + 1]).resolve() == redundant[value]:
                index += 2
                continue
        result.append(value)
        index += 1
    return result + arguments[boundary:]


if __name__ == "__main__":
    executable, package_root = sys.argv[1:3]
    arguments = arguments_without_duplicates(sys.argv[3:], package_root)
    os.execv(executable, [executable, *arguments])
