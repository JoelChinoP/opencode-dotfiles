// Adaptación local V2 de Ponytail 4.10.0; procedencia y licencia en docs/fuentes.md.
const modes = new Set(["lite", "full", "ultra", "off"]);
const rules = `Ponytail: lazy means efficient, not careless.
Understand the task, trace the real flow and inspect callers before changing code.
Before code: YAGNI -> reuse existing code -> stdlib -> native platform -> installed
dependency -> one line -> minimum working code. Fix root causes in the shared path.
No unrequested abstractions, avoidable dependencies, boilerplate or future scaffolding.
Prefer deletion and boring code. Preserve validation, error handling, security,
accessibility, calibration and explicit requirements. Verify meaningful changes.
Mark real deliberate limits with a ponytail: comment naming the ceiling and upgrade path.
Keep explanations concise unless detail is requested. /ponytail without a level means full.
Modes persist per session; stop ponytail or normal mode switches off.`;
const intensity = {
  lite: "Build what was asked; mention a simpler alternative in one line when useful.",
  full: "Enforce the ladder. Use the shortest correct diff and explanation.",
  ultra: "Challenge speculative requirements; prefer deletion and the smallest correct solution.",
};

// Orden de resolución del nivel inicial: variable de entorno, opción del plugin, lite.
function resolveDefault(options) {
  for (const candidate of [process.env.PONYTAIL_DEFAULT_MODE, options?.defaultMode, "lite"]) {
    const mode = String(candidate ?? "").trim().toLowerCase();
    if (modes.has(mode)) return mode;
  }
  return "lite";
}

export default {
  id: "ponytail",
  async setup(ctx) {
    const defaultMode = resolveDefault(ctx.options);

    await ctx.command.transform((editor) => {
      editor.add({
        name: "ponytail",
        description: "Ponytail lite|full|ultra|off (sin argumento: full)",
        async execute({ sessionID, prompt }) {
          const mode = prompt.text.trim().toLowerCase() || "full";
          if (!modes.has(mode)) throw new Error("Use /ponytail lite|full|ultra|off");
          await ctx.storage.set(`mode/${sessionID}`, mode);
        },
      });
    });
    await ctx.session.hook("prompt", async ({ sessionID, prompt }) => {
      if (/^(stop ponytail|normal mode)\s*[.!]?$/i.test(prompt.text.trim())) {
        await ctx.storage.set(`mode/${sessionID}`, "off");
      }
    });
    await ctx.session.hook("context", async (event) => {
      const mode = (await ctx.storage.get(`mode/${event.sessionID}`)) ?? defaultMode;
      if (mode === "off") return;
      event.system.push({ type: "text", text: `${rules}\nLevel: ${mode}. ${intensity[mode]}` });
    });
  },
};
