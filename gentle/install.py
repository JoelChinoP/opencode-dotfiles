#!/usr/bin/env python3
"""Instalación standalone para Arch; solo biblioteca estándar de Python."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parent
LAUNCHER_MARKER = "# gentle-dotfiles launcher"
BEGIN = "# >>> gentle-dotfiles >>>"
END = "# <<< gentle-dotfiles <<<"
AGENTS_BEGIN = "<!-- gentle-dotfiles:begin -->"
AGENTS_END = "<!-- gentle-dotfiles:end -->"
COMPANIONS = ("gentle-engram", "pi-mcp-adapter", "pi-web-access", "pi-btw")
PROFILE_RENAMES = {"diario": "daily", "rendimiento": "performance", "profundo": "deep"}


def read_json(path):
    if not path.exists():
        return {}
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"Se esperaba un objeto JSON: {path}")
    return value


def write_file(path, text, mode=0o600):
    # Conservar enlaces del usuario y sustituir atómicamente su destino.
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text() == text:
        if stat.S_IMODE(path.stat().st_mode) != mode:
            path.chmod(mode)
        return
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(text)
            stream.flush()
            os.fchmod(stream.fileno(), mode)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def write_json(path, value):
    write_file(path, json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def merge_defaults(current, defaults):
    result = dict(current)
    for key, value in defaults.items():
        if key not in result:
            result[key] = value
        elif isinstance(value, dict):
            if not isinstance(result[key], dict):
                raise ValueError(f"La configuración existente contiene {key} con tipo incorrecto")
            result[key] = merge_defaults(result[key], value)
    return result


def validate_profiles(store):
    if store.get("kind") != "gentle-pi.agent_model_profiles" or store.get("version") != 1:
        raise ValueError("Formato de profiles.json incompatible")
    profiles = store.get("profiles")
    if not isinstance(profiles, dict) or not profiles:
        raise ValueError("profiles.json debe contener perfiles")
    if store.get("active") is not None and store["active"] not in profiles:
        raise ValueError("El perfil activo no existe")
    for name, roles in profiles.items():
        if not isinstance(roles, dict):
            raise ValueError(f"Perfil inválido: {name}")
        for role, routing in roles.items():
            if not isinstance(routing, dict) or set(routing) - {"model", "thinking"}:
                raise ValueError(f"Routing inválido: {name}/{role}")
            if "model" in routing and (not isinstance(routing["model"], str) or not re.fullmatch(
                r"[A-Za-z0-9._~:@/+%-]+", routing["model"]
            )):
                raise ValueError(f"Modelo inválido: {name}/{role}")
            if "thinking" in routing and routing["thinking"] not in (
                "off", "minimal", "low", "medium", "high", "xhigh", "max"
            ):
                raise ValueError(f"Razonamiento inválido: {name}/{role}")


def templates():
    versions = read_json(ROOT / "versions.json")
    for key in ("pi", "gentle_shell", "gentle_ai", "engram"):
        if not re.fullmatch(r"\d+\.\d+\.\d+", versions.get(key, "")):
            raise ValueError(f"Versión inválida: {key}")
    for digest in versions["engram_sha256"].values():
        if not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("SHA-256 de Engram inválido")
    settings = read_json(ROOT / "templates/settings.json")
    profiles = read_json(ROOT / "templates/profiles.json")
    validate_profiles(profiles)
    return versions, settings, profiles


def absolute(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError(f"Se requiere una ruta absoluta: {path}")
    return path


def layout(versions):
    home = absolute(os.environ["HOME"])
    data = absolute(os.environ.get("XDG_DATA_HOME") or str(home / ".local/share"))
    shell = Path(os.environ.get("SHELL", "/bin/bash")).name
    if shell not in ("bash", "zsh"):
        raise ValueError("Este instalador configura Bash o Zsh; selecciona SHELL=/bin/bash o /usr/bin/zsh")
    rc = (absolute(os.environ.get("ZDOTDIR") or str(home)) / ".zshrc"
          if shell == "zsh" else home / ".bashrc")
    return {
        "home": home,
        "data": data / "gentle",
        "runtime": data / "gentle/runtimes" / f"pi-{versions['pi']}-gentle-{versions['gentle_shell']}",
        "agent": home / ".gentle-shell/agent",
        "config": home / ".gentle-shell/gentle-ai",
        "memory": data / "engram-pi",
        "bin": home / ".local/bin",
        "rc": rc,
    }


def environment(paths):
    return {
        "GENTLE_SHELL_PI": str(paths["data"] / "bin/pi"),
        "GENTLE_PI_AGENTS_PI": str(paths["runtime"] / "bin/pi"),
        "GENTLE_SHELL_HOME": str(paths["agent"]),
        "PI_CODING_AGENT_DIR": str(paths["agent"]),
        "GENTLE_PI_AGENT_HOME": str(paths["agent"]),
        "GENTLE_PI_CONFIG_HOME": str(paths["config"]),
        "ENGRAM_BIN": str(paths["data"] / "bin/engram"),
        "ENGRAM_DATA_DIR": str(paths["memory"]),
        "ENGRAM_PORT": "7438",
    }


def child_environment(paths):
    env = os.environ | environment(paths)
    env.pop("ENGRAM_URL", None)
    env.pop("GENTLE_SHELL_NO_AUTO_SETUP", None)
    env["PATH"] = os.pathsep.join((str(paths["data"] / "bin"), str(paths["runtime"] / "bin"), env["PATH"]))
    return env


def managed_block(text, start, end, content):
    if text.count(start) != text.count(end) or text.count(start) > 1:
        raise ValueError(f"Bloque administrado mal formado: {start}")
    block = f"{start}\n{content.rstrip()}\n{end}"
    if start in text:
        if text.index(end) < text.index(start):
            raise ValueError(f"Marcadores fuera de orden: {start}")
        return text[:text.index(start)] + block + text[text.index(end) + len(end):]
    return text.rstrip() + ("\n\n" if text.strip() else "") + block + "\n"


def preflight_existing(paths):
    for key, files in (
        ("agent", ("settings.json", "subagents.json", "mcp.json")),
        ("config", ("profiles.json", "models.json", "animations.json", "background-subagents.json")),
    ):
        for name in files:
            path = paths[key] / name
            value = read_json(path)
            if name == "profiles.json" and path.exists():
                rename_profiles(value)
    settings = read_json(paths["agent"] / "settings.json")
    merge_defaults(settings, templates()[1])
    for name in ("gsh", "gsh-last"):
        path = paths["bin"] / name
        if path.exists() or path.is_symlink():
            with path.open() as stream:
                if LAUNCHER_MARKER not in stream.read(256):
                    raise ValueError(f"El comando ya existe y no pertenece a gentle/: {path}")
    for path, start, end in (
        (paths["rc"], BEGIN, END),
        (paths["agent"] / "AGENTS.md", AGENTS_BEGIN, AGENTS_END),
    ):
        text = path.read_text() if path.exists() else ""
        managed_block(text, start, end, "")
        if path == paths["rc"] and re.search(
            r"(?m)^\s*(?:alias\s+gsh(?:-last)?=|(?:function\s+)?gsh(?:-last)?\s*\(\))", text
        ):
            raise ValueError(f"Hay un alias o función gsh/gsh-last previo en {path}; resuelve su precedencia primero")


def backup(paths):
    destination = paths["data"] / "backups"
    destination.mkdir(parents=True, exist_ok=True)
    target = Path(tempfile.mkdtemp(prefix="install-", dir=destination))
    sources = {
        "agent": paths["agent"],
        "gentle-config": paths["config"],
        "shared-pi-config": paths["home"] / ".pi/gentle-ai",
        "gentle-ai-state.json": paths["home"] / ".gentle-ai/state.json",
        "launcher-config.json": paths["home"] / ".gentle-shell/config.json",
        "shellrc": paths["rc"],
        "gsh": paths["bin"] / "gsh",
        "gsh-last": paths["bin"] / "gsh-last",
        "env.sh": paths["data"] / "env.sh",
        "pi-compat": paths["data"] / "bin/pi",
        "pi_compat.py": paths["data"] / "pi_compat.py",
        "installed.json": paths["data"] / "installed.json",
    }
    manifest = {}
    for name, source in sources.items():
        manifest[name] = {"path": str(source), "existed": source.exists()}
        if source.is_dir():
            shutil.copytree(source, target / name, ignore=shutil.ignore_patterns("npm", "git", "sessions"))
        elif source.is_file():
            shutil.copy2(source, target / name)
    database = paths["memory"] / "engram.db"
    if database.is_file():
        with contextlib.closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)) as source:
            with contextlib.closing(sqlite3.connect(target / "engram.db")) as destination_db:
                source.backup(destination_db)
    write_json(target / "manifest.json", manifest)
    print(f"Respaldo: {target}", flush=True)
    return target


def install_engram(paths, versions, env):
    binary = Path(env["ENGRAM_BIN"])
    expected = f"engram {versions['engram']}"
    if binary.is_file() and os.access(binary, os.X_OK):
        if subprocess.check_output([binary, "version"], text=True, env=env).strip() == expected:
            return
    machine = platform.machine()
    arch = {"x86_64": "amd64", "aarch64": "arm64"}[machine]
    archive_name = f"engram_{versions['engram']}_linux_{arch}.tar.gz"
    with tempfile.TemporaryDirectory(prefix=".engram-", dir=paths["data"]) as directory:
        archive = Path(directory) / archive_name
        subprocess.run([
            "curl", "--fail", "--location", "--silent", "--show-error", "--retry", "2",
            "--connect-timeout", "15", "--max-time", "180",
            f"https://github.com/Gentleman-Programming/engram/releases/download/v{versions['engram']}/{archive_name}",
            "--output", str(archive),
        ], check=True, env=env)
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if digest != versions["engram_sha256"][machine]:
            raise ValueError("El SHA-256 del archivo Engram no coincide")
        # Extraer solo el ejecutable esperado; ninguna ruta del tar se materializa.
        with tarfile.open(archive) as bundle:
            member = bundle.getmember("engram")
            if not member.isfile():
                raise ValueError("El archivo Engram no contiene un ejecutable regular")
            candidate = Path(directory) / "engram"
            with bundle.extractfile(member) as source, candidate.open("wb") as destination:
                shutil.copyfileobj(source, destination)
        candidate.chmod(0o755)
        if subprocess.check_output([candidate, "version"], text=True, env=env).strip() != expected:
            raise ValueError("La versión descargada de Engram no coincide")
        binary.parent.mkdir(parents=True, exist_ok=True)
        os.replace(candidate, binary)


def runtime_packages(paths, versions):
    root = paths["runtime"] / "lib/node_modules"
    return ((root / "@earendil-works/pi-coding-agent", versions["pi"]),
            (root / "gentle-pi", versions["gentle_shell"]))


def native_binary(paths, versions):
    return paths["runtime"] / "lib/node_modules/gentle-pi/.gentle-ai" / f"v{versions['gentle_ai']}" / "gentle-ai"


def install_pi_compat(paths):
    helper = paths["data"] / "pi_compat.py"
    write_file(helper, (ROOT / "pi_compat.py").read_text())
    command = shlex.join([
        sys.executable, "-I", str(helper), str(paths["runtime"] / "bin/pi"),
        str(paths["runtime"] / "lib/node_modules/gentle-pi"),
    ])
    write_file(paths["data"] / "bin/pi", f'''#!/bin/sh
{LAUNCHER_MARKER}
set -eu
exec {command} "$@"
''', 0o755)


def configure_review_mode(paths, versions, env):
    command = [str(native_binary(paths, versions)), "review", "mode"]
    status = json.loads(subprocess.check_output(
        [*command, "status", "--json"], env=env, cwd=paths["data"] / "setup", text=True
    ))["status"]
    if status.get("schema") != "gentle-ai.rdd-mode-status/v1" or status.get("global") not in ("", "on", "off"):
        raise ValueError("Respuesta de review mode incompatible")
    # 3.7.0 usa on en ausencia de decisión; sembrar el opt-in elegido, una sola vez.
    if status["global"] == "":
        status = json.loads(subprocess.check_output(
            [*command, "disable", "--scope", "global", "--json"],
            env=env, cwd=paths["data"] / "setup", text=True,
        ))["status"]
        if status.get("global") != "off" or status.get("effective") != "off":
            raise ValueError("No se pudo configurar RDD como optativo")
    print(f"RDD global: {status['global']} (las decisiones explícitas previas se conservan)", flush=True)
    return status


def install_runtime(paths, versions, env):
    ready = all(read_json(path / "package.json").get("version") == version
                for path, version in runtime_packages(paths, versions))
    ready = ready and all(os.access(path, os.X_OK) for path in (
        paths["runtime"] / "bin/pi", paths["runtime"] / "bin/gentle-shell", native_binary(paths, versions)
    ))
    if not ready:
        subprocess.run([
            "npm", "install", "--global", "--prefix", str(paths["runtime"]),
            "--ignore-scripts=false", "--no-audit", "--no-fund",
            f"@earendil-works/pi-coding-agent@{versions['pi']}", f"gentle-pi@{versions['gentle_shell']}",
        ], check=True, env=env, cwd=paths["data"])
    for path, version in runtime_packages(paths, versions):
        if read_json(path / "package.json").get("version") != version:
            raise ValueError(f"Versión inesperada: {path}")


def rename_profiles(store):
    validate_profiles(store)
    profiles = dict(store["profiles"])
    for old, new in PROFILE_RENAMES.items():
        if old not in profiles:
            continue
        if new in profiles and profiles[new] != profiles[old]:
            raise ValueError(f"Los perfiles {old} y {new} difieren; resuelve el conflicto antes de renombrarlos")
        profiles[new] = profiles.pop(old)
    result = {**store, "profiles": profiles}
    if store.get("active") in PROFILE_RENAMES:
        result["active"] = PROFILE_RENAMES[store["active"]]
    return result


def configure(paths, settings_template, profiles_template):
    path = paths["config"] / "profiles.json"
    profiles = rename_profiles(read_json(path)) if path.exists() else profiles_template
    if path.exists():
        profiles["profiles"] = dict(profiles["profiles"])
        for name, roles in profiles_template["profiles"].items():
            profiles["profiles"].setdefault(name, roles)
    validate_profiles(profiles)
    active = profiles.get("active") or "daily"
    selected = profiles["profiles"][active]
    settings_defaults = dict(settings_template)
    if selected.get("orchestrator", {}).get("model"):
        provider, model = selected["orchestrator"]["model"].split("/", 1)
        settings_defaults.update(defaultProvider=provider, defaultModel=model)
        settings_defaults["defaultThinkingLevel"] = selected["orchestrator"].get("thinking", "high")
    settings = merge_defaults(read_json(paths["agent"] / "settings.json"), settings_defaults)
    routing = {role: entry for role, entry in selected.items() if role != "orchestrator"}
    subagents = merge_defaults(read_json(paths["agent"] / "subagents.json"), {
        "max_concurrency": 4, "default_model": f"{settings['defaultProvider']}/{settings['defaultModel']}",
        "default_effort": settings["defaultThinkingLevel"],
    })
    subagents.setdefault("model_profiles", routing)
    agents_path = paths["agent"] / "AGENTS.md"
    text = agents_path.read_text() if agents_path.exists() else ""
    instructions = managed_block(text, AGENTS_BEGIN, AGENTS_END, (ROOT / "templates/AGENTS.md").read_text())
    write_json(path, profiles)
    write_json(paths["agent"] / "settings.json", settings)
    write_json(paths["agent"] / "subagents.json", subagents)
    if not (paths["config"] / "models.json").exists():
        write_json(paths["config"] / "models.json", routing)
    for name, value in {
        "animations.json": {"schema": "gentle-pi.animations/v1", "policy": "performance"},
        "background-subagents.json": {"schema": "gentle-pi.background-subagents/v1", "policy": "on"},
    }.items():
        if not (paths["config"] / name).exists():
            write_json(paths["config"] / name, value)
    write_file(agents_path, instructions)


def install_launchers(paths):
    env_file = paths["data"] / "env.sh"
    content = "# Entorno de gsh y gsh-last; generado por gentle/install.py.\n"
    content += "\n".join(f"export {key}={shlex.quote(value)}" for key, value in environment(paths).items())
    private_path = f"{paths['data'] / 'bin'}:{paths['runtime'] / 'bin'}"
    content += f'\nexport PATH={shlex.quote(private_path)}:"$PATH"\nunset ENGRAM_URL GENTLE_SHELL_NO_AUTO_SETUP\n'
    write_file(env_file, content)
    write_file(paths["bin"] / "gsh", f'''#!/bin/sh
{LAUNCHER_MARKER}
set -eu
. {shlex.quote(str(env_file))}
exec {shlex.quote(str(paths["runtime"] / "bin/gentle-shell"))} --isolated "$@"
''', 0o755)
    write_file(paths["bin"] / "gsh-last", f'''#!/bin/sh
{LAUNCHER_MARKER}
set -eu
exec {shlex.quote(str(paths["bin"] / "gsh"))} --continue "$@"
''', 0o755)
    text = paths["rc"].read_text() if paths["rc"].exists() else ""
    content = '''case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac'''
    mode = stat.S_IMODE(paths["rc"].stat().st_mode) if paths["rc"].exists() else 0o600
    write_file(paths["rc"], managed_block(text, BEGIN, END, content), mode)


def verify_installed(paths, versions):
    validate_profiles(read_json(paths["config"] / "profiles.json"))
    settings = read_json(paths["agent"] / "settings.json")
    sources = [entry if isinstance(entry, str) else entry.get("source", "")
               for entry in settings.get("packages", [])]
    identities = {re.sub(r"@[^/]+$", "", source) for source in sources}
    for name in COMPANIONS:
        if f"npm:{name}" not in identities:
            raise ValueError(f"El setup no declaró el complemento {name}")
    retired = {"npm:gentle-pi", "npm:pi-subagents-j0k3r", "npm:@juicesharp/rpiv-ask-user-question"}
    if identities & retired:
        raise ValueError(f"Declaraciones duplicadas o retiradas: {sorted(identities & retired)}")
    for path, version in runtime_packages(paths, versions):
        if read_json(path / "package.json").get("version") != version:
            raise ValueError(f"Versión instalada inesperada: {path}")
    for path in (paths["runtime"] / "bin/pi", paths["runtime"] / "bin/gentle-shell",
                 paths["data"] / "bin/pi",
                 native_binary(paths, versions), Path(environment(paths)["ENGRAM_BIN"])):
        if not os.access(path, os.X_OK):
            raise ValueError(f"Falta ejecutable: {path}")
    companions = {}
    for name in COMPANIONS:
        package = read_json(paths["agent"] / "npm/node_modules" / name / "package.json")
        if not package.get("version"):
            raise ValueError(f"Complemento declarado pero no instalado: {name}")
        companions[name] = package["version"]
    concurrency = read_json(paths["agent"] / "subagents.json").get("max_concurrency")
    if type(concurrency) is not int or concurrency < 1:
        raise ValueError("max_concurrency debe ser un entero positivo")
    for name, schema, policies in (
        ("animations.json", "gentle-pi.animations/v1", ("quality", "performance", "potato")),
        ("background-subagents.json", "gentle-pi.background-subagents/v1", ("on", "off")),
    ):
        value = read_json(paths["config"] / name)
        if set(value) != {"schema", "policy"} or value["schema"] != schema or value["policy"] not in policies:
            raise ValueError(f"Política inválida: {paths['config'] / name}")
    return companions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true", help="mostrar orden y rutas, sin escribir ni descargar")
    args = parser.parse_args()
    versions, settings, profiles = templates()
    paths = layout(versions)
    preflight_existing(paths)
    print("Orden: requisitos → respaldo → Engram → Pi/Gentle → setup oficial → configuración → verificación → gsh/gsh-last")
    print(json.dumps({key: str(value) for key, value in paths.items()}, indent=2))
    if args.plan:
        return
    if os.geteuid() == 0 or not Path("/etc/arch-release").is_file():
        raise ValueError("Ejecuta como usuario sin sudo en Arch Linux")
    missing = [name for name in ("node", "npm", "curl", "git", "rg") if not shutil.which(name)]
    if missing:
        raise ValueError(f"Faltan comandos: {', '.join(missing)}")
    node = subprocess.check_output(["node", "-p", "process.versions.node"], text=True).strip()
    if tuple(map(int, node.split("."))) < (22, 19, 0):
        raise ValueError("Pi requiere Node >= 22.19.0")
    if platform.machine() not in versions["engram_sha256"]:
        raise ValueError("Arquitectura sin binario Engram fijado")
    os.umask(0o077)
    backup_path = backup(paths)
    env = child_environment(paths)
    install_engram(paths, versions, env)
    install_runtime(paths, versions, env)
    install_pi_compat(paths)
    # cwd sin configuración de proyecto: el setup pertenece al perfil global.
    setup_dir = paths["data"] / "setup"
    setup_dir.mkdir(exist_ok=True)
    subprocess.run([paths["runtime"] / "bin/gentle-shell", "--isolated", "setup"],
                   check=True, env=env, cwd=setup_dir)
    review_mode = configure_review_mode(paths, versions, env)
    configure(paths, settings, profiles)
    companions = verify_installed(paths, versions)
    install_launchers(paths)
    write_json(paths["data"] / "installed.json", {
        "versions": versions, "companions": companions, "backup": str(backup_path),
        "review_mode": review_mode,
        "pi_compat": "deduplicate-gentle-resource-arguments-v1",
        "paths": {key: str(value) for key, value in paths.items()},
    })
    print("Perfil preparado. Abre una terminal nueva y, desde tu proyecto, ejecuta gsh.")
    print("Primer uso: /login → OpenAI Codex; después /gentle:doctor y /gentle:profiles.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError, tarfile.TarError) as error:
        raise SystemExit(f"Error: {error}") from error
