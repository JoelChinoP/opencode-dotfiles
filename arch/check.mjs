// node arch/check.mjs — comprobaciones sin red, paquetes npm ni llamadas a modelos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import engram from "../templates/plugins/engram/index.js";
import ponytail from "../templates/plugins/ponytail/index.js";
import ponytailTui from "../templates/plugins/ponytail/tui.js";
import { children, elapsed, state } from "../templates/plugins/subagent-statusline.v2/state.js";

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

// --- Ponytail: nivel inicial, comandos y aislamiento por sesión ---
async function ponytailHarness(options) {
  const hooks = new Map();
  const storage = new Map();
  let command;
  await ponytail.setup({
    options,
    storage: {
      get: async (key) => storage.get(key),
      set: async (key, value) => storage.set(key, value),
    },
    session: { hook: async (name, callback) => hooks.set(name, callback) },
    command: { transform: async (callback) => callback({ add: (definition) => { command = definition; } }) },
  });
  return {
    command,
    context: async (sessionID) => {
      const event = { sessionID, system: [] };
      await hooks.get("context")(event);
      return event.system.map((part) => part.text).join("\n");
    },
    prompt: (sessionID, text) => hooks.get("prompt")({ sessionID, prompt: { text } }),
  };
}

delete process.env.PONYTAIL_DEFAULT_MODE;
const harness = await ponytailHarness({ defaultMode: "lite" });
assert.match(await harness.context("ses_a"), /Level: lite/);
await harness.command.execute({ sessionID: "ses_a", prompt: { text: "" } });
assert.match(await harness.context("ses_a"), /Level: full/);
assert.match(await harness.context("ses_b"), /Level: lite/);
await assert.rejects(harness.command.execute({ sessionID: "ses_a", prompt: { text: "typo" } }));
await harness.prompt("ses_a", "stop ponytail");
assert.equal(await harness.context("ses_a"), "");

process.env.PONYTAIL_DEFAULT_MODE = "ultra";
assert.match(await (await ponytailHarness({ defaultMode: "lite" })).context("ses_c"), /Level: ultra/);
process.env.PONYTAIL_DEFAULT_MODE = "invalido";
assert.match(await (await ponytailHarness({ defaultMode: "full" })).context("ses_d"), /Level: full/);
delete process.env.PONYTAIL_DEFAULT_MODE;

// La TUI confirma solo después de persistir el modo mediante el comando servidor.
let ponytailUiCommand;
let ponytailRoute = { type: "session", sessionID: "ses_ui" };
const toasts = [];
let allowCommand;
const commandReady = new Promise((resolve) => { allowCommand = resolve; });
ponytailTui.setup({
  keymap: { layer: (factory) => { [ponytailUiCommand] = factory().commands; } },
  ui: {
    router: { current: () => ponytailRoute },
    toast: { show: (toast) => toasts.push(toast) },
  },
  client: { session: { command: async ({ sessionID, name, text }) => {
    assert.equal(name, "ponytail");
    await commandReady;
    await harness.command.execute({ sessionID, prompt: { text } });
  } } },
});
assert.deepEqual(ponytailUiCommand.slash, { name: "ponytail", arguments: true });
assert.equal(ponytailUiCommand.enabled(), true);
const changingMode = ponytailUiCommand.run(" FULL ");
assert.equal(toasts.length, 0);
allowCommand();
await changingMode;
assert.match(await harness.context("ses_ui"), /Level: full/);
assert.equal(toasts.at(-1).variant, "success");
assert.match(toasts.at(-1).message, /full/);
await ponytailUiCommand.run("off");
assert.equal(await harness.context("ses_ui"), "");
assert.match(toasts.at(-1).message, /Desactivado/);
await ponytailUiCommand.run();
assert.match(await harness.context("ses_ui"), /Level: full/);
await ponytailUiCommand.run("typo");
assert.equal(toasts.at(-1).variant, "error");
assert.match(await harness.context("ses_ui"), /Level: full/);
ponytailRoute = { type: "home" };
assert.equal(ponytailUiCommand.enabled(), false);

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
  ["skill", "playwright-cli", "allow"], ["skill", "skill-governance", "allow"],
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
assert.deepEqual(skillsLock.skills.map((entry) => entry.id).sort(), [
  "document-files", "frontend-design", "playwright-cli", "skill-governance",
]);
assert.deepEqual(readdirSync(new URL("../templates/skills", import.meta.url)).sort(), [
  "document-files", "frontend-design", "playwright-cli", "skill-governance",
]);
for (const { id } of skillsLock.skills) {
  const text = readFileSync(new URL(`../templates/skills/${id}/SKILL.md`, import.meta.url), "utf8");
  assert.match(text, /^---\n[\s\S]*\ndescription:/, id);
}
function skillHash(id) {
  const root = fileURLToPath(new URL(`../templates/skills/${id}`, import.meta.url));
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
const governance = readFileSync(new URL("../templates/skills/skill-governance/SKILL.md", import.meta.url), "utf8");
assert.match(governance, /opencode\/autoinvoke: false/);
const playwrightSkill = readFileSync(new URL("../templates/skills/playwright-cli/SKILL.md", import.meta.url), "utf8");
assert.doesNotMatch(playwrightSkill, /npm install -g|allowed-tools:/);
const playwrightLock = JSON.parse(readFileSync(new URL("../templates/tools/playwright-cli/package-lock.json", import.meta.url)));
const playwrightPackage = playwrightLock.packages["node_modules/@playwright/cli"];
assert.equal(playwrightPackage.version, "0.1.21");
assert.equal(playwrightPackage.integrity, skillsLock.skills.find((entry) => entry.id === "playwright-cli").runtime.integrity);

const models = config.providers.openai.models;
assert.equal(config.agents.title.model, "opencode/big-pickle");
assert.deepEqual(config.compaction, { auto: true, keep: { tokens: 30000 }, buffer: 20000 });
for (const [id, options] of Object.entries(models)) {
  assert.match(id, /^(gpt-6-(astra|luna)|gpt-6\.1-sol|gpt-5\.6-(luna|terra))(-fast)?$/);
  for (const [name, value] of Object.entries(options.limit)) {
    assert.ok(["context", "input", "output"].includes(name));
    assert.ok(Number.isInteger(value) && value > 0, `${id}: limit.${name}`);
  }
  const { context, input, output } = options.limit;
  assert.ok(input + output <= context, `${id}: entrada y salida deben caber en el contexto`);
  const threshold = Math.min(input - config.compaction.buffer, context - Math.max(Math.min(output, 32000), config.compaction.buffer));
  assert.equal(threshold, 350000, `${id}: umbral de compactación`);
}

console.log("OK: subagentes (estados, orden y duración); Ponytail; Engram; skills y runtime fijados; permisos, modelos y títulos.");
