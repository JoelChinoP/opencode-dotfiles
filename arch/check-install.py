#!/usr/bin/env python3
"""python arch/check-install.py — instalador aislado, sin red ni servicio real."""
import os
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent

with tempfile.TemporaryDirectory(prefix="opencode-install-") as temporary:
    for shell in ("bash", "zsh"):
        executable = shutil.which(shell)
        assert executable, f"Se requiere {shell} para comprobar sus atajos"
        home = Path(temporary) / f"home {shell}"
        home.mkdir()
        env = os.environ | {"HOME": str(home), "SHELL": executable}
        for name, directory in {
            "XDG_CONFIG_HOME": "config",
            "XDG_DATA_HOME": "data",
            "XDG_STATE_HOME": "state",
            "XDG_CACHE_HOME": "cache",
            "ENGRAM_DATA_DIR": "engram",
            "ZDOTDIR": "zsh config",
        }.items():
            path = home / directory
            path.mkdir()
            env[name] = str(path)

        # Dobles locales: el instalador solo necesita las versiones en --no-start.
        binaries = home / "bin"
        binaries.mkdir()
        opencode = binaries / "opencode"
        opencode.write_text('''#!/usr/bin/env python3
import sys
args = sys.argv[1:]
if args == ["--version"]:
    print("opencode v2.0.8")
else:
    print("\\n".join(args))
    sys.exit(7)
''')
        opencode.chmod(0o755)
        env["PATH"] = str(binaries) + os.pathsep + env["PATH"]
        # Probar también la recuperación si falla el segundo rename del perfil.
        real_mv = shutil.which("mv")
        move = binaries / "mv"
        move.write_text(f'''#!/bin/sh
if [ "${{OC_TEST_FAIL_SWAP:-}}" = 1 ]; then
  case "$2" in */.opencode-v2.*/opencode) exit 1;; esac
fi
exec "{real_mv}" "$@"
''')
        move.chmod(0o755)
        install_dir = Path(env["XDG_DATA_HOME"]) / "opencode-dotfiles-v2"
        engram = install_dir / "bin/engram-2.0.0"
        engram.parent.mkdir(parents=True)
        engram.write_text('#!/bin/sh\n[ "$*" = version ] || exit 1\necho "engram 2.0.0"\n')
        engram.chmod(0o755)
        playwright_package = install_dir / "tools/playwright-cli-0.1.21/node_modules/@playwright/cli"
        playwright_package.mkdir(parents=True)
        (playwright_package / "package.json").write_text(json.dumps({"name": "@playwright/cli", "version": "0.1.21"}))
        (playwright_package / "playwright-cli.js").write_text(
            '#!/usr/bin/env node\nif (process.argv.includes("--version")) console.log("Version 0.1.21"); else process.exit(2);\n'
        )
        for package, version in {
            "playwright": "1.64.0-alpha-1789764292000",
            "playwright-core": "1.64.0-alpha-1789764292000",
        }.items():
            package_dir = install_dir / f"tools/playwright-cli-0.1.21/node_modules/{package}"
            package_dir.mkdir()
            (package_dir / "package.json").write_text(json.dumps({"name": package, "version": version}))

        rc = Path(env["ZDOTDIR"]) / ".zshrc" if shell == "zsh" else home / ".bashrc"
        target = home / "dotfiles rc"
        target.write_text("# configuración del usuario\nalias oc-attach='command opencode --server'\nalias oc-status='command /ruta/oc-status'\nalias propio='pwd'\n")
        (install_dir / "bin/oc-status").write_text("monitor anterior")
        rc.symlink_to(target)
        env_file = Path(env["ZDOTDIR"]) / ".zshenv" if shell == "zsh" else rc
        with env_file.open("a") as stream:
            stream.write("export PONYTAIL_DEFAULT_MODE=off OTHER_MODE=conservar\n" if shell == "bash" else "export PONYTAIL_DEFAULT_MODE='off' # conservar comentario\n")
        env["PONYTAIL_DEFAULT_MODE"] = "off"
        config_dir = Path(env["XDG_CONFIG_HOME"]) / "opencode"
        if shell == "zsh":
            config_target = home / "original profile"
            config_target.mkdir()
            config_dir.symlink_to(Path("..") / config_target.name)
        else:
            config_dir.mkdir()
        (config_dir / "previous-profile").write_text("conservar")
        (config_dir / "service.json").write_text(json.dumps({"hostname": "0.0.0.0", "port": 4197}))
        previous = ""
        for _ in range(2):
            before = target.read_text()
            backups = set((install_dir / "backups").glob("install.*"))
            subprocess.run(
                ["bash", str(root / "arch/install.sh"), "--no-start"],
                env=env, cwd=home, check=True, capture_output=True, text=True,
            )
            backup, = set((install_dir / "backups").glob("install.*")) - backups
            if not previous:
                assert not (backup / "opencode").is_symlink()
                assert (backup / "opencode/previous-profile").read_text() == "conservar"
                if shell == "zsh":
                    assert (config_target / "previous-profile").read_text() == "conservar"
            assert (backup / "shellrc").read_text().startswith(before)
            assert (backup / "ponytail-env").exists()
            assert rc.is_symlink()
            assert "export PONYTAIL_DEFAULT_MODE=lite" in env_file.read_text()
            managed_path = 'export PATH="${XDG_DATA_HOME:-$HOME/.local/share}/opencode-dotfiles-v2/bin:$PATH"'
            assert env_file.read_text().count(managed_path) == 1
            assert ("OTHER_MODE=conservar" if shell == "bash" else "# conservar comentario") in env_file.read_text()
            service = json.loads((config_dir / "service.json").read_text())
            assert service == {"hostname": "127.0.0.1", "port": 4197}
            assert {path.name for path in (config_dir / "skills").iterdir() if path.is_dir()} == {
                "document-files", "frontend-design", "playwright-cli", "skill-governance"
            }
            assert {entry["id"] for entry in json.loads((config_dir / "skills-lock.json").read_text())["skills"]} == {
                "document-files", "frontend-design", "playwright-cli", "skill-governance"
            }
            result = subprocess.run(
                [install_dir / "bin/playwright-cli", "--version"], env=env,
                check=True, capture_output=True, text=True,
            )
            assert result.stdout.strip() == "Version 0.1.21"
            content = target.read_text()
            assert content.count("alias oc='command opencode'") == 1
            assert content.count("alias oc-last='command opencode --continue'") == 1
            assert "oc-attach" not in content and "oc-status" not in content
            assert "alias propio='pwd'" in content
            assert not (install_dir / "bin/oc-status").exists()
            if previous:
                assert content == previous, "Reinstalar no debe duplicar atajos ni exports"
            previous = content

        flags = ["--noprofile", "--norc", "-O", "expand_aliases"] if shell == "bash" else ["-f"]
        result = subprocess.run(
            [executable, *flags, "-c", 'source "$1"\nprintf "%s" "$PONYTAIL_DEFAULT_MODE"', "check", str(env_file)],
            env=env, check=True, capture_output=True, text=True,
        )
        assert result.stdout == "lite"
        for invocation, arguments in (
            ('oc "proyecto con espacios" --session ses_test', ["proyecto con espacios", "--session", "ses_test"]),
            ('oc-last "proyecto con espacios"', ["--continue", "proyecto con espacios"]),
        ):
            result = subprocess.run(
                [executable, *flags, "-c", 'source "$1"\nopencode() { return 99; }\neval "$2"', "check", str(rc), invocation],
                env=env, cwd=home, capture_output=True, text=True,
            )
            assert result.returncode == 7, result.stderr
            assert result.stdout.splitlines() == arguments, result.stdout

        snapshot = {str(p.relative_to(config_dir)): p.read_bytes() for p in config_dir.rglob("*") if p.is_file()}
        before = target.read_text()
        result = subprocess.run(["bash", str(root / "arch/install.sh"), "--no-start"],
                                env=env | {"OC_TEST_FAIL_SWAP": "1"}, cwd=home, capture_output=True, text=True)
        assert result.returncode != 0
        assert snapshot == {str(p.relative_to(config_dir)): p.read_bytes() for p in config_dir.rglob("*") if p.is_file()}
        assert target.read_text() == before

        # Una plantilla inválida falla antes de crear respaldos o tocar el perfil/rc.
        broken = home / "broken repo"
        shutil.copytree(root / "arch", broken / "arch")
        shutil.copytree(root / "templates", broken / "templates")
        (broken / "templates/cli.json").write_text("{ JSON inválido")
        backups = set((install_dir / "backups").iterdir())
        result = subprocess.run(["bash", str(broken / "arch/install.sh"), "--no-start"],
                                env=env | {"PYTHONOPTIMIZE": "1"}, cwd=home, capture_output=True, text=True)
        assert result.returncode != 0
        assert backups == set((install_dir / "backups").iterdir())
        assert snapshot == {str(p.relative_to(config_dir)): p.read_bytes() for p in config_dir.rglob("*") if p.is_file()}
        assert target.read_text() == before

print("OK: skills y Playwright fijados, oc/oc-last, respaldos, loopback, Ponytail lite, prevalidación y restauración.")
