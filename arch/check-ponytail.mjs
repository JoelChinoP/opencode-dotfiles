// node arch/check-ponytail.mjs /ruta/al/paquete — sin servicio ni llamadas a modelos.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

assert.ok(process.argv[2], "Indica el directorio del paquete oficial Ponytail 5.3.3");
const packageRoot = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
assert.equal(manifest.name, "@dietrichgebert/ponytail");
assert.equal(manifest.version, "5.3.3");
const temporary = mkdtempSync(join(tmpdir(), "ponytail-check-"));
try {
  process.env.XDG_CONFIG_HOME = temporary;
  delete process.env.PONYTAIL_DEFAULT_MODE;
  mkdirSync(join(temporary, "ponytail"));
  mkdirSync(join(temporary, "opencode"));
  writeFileSync(join(temporary, "ponytail/config.json"), JSON.stringify({ defaultMode: "lite" }));
  const { default: plugin } = await import(pathToFileURL(join(packageRoot, manifest.exports["."])));
  const hooks = new Map();
  const commands = new Map();
  const skills = new Set();
  const prompts = [];
  await plugin.setup({
    session: {
      hook: async (name, callback) => hooks.set(name, callback),
      prompt: async (prompt) => prompts.push(prompt),
    },
    command: { transform: async (callback) => callback({ add: (command) => commands.set(command.name, command) }) },
    skill: { transform: async (callback) => callback({ add: (skill) => skills.add(skill.id) }) },
  });
  const context = async (sessionID, hook = "context") => {
    const event = { sessionID, system: [] };
    await hooks.get(hook)(event);
    return event.system.map((part) => part.text).join("\n");
  };
  for (const id of ["ses_first", "ses_new"]) {
    assert.match(await context(id), /PONYTAIL MODE ACTIVE — level: lite/);
  }
  assert.equal(prompts.length, 0, "Activar lite por defecto no debe iniciar una conversación");
  assert.equal(await context("ses_first", "compaction"), await context("ses_first"));
  for (const name of ["ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help"]) {
    assert.ok(commands.has(name) && skills.has(name), name);
  }
  await commands.get("ponytail").execute({ sessionID: "ses_first", prompt: { text: "full" } });
  assert.match(await context("ses_new"), /level: full/);
  // Cambiar el archivo global también funciona antes de iniciar un chat.
  writeFileSync(join(temporary, "opencode/.ponytail-active"), "lite\n");
  assert.match(await context("ses_next"), /level: lite/);
  await commands.get("ponytail").execute({ sessionID: "ses_next", prompt: { text: "" } });
  assert.match(await context("ses_next"), /level: lite/);
  console.log("OK: Ponytail 5.3.3, lite automático, nivel persistente, seis comandos/skills y compactación.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
