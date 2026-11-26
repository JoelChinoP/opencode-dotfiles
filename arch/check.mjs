// node arch/check.mjs — comprobaciones sin red, paquetes npm ni llamadas a modelos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import engram from "../templates/plugins/engram/index.js";
import { editorArgs } from "../templates/plugins/open-editor/editor.js";
import { children, elapsed, state } from "../templates/plugins/subagent-statusline.v2/state.js";

// --- Editores: carpetas locales y nombres de perfil que la CLI reconoce exactamente ---
const editorTest = mkdtempSync(join(tmpdir(), "opencode-editors-"));
const previousPortable = process.env.VSCODE_PORTABLE;
try {
  process.env.VSCODE_PORTABLE = editorTest;
  const root = join(editorTest, "proyecto");
  const folder = join(root, "Mi web");
  mkdirSync(folder, { recursive: true });
  const store = join(editorTest, "user-data/User/globalStorage");
  mkdirSync(store, { recursive: true });
  const stateFile = join(store, "storage.json");
  writeFileSync(stateFile, JSON.stringify({ userDataProfiles: ["Trabajo Web", "Go", "GO", "@Dev"].map((name) => ({ name })) }));
  assert.deepEqual(await editorArgs("zed", root), ["-n", root]);
  assert.deepEqual(await editorArgs("code", root, '"Mi web" --profile "trabajo WEB"'), ["-n", folder, "--profile", "Trabajo Web"]);
  const nested = join(folder, "Mis  plugins");
  mkdirSync(nested);
  assert.deepEqual(await editorArgs("zed", root, "@Mi web/Mis  plugins"), ["-n", nested]);
  assert.deepEqual(await editorArgs("code", root, '@Mi web --profile "trabajo web"'), ["-n", folder, "--profile", "Trabajo Web"]);
  assert.deepEqual(await editorArgs("code", root, '--profile @dev @"Mi web"'), ["-n", folder, "--profile", "@Dev"]);
  mkdirSync(join(root, "@equipo"));
  assert.deepEqual(await editorArgs("zed", root, "./@equipo"), ["-n", join(root, "@equipo")]);
  assert.deepEqual(await editorArgs("code", root, "--profile Go"), ["-n", root, "--profile", "Go"]);
  await assert.rejects(editorArgs("code", root, "--profile go"), /mayúsculas exactas/);
  await assert.rejects(editorArgs("code", root, "--profile nuevo"), /No se encontró el perfil/);
  symlinkSync(store, join(root, "enlace"));
  await assert.rejects(editorArgs("zed", root, "@enlace"), /fuera de la sesión/);
  await assert.rejects(editorArgs("zed", root, "falta"), /No se puede acceder/);
  writeFileSync(join(root, "archivo.txt"), "");
  await assert.rejects(editorArgs("code", root, "archivo.txt"), /no es una carpeta/);
  for (const input of ["@", "--profile", "--install-extension x", '"sin cerrar']) {
    await assert.rejects(editorArgs("code", root, input), /Uso: \/open-vscode/);
  }
  await assert.rejects(editorArgs("zed", root, "--profile Go"), /Uso: \/open-zed/);
  writeFileSync(stateFile, "{");
  await assert.rejects(editorArgs("code", root, "--profile Go"), /catálogo de perfiles/);
  assert.deepEqual(await editorArgs("code", root, "'Mi web'"), ["-n", folder]);
} finally {
  if (previousPortable === undefined) delete process.env.VSCODE_PORTABLE;
  else process.env.VSCODE_PORTABLE = previousPortable;
  rmSync(editorTest, { recursive: true, force: true });
}

// --- Subagentes: estados reales V2, prioridad y duración ---
const child = (id, outcome, updated = 1000) => ({
  id, parentID: "root", outcome, time: { created: 0, updated, idle: 65000 },
});
const childSessions = [
  child("done", "succeeded", 9000), child("stopped", "interrupted"),
  child("error", "failed"), child("busy", "succeeded"), child("waiting"),
  child("question"), child("unknown"),
];
const running = new Set(["busy", "waiting", "question"]);
const childContext = {
  data: { session: {
    root: () => "root",
    family: () => ["root", ...childSessions.map((session) => session.id), "missing"],
    get: (id) => id === "root" ? { id } : childSessions.find((session) => session.id === id),
    status: (id) => running.has(id) ? "running" : "idle",
    permission: { list: (id) => id === "waiting" ? [{}] : [] },
    form: { list: (id) => id === "question" ? [{}] : [] },
  } },
};
assert.deepEqual(childSessions.map((session) => state(childContext, session)),
  ["done", "interrupted", "failed", "running", "permission", "question", "idle"]);
assert.deepEqual(children(childContext).map((session) => session.id), []);
assert.deepEqual(children(childContext, "root").map((session) => session.id),
  ["waiting", "question", "busy", "error", "stopped", "unknown", "done"]);
assert.equal(elapsed(childSessions[0], false, 999000), "1m 5s");
assert.equal(elapsed(childSessions[3], true, 125000), "2m 5s");

// --- Engram: política crítica, límite de contexto y sustitución del protocolo ---
const hooks = new Map();
await engram.setup({
  session: { hook: async (name, callback) => hooks.set(name, callback) },
  tool: { hook: async (name, callback) => hooks.set(name, callback) },
});
const event = {
  sessionID: "ses_real",
  system: [{ type: "text", text: '<mcp_instructions><server name="engram">MANDATORY save every turn</server><server name="other">keep me</server></mcp_instructions>' }],
};
hooks.get("context")(event);
assert.doesNotMatch(event.system[0].text, /MANDATORY/);
assert.match(event.system[0].text, /keep me/);
assert.match(event.system[1].text, /ses_real/);
const read = { tool: "engram_mem_context", input: { project: "test", max_bytes: 65536 } };
hooks.get("execute.before")(read);
assert.deepEqual(read.input, { project: "test", compact: true, max_bytes: 8192 });
read.input.max_bytes = 1024;
hooks.get("execute.before")(read);
assert.equal(read.input.max_bytes, 1024);
const unrelated = { tool: "other", input: { max_bytes: 65536 } };
hooks.get("execute.before")(unrelated);
assert.equal(unrelated.input.max_bytes, 65536);

for (const capture_prompt of [undefined, true, false]) {
  const save = { tool: "engram_mem_save", input: { content: "decisión durable", capture_prompt } };
  hooks.get("execute.before")(save);
  assert.equal(save.input.capture_prompt, false);
  assert.equal(save.input.content, "decisión durable");
}
for (const [requested, expected] of [[undefined, 5], [20, 5], [2, 2], [0, 5], [-1, 5]]) {
  const search = { tool: "engram_mem_search", input: { query: "historia", limit: requested } };
  hooks.get("execute.before")(search);
  assert.deepEqual(search.input, { query: "historia", limit: expected });
}

// Casos de política según el matching documentado V2; no simula su scanner shell.
const config = JSON.parse(readFileSync(new URL("../templates/opencode.jsonc", import.meta.url)));
const cli = JSON.parse(readFileSync(new URL("../templates/cli.json", import.meta.url)));
assert.ok(config.plugins.includes("@dietrichgebert/ponytail@5.3.3"));
function matches(pattern, value) {
  return new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".")}$`).test(value);
}
function permission(action, resource) {
  return config.permissions.reduce((effect, rule) => {
    const match = matches(rule.resource, resource) || (action === "shell" && rule.resource.endsWith(" *") && resource === rule.resource.slice(0, -2));
    return matches(rule.action, action) && match ? rule.effect : effect;
  }, "allow");
}
for (const [action, resource, expected] of [
  ["shell", "git status", "allow"], ["shell", "git status --short", "allow"],
  ["shell", "git diff --no-ext-diff --no-textconv", "allow"],
  ["shell", "git diff --no-ext-diff --no-textconv --output=.env", "ask"],
  ["shell", "git log --output=archivo", "ask"], ["shell", "node script.js", "ask"],
  ["shell", "git push origin main", "ask"], ["shell", "sudo", "deny"],
  ["shell", "sudo pacman -S paquete", "deny"], ["subagent", "general", "ask"],
  ["skill", "unknown-skill", "deny"], ["skill", "context7-mcp", "deny"],
  ["skill", "opencode", "allow"], ["skill", "report", "allow"],
  ["skill", "document-files", "allow"], ["skill", "frontend-design", "allow"],
  ["skill", "modern-web-guidance", "allow"], ["skill", "chrome-extensions", "deny"],
  ["skill", "presentation-slides", "allow"], ["skill", "diagram-design", "allow"],
  ["skill", "playwright-cli", "allow"], ["skill", "skill-governance", "allow"],
  ...["ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help"].map((id) => ["skill", id, "allow"]),
  ["read", "node_modules/pkg/index.js", "ask"], ["read", "packages/ui/node_modules/pkg/index.js", "ask"],
  ["read", "/workspace/project/.venv/lib/pkg.py", "ask"], ["read", "src/main.ts", "allow"],
  ["read", "build/output.js", "ask"], ["read", "src/rebuild/main.ts", "allow"],
  ["read", "~/.ssh/id_ed25519", "deny"], ["edit", "~/.ssh/config", "deny"],
  ["engram_mem_save", "*", "allow"], ["engram_mem_save_prompt", "*", "deny"],
  ["engram_mem_capture_passive", "*", "deny"],
]) assert.equal(permission(action, resource), expected, `${action}: ${resource}`);
assert.equal(cli.session.permissions, "prompt");
assert.ok(typeof cli.debug.turn_tokens === "boolean" || cli.debug.turn_tokens === "verbose", "debug.turn_tokens debe ser boolean o verbose");
assert.deepEqual(config.mcp.servers.codegraph, {
  type: "local", command: ["codegraph", "serve", "--mcp"], disabled: true,
});
assert.equal(config.agent, undefined);
assert.deepEqual(Object.keys(config.providers), ["openai"]);
assert.deepEqual(config.skills, ["~/.config/opencode/skills"]);

const skillsLock = JSON.parse(readFileSync(new URL("../templates/skills-lock.json", import.meta.url)));
assert.equal(skillsLock.version, 1);
const managedSkills = skillsLock.skills.map((entry) => entry.id).sort();
assert.deepEqual(managedSkills, [
  "diagram-design", "document-files", "frontend-design", "modern-web-guidance", "playwright-cli", "presentation-slides", "skill-governance",
]);
assert.deepEqual(readdirSync(new URL("../templates/skills", import.meta.url)).sort(), managedSkills);
for (const { id } of skillsLock.skills) {
  const text = readFileSync(new URL(`../templates/skills/${id}/SKILL.md`, import.meta.url), "utf8");
  assert.match(text, /^---\n[\s\S]*\ndescription:/, id);
}
const skillHash = (id) => treeHash(fileURLToPath(new URL(`../templates/skills/${id}`, import.meta.url)));
function treeHash(root) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  walk(root);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(relative(root, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
for (const entry of skillsLock.skills) assert.equal(skillHash(entry.id), entry.content_sha256, entry.id);

// --- Account Quota: copia solo de ejecución de su proyecto; una entrada de servidor que trae su TUI y su RPC ---
// Se actualiza copiando de nuevo desde el proyecto (nunca editando aquí) y fijando su versión y hash.
const accountQuota = { version: "1.0.0", content_sha256: "ffcf86c979d8f2a20c6b0941f698aaa84770ede04eb70c3358c280a5a113618e" };
const quotaRoot = fileURLToPath(new URL("../templates/plugins/account-quota", import.meta.url));
assert.deepEqual(config.plugins.filter((entry) => (entry.package ?? entry) === "./plugins/account-quota"), [{
  package: "./plugins/account-quota", options: { experimentalCodexUsage: true, experimentalClaudeUsage: true },
}]);
assert.ok(!cli.plugins.some((entry) => String(entry.package ?? entry).includes("account-quota")), "Account Quota se registra solo en opencode.jsonc");
const quotaManifest = JSON.parse(readFileSync(join(quotaRoot, "package.json")));
assert.equal(quotaManifest.name, "account-quota");
assert.equal(quotaManifest.version, accountQuota.version);
assert.deepEqual(quotaManifest.exports, { ".": "./index.js", "./tui": "./tui.tsx", "./rpc": "./rpc.js" });
assert.equal(quotaManifest.dependencies, undefined, "Account Quota no instala dependencias");
assert.deepEqual(readdirSync(quotaRoot).sort(), [
  "claude.js", "codex.js", "deepseek.js", "index.js", "inventory.js", "package.json", "preferences.js",
  "routing.js", "rpc.js", "rules.js", "server.js", "sync.js", "tui.tsx", "view.js",
]);
for (const name of readdirSync(quotaRoot)) {
  assert.doesNotMatch(readFileSync(join(quotaRoot, name), "utf8"), /\/home\/|\/Users\/|[A-Z]:\\Users\\/, `${name}: ruta personal`);
}
assert.equal(treeHash(quotaRoot), accountQuota.content_sha256, "Account Quota: la copia no coincide con la revisión fijada");
const governance = readFileSync(new URL("../templates/skills/skill-governance/SKILL.md", import.meta.url), "utf8");
assert.match(governance, /opencode\/autoinvoke: false/);
const playwrightSkill = readFileSync(new URL("../templates/skills/playwright-cli/SKILL.md", import.meta.url), "utf8");
assert.doesNotMatch(playwrightSkill, /npm install -g|allowed-tools:/);
const playwrightLock = JSON.parse(readFileSync(new URL("../templates/tools/playwright-cli/package-lock.json", import.meta.url)));
const playwrightPackage = playwrightLock.packages["node_modules/@playwright/cli"];
assert.equal(playwrightPackage.version, "0.1.21");
assert.equal(playwrightPackage.integrity, skillsLock.skills.find((entry) => entry.id === "playwright-cli").runtime.integrity);
const slidesLock = JSON.parse(readFileSync(new URL("../templates/tools/presentations/package-lock.json", import.meta.url)));
const slidesRuntime = skillsLock.skills.find((entry) => entry.id === "presentation-slides").runtime;
assert.equal(slidesLock.packages["node_modules/pptxgenjs"].version, slidesRuntime.version);
assert.equal(slidesLock.packages["node_modules/pptxgenjs"].integrity, slidesRuntime.integrity);
const webRuntime = skillsLock.skills.find((entry) => entry.id === "modern-web-guidance").runtime;
const webLock = JSON.parse(readFileSync(new URL("../templates/tools/modern-web-guidance/package-lock.json", import.meta.url)));
assert.equal(webLock.packages[""].dependencies[webRuntime.package], webRuntime.version);
assert.equal(webLock.packages[`node_modules/${webRuntime.package}`].version, webRuntime.version);
assert.equal(webLock.packages[`node_modules/${webRuntime.package}`].integrity, webRuntime.integrity);

const models = config.providers.openai.models;
assert.equal(config.agents.title.model, "opencode/big-pickle");
assert.deepEqual(config.compaction, { auto: true, keep: { tokens: 30000 }, buffer: 20000 });
const thresholds = {
  "gpt-6-astra": 400000,
  "gpt-6.1-sol": 550000,
  "gpt-6.1-terra": 450000,
  "gpt-6-luna": 350000,
};
assert.deepEqual(Object.keys(models).sort(), [
  ...Object.keys(thresholds), "gpt-6-luna-fast", "gpt-image-2",
].sort());
// El modelo de `experimental.image_generate` es de imagen: no tiene límites de contexto ni compacta.
assert.equal(config.experimental.image_generate.model, "openai/gpt-image-2");
assert.deepEqual(models["gpt-image-2"], { type: "image", package: "@opencode/ai/providers/openai/images", disabled: false });
for (const [id, options] of Object.entries(models)) {
  assert.notEqual(options.disabled, true, `${id}: disponible`);
  if (options.type === "image") continue;
  for (const [name, value] of Object.entries(options.limit)) {
    assert.ok(["context", "input", "output"].includes(name));
    assert.ok(Number.isInteger(value) && value > 0, `${id}: limit.${name}`);
  }
  const { context, input, output } = options.limit;
  assert.ok(input + output <= context, `${id}: entrada y salida deben caber en el contexto`);
  const threshold = Math.min(input - config.compaction.buffer, context - Math.max(Math.min(output, 32000), config.compaction.buffer));
  assert.equal(threshold, thresholds[id.replace(/-fast$/, "")], `${id}: umbral de compactación`);
}

console.log("OK: editores (carpetas y perfiles); subagentes (estados, orden y duración); Ponytail; Engram; skills y runtime fijados; Account Quota fijado; permisos, modelos y títulos.");
