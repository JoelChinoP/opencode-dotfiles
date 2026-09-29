#!/usr/bin/env python3
"""Pruebas con HOME/XDG aislados y dobles npm/Gentle/Engram; sin red ni modelos."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import install


FAKE_LAUNCHER = '''import json, os, sys
from pathlib import Path
args = sys.argv[1:]
if args == ["--isolated", "setup"]:
    agent = Path(os.environ["PI_CODING_AGENT_DIR"])
    agent.mkdir(parents=True, exist_ok=True)
    path = agent / "settings.json"
    value = json.loads(path.read_text()) if path.exists() else {}
    value.setdefault("theme", "Gentleman-Cute")
    value.setdefault("packages", [])
    for name in ("gentle-engram", "pi-mcp-adapter", "pi-web-access", "pi-btw"):
        source = "npm:" + name
        if source not in value["packages"]:
            value["packages"].append(source)
        package = agent / "npm/node_modules" / name
        package.mkdir(parents=True, exist_ok=True)
        (package / "package.json").write_text(json.dumps({"name":name,"version":"0.0.0-fixture"}))
    path.write_text(json.dumps(value))
    if os.environ.get("TEST_SETUP_FAIL") == "1":
        sys.exit(9)
elif args == ["--isolated", "--version"]:
    print("gentle-shell 3.7.0\\npi 0.87.1")
else:
    keys = ("PI_CODING_AGENT_DIR", "GENTLE_PI_AGENT_HOME", "GENTLE_PI_CONFIG_HOME",
            "GENTLE_SHELL_PI", "GENTLE_PI_AGENTS_PI", "ENGRAM_DATA_DIR", "ENGRAM_PORT", "ENGRAM_URL",
            "GENTLE_SHELL_NO_AUTO_SETUP")
    print(json.dumps({"args": args, "cwd": os.getcwd(), "env": {k:os.environ.get(k) for k in keys}}))
'''


FAKE_NATIVE = '''import json, sys
from pathlib import Path
args = sys.argv[1:]
if len(args) >= 3 and args[:2] == ["review", "mode"]:
    path = Path.home() / ".gentle-ai/test-review-mode.json"
    mode = json.loads(path.read_text())["mode"] if path.exists() else ""
    if args[2] == "disable":
        mode = "off"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"mode":mode}))
    print(json.dumps({"status": {"schema":"gentle-ai.rdd-mode-status/v1", "global":mode,
                                "effective":mode or "on", "source":"global" if mode else "default"}}))
else:
    print("gentle-ai 3.7.0")
'''


def executable(path, code):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"#!{sys.executable}\n" + code)
    path.chmod(0o755)


class InstallationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="gentle-check-", dir="/tmp/opencode")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.home = self.base / "home ' con espacios"
        self.home.mkdir()
        self.fake_bin = self.base / "dobles"
        self.fake_bin.mkdir()
        self.env = {
            "HOME": str(self.home), "SHELL": "/bin/bash", "PATH": f"{self.fake_bin}:/usr/bin:/bin",
            "XDG_DATA_HOME": str(self.home / "datos"), "XDG_CONFIG_HOME": str(self.home / "config"),
            "XDG_STATE_HOME": str(self.home / "estado"), "XDG_CACHE_HOME": str(self.home / "cache"),
            "ZDOTDIR": str(self.home / "zsh config"), "LANG": "C.UTF-8",
            "ENGRAM_URL": "http://servidor-previo.invalid:7437",
            "GENTLE_SHELL_NO_AUTO_SETUP": "1",
        }
        self.versions, self.settings, self.profiles = install.templates()
        with mock.patch.dict(os.environ, self.env, clear=True):
            self.paths = install.layout(self.versions)
        executable(self.paths["data"] / "bin/engram", 'print("engram 2.2.1")\n')
        executable(self.fake_bin / "npm", f'''import json, sys
from pathlib import Path
args = sys.argv[1:]
root = Path(args[args.index("--prefix") + 1])
for spec in args:
    if spec.startswith("@earendil-works/pi-coding-agent@") or spec.startswith("gentle-pi@"):
        name, version = spec.rsplit("@", 1)
        package = root / "lib/node_modules" / name
        package.mkdir(parents=True, exist_ok=True)
        (package / "package.json").write_text(json.dumps({{"name":name,"version":version}}))
for name, content in {{"pi": 'print("0.87.1")\\n', "gentle-shell": {FAKE_LAUNCHER!r}}}.items():
    path = root / "bin" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text({f'#!{sys.executable}\n'!r} + content)
    path.chmod(0o755)
native = root / "lib/node_modules/gentle-pi/.gentle-ai/v3.7.0/gentle-ai"
native.parent.mkdir(parents=True, exist_ok=True)
native.write_text({f'#!{sys.executable}\n'!r} + {FAKE_NATIVE!r})
native.chmod(0o755)
''')
        executable(self.fake_bin / "curl", '''import os, shutil, sys
args = sys.argv[1:]
shutil.copyfile(os.environ["TEST_ARCHIVE"], args[args.index("--output") + 1])
''')
        # Detectar una escritura ajena al perfil elegido.
        for path in (self.home / ".config/opencode/cli.json", self.home / ".pi/agent/settings.json"):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{"original": true}\n')

    def run_install(self, *args):
        old_umask = os.umask(0o077)
        try:
            with mock.patch.dict(os.environ, self.env, clear=True), \
                 mock.patch.object(sys, "argv", ["install.py", *args]), \
                 mock.patch("install.os.geteuid", return_value=1000), \
                 contextlib.redirect_stdout(io.StringIO()):
                install.main()
        finally:
            os.umask(old_umask)

    def test_full_install_and_resume_bash_zsh(self):
        for shell in ("bash", "zsh"):
            with self.subTest(shell=shell):
                binary = shutil.which(shell)
                self.assertIsNotNone(binary)
                self.env["SHELL"] = binary
                with mock.patch.dict(os.environ, self.env, clear=True):
                    self.paths = install.layout(self.versions)
                rc = self.paths["rc"]
                rc.parent.mkdir(parents=True, exist_ok=True)
                target = self.home / f"rc real {shell}"
                target.write_text("# preferencias previas\nalias propio='pwd'\n")
                rc.symlink_to(target)
                self.run_install()
                original_rc = target.read_text()
                self.run_install()
                self.assertTrue(rc.is_symlink())
                self.assertEqual(target.read_text(), original_rc)
                self.assertEqual(original_rc.count(install.BEGIN), 1)
                self.assertIn("alias propio='pwd'", original_rc)
                settings = install.read_json(self.paths["agent"] / "settings.json")
                self.assertEqual(settings["defaultModel"], "gpt-6-sol")
                subagents = install.read_json(self.paths["agent"] / "subagents.json")
                self.assertEqual(subagents["max_concurrency"], 4)
                self.assertNotIn("orchestrator", subagents["model_profiles"])
                self.assertEqual(subagents["model_profiles"]["gentle-ai-explore"]["thinking"], "medium")
                self.assertEqual(install.read_json(self.paths["config"] / "background-subagents.json")["policy"], "on")
                self.assertEqual(install.read_json(self.paths["config"] / "animations.json")["policy"], "performance")
                self.assertEqual(install.read_json(self.paths["data"] / "installed.json")["review_mode"]["global"], "off")
                for invocation, expected in (
                    ('gsh "mensaje con espacios"', ["--isolated", "mensaje con espacios"]),
                    ('gsh-last "continuación"', ["--isolated", "--continue", "continuación"]),
                    ('gsh -r', ["--isolated", "-r"]),
                    ('gsh install npm:ejemplo', ["--isolated", "install", "npm:ejemplo"]),
                ):
                    flags = ["--noprofile", "--norc"] if shell == "bash" else ["-f"]
                    result = subprocess.run([binary, *flags, "-c", 'source "$1"\n' + invocation,
                                             "test", str(rc)], env=self.env, cwd=self.home,
                                            text=True, capture_output=True, check=True)
                    payload = json.loads(result.stdout)
                    self.assertEqual(payload["args"], expected)
                    self.assertEqual(payload["cwd"], str(self.home))
                    self.assertEqual(payload["env"]["PI_CODING_AGENT_DIR"], str(self.paths["agent"]))
                    self.assertEqual(payload["env"]["GENTLE_PI_CONFIG_HOME"], str(self.paths["config"]))
                    self.assertEqual(payload["env"]["GENTLE_PI_AGENTS_PI"], str(self.paths["runtime"] / "bin/pi"))
                    self.assertEqual(payload["env"]["GENTLE_SHELL_PI"], str(self.paths["data"] / "bin/pi"))
                    self.assertEqual(payload["env"]["ENGRAM_DATA_DIR"], str(self.paths["memory"]))
                    self.assertEqual(payload["env"]["ENGRAM_PORT"], "7438")
                    self.assertIsNone(payload["env"]["ENGRAM_URL"])
                    self.assertIsNone(payload["env"]["GENTLE_SHELL_NO_AUTO_SETUP"])
        for path in (self.home / ".config/opencode/cli.json", self.home / ".pi/agent/settings.json"):
            self.assertEqual(path.read_text(), '{"original": true}\n')

    def test_reinstall_preserves_selected_profile_and_manual_overrides(self):
        self.run_install()
        store = copy.deepcopy(self.profiles)
        store["active"] = "deep"
        store["profiles"]["deep"]["gentle-ai-worker"]["thinking"] = "xhigh"
        install.write_json(self.paths["config"] / "profiles.json", store)
        install.write_json(self.paths["config"] / "models.json", {"personal": {"thinking": "low"}})
        install.write_json(self.paths["agent"] / "subagents.json", {"max_concurrency": 3, "model_profiles": {}})
        settings = install.read_json(self.paths["agent"] / "settings.json")
        settings.update(defaultModel="gpt-6-astra", defaultThinkingLevel="xhigh", personal=True)
        install.write_json(self.paths["agent"] / "settings.json", settings)
        self.run_install()
        self.assertEqual(install.read_json(self.paths["config"] / "profiles.json"), store)
        self.assertEqual(install.read_json(self.paths["config"] / "models.json"), {"personal": {"thinking": "low"}})
        self.assertEqual(install.read_json(self.paths["agent"] / "subagents.json")["model_profiles"], {})
        self.assertEqual(install.read_json(self.paths["agent"] / "settings.json"), settings)

    def test_explicit_rdd_choice_survives_install(self):
        path = self.home / ".gentle-ai/test-review-mode.json"
        install.write_json(path, {"mode": "on"})
        self.run_install()
        self.assertEqual(install.read_json(path), {"mode": "on"})
        self.assertEqual(install.read_json(self.paths["data"] / "installed.json")["review_mode"]["global"], "on")

    def test_profile_rename_preserves_customization_and_active_choice(self):
        self.run_install()
        store = copy.deepcopy(self.profiles)
        inverse = {new: old for old, new in install.PROFILE_RENAMES.items()}
        store["profiles"] = {inverse[name]: roles for name, roles in store["profiles"].items()}
        store["active"] = "profundo"
        store["profiles"]["profundo"]["gentle-ai-worker"]["thinking"] = "xhigh"
        install.write_json(self.paths["config"] / "profiles.json", store)
        self.run_install()
        actual = install.read_json(self.paths["config"] / "profiles.json")
        self.assertEqual(actual["active"], "deep")
        self.assertEqual(set(actual["profiles"]), {"daily", "performance", "deep"})
        self.assertEqual(actual["profiles"]["deep"]["gentle-ai-worker"]["thinking"], "xhigh")

    def test_profile_rename_refuses_conflicting_custom_profile(self):
        store = copy.deepcopy(self.profiles)
        store["profiles"]["diario"] = {"orchestrator": {"model": "openai-codex/gpt-5.5"}}
        with self.assertRaisesRegex(ValueError, "difieren"):
            install.rename_profiles(store)

    def test_pi_compat_preserves_arguments_and_other_resources(self):
        self.run_install()
        executable(self.paths["runtime"] / "bin/pi", 'import json,sys\nprint(json.dumps(sys.argv[1:]))\n')
        package = self.paths["runtime"] / "lib/node_modules/gentle-pi"
        injection = ["-e", str(package), "--skill", str(package / "skills"),
                     "--prompt-template", str(package / "prompts"), "--theme", str(package / "themes")]
        other = ["--theme", "/otro tema.json", "--skill", "/otras skills", "--mode", "rpc"]
        literal = ["--", "--theme", str(package / "themes")]
        for arguments, expected in (
            (injection + other + literal, ["-e", str(package)] + other + literal),
            (["--theme", str(package / "themes")], ["--theme", str(package / "themes")]),
            (["install", "npm:ejemplo"], ["install", "npm:ejemplo"]),
            (["--continue", "mensaje con espacios"], ["--continue", "mensaje con espacios"]),
            (["--version"], ["--version"]),
        ):
            result = subprocess.run([self.paths["data"] / "bin/pi", *arguments], env=self.env,
                                    text=True, capture_output=True, check=True)
            self.assertEqual(json.loads(result.stdout), expected)

    def test_invalid_json_fails_before_setup_or_backup(self):
        path = self.paths["agent"] / "settings.json"
        path.parent.mkdir(parents=True)
        path.write_text("{incorrecto")
        with self.assertRaises(ValueError):
            self.run_install()
        self.assertEqual(path.read_text(), "{incorrecto")
        self.assertFalse((self.paths["data"] / "backups").exists())
        self.assertFalse(self.paths["runtime"].exists())

    def test_failed_setup_does_not_publish_launchers(self):
        self.env["TEST_SETUP_FAIL"] = "1"
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_install()
        self.assertFalse((self.paths["bin"] / "gsh").exists())
        self.assertFalse(self.paths["rc"].exists())
        self.assertEqual(len(list((self.paths["data"] / "backups").glob("install-*"))), 1)

    def test_plan_is_read_only(self):
        before = {str(path): path.read_bytes() for path in self.home.rglob("*") if path.is_file()}
        self.run_install("--plan")
        after = {str(path): path.read_bytes() for path in self.home.rglob("*") if path.is_file()}
        self.assertEqual(before, after)
        self.assertFalse((self.paths["data"] / "backups").exists())

    def test_existing_command_is_not_overwritten(self):
        path = self.paths["bin"] / "gsh"
        executable(path, 'print("comando del usuario")')
        with self.assertRaisesRegex(ValueError, "comando ya existe"):
            self.run_install()
        self.assertIn("comando del usuario", path.read_text())

    def test_backup_preserves_sqlite_wal_and_configuration(self):
        self.paths["memory"].mkdir(parents=True)
        source = sqlite3.connect(self.paths["memory"] / "engram.db")
        self.addCleanup(source.close)
        source.execute("PRAGMA journal_mode=WAL")
        source.execute("CREATE TABLE memories (content TEXT)")
        source.execute("INSERT INTO memories VALUES ('decisión anterior')")
        source.commit()
        self.paths["rc"].write_text("# shell anterior\n")
        self.run_install()
        snapshot, = (self.paths["data"] / "backups").glob("install-*")
        with contextlib.closing(sqlite3.connect(snapshot / "engram.db")) as saved:
            self.assertEqual(saved.execute("SELECT content FROM memories").fetchall(), [("decisión anterior",)])
        self.assertEqual((snapshot / "shellrc").read_text(), "# shell anterior\n")
        manifest = install.read_json(snapshot / "manifest.json")
        self.assertEqual(manifest["shellrc"], {"path": str(self.paths["rc"]), "existed": True})

    def test_installed_checker_reports_invalid_policy(self):
        self.run_install()
        command = [sys.executable, "-I", str(install.ROOT / "check.py"), "--installed"]
        result = subprocess.run(command, env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        install.write_json(self.paths["config"] / "animations.json", {
            "schema": "gentle-pi.animations/v1", "policy": "desconocida"
        })
        result = subprocess.run(command, env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Política inválida", result.stderr)

    def test_engram_checksum_rejects_invalid_archive(self):
        (self.paths["data"] / "bin/engram").unlink()
        archive = self.base / "invalid.tar.gz"
        archive.write_bytes(b"no es el release")
        env = self.env | {"TEST_ARCHIVE": str(archive)} | install.environment(self.paths)
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            install.install_engram(self.paths, self.versions, env)
        self.assertFalse((self.paths["data"] / "bin/engram").exists())

    def test_engram_extracts_only_checked_executable(self):
        (self.paths["data"] / "bin/engram").unlink()
        archive = self.base / "fixture.tar.gz"
        binary = self.base / "fixture-engram"
        executable(binary, 'print("engram 2.2.1")')
        with tarfile.open(archive, "w:gz") as bundle:
            bundle.add(binary, arcname="engram")
            bundle.add(binary, arcname="../../no-extraer")
        versions = copy.deepcopy(self.versions)
        versions["engram_sha256"][install.platform.machine()] = hashlib.sha256(archive.read_bytes()).hexdigest()
        env = self.env | {"TEST_ARCHIVE": str(archive)} | install.environment(self.paths)
        install.install_engram(self.paths, versions, env)
        self.assertTrue(os.access(self.paths["data"] / "bin/engram", os.X_OK))
        self.assertFalse((self.base / "no-extraer").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
