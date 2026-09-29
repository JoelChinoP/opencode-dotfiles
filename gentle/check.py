#!/usr/bin/env python3
"""Validación local sin red, setup, autenticación ni llamadas a modelos."""
import argparse
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import install


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--installed", action="store_true", help="validar también el perfil instalado")
    args = parser.parse_args()
    versions, settings, profiles = install.templates()
    assert profiles["active"] == "daily"
    assert set(profiles["profiles"]) == {"daily", "performance", "deep"}
    role_sets = [set(roles) for roles in profiles["profiles"].values()]
    assert all(roles == role_sets[0] for roles in role_sets), "Los perfiles deben cubrir los mismos roles"
    for name, roles in profiles["profiles"].items():
        for role, entry in roles.items():
            assert entry["model"] in settings["enabledModels"], (name, role)
        assert "orchestrator" in roles and "review-refuter" in roles and "review-validator" in roles
    assert all("astra" not in entry["model"] for entry in profiles["profiles"]["daily"].values())
    assert profiles["profiles"]["daily"]["gentle-ai-explore"]["thinking"] == "medium"
    assert profiles["profiles"]["performance"]["gentle-ai-worker"] == {
        "model": "openai-codex/gpt-6-sol", "thinking": "xhigh"
    }
    for role in ("gentle-ai-explore", "sdd-explore", "sdd-onboard", "sdd-research"):
        assert profiles["profiles"]["deep"][role] == {
            "model": "openai-codex/gpt-6-sol", "thinking": "high"
        }, role
    assert settings["compaction"]["reserveTokens"] > settings["compaction"]["keepRecentTokens"]
    print(f"OK: versiones, ajustes y {len(role_sets[0])} asignaciones por perfil")
    if args.installed:
        paths = install.layout(versions)
        install.preflight_existing(paths)
        companions = install.verify_installed(paths, versions)
        for name in ("gsh", "gsh-last"):
            assert os.access(paths["bin"] / name, os.X_OK), f"Falta ejecutable {name}"
        print(f"OK: archivos instalados y complementos {companions}")
        settings = install.read_json(paths["agent"] / "settings.json")
        cap = install.read_json(paths["agent"] / "subagents.json")["max_concurrency"]
        print(f"Inicio: {settings.get('defaultProvider')}/{settings.get('defaultModel')} "
              f"{settings.get('defaultThinkingLevel')}; concurrencia configurada: {cap}")
        print("La carga efectiva, OAuth, cuota, delegación y RDD se comprueban dentro de gsh; consulta README.md.")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, OSError, ValueError) as error:
        raise SystemExit(f"Error: {error}") from error
