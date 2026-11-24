import { Plugin } from "@opencode/plugin/tui";
import { spawn } from "node:child_process";
import { editorArgs } from "./editor.js";

export default Plugin.define({
  id: "open-editor",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [["open-zed", "zed", "Zed"], ["open-vscode", "code", "VS Code"]].map(([name, bin, title]) => ({
        id: `open-editor.${bin}`,
        title: `Abrir carpeta en ${title}`,
        group: "Proyecto",
        palette: true,
        slash: { name, arguments: true },
        run: async (input) => {
          const report = (message) => context.ui.toast.show({ title, message, variant: "error" });
          try {
            const route = context.ui.router.current();
            const location = route.type === "session" ? context.data.session.get(route.sessionID)?.location
              : context.location ?? context.data.location.default();
            const args = await editorArgs(bin, location?.directory, input);
            const proc = spawn(bin, args, { detached: true, stdio: "ignore" });
            proc.once("error", (err) => report(err.code === "ENOENT" ? `No se encontró «${bin}» en el PATH de la TUI.` : err.message));
            proc.once("exit", (code) => {
              if (code) report(`«${bin}» terminó con código ${code}.`);
            });
            proc.unref();
          } catch (err) {
            report(err.message);
          }
        },
      })),
    }));
  },
});
