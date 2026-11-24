/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import { BoxRenderable, ImageRenderable, TextAttributes, type MarkdownCodeBlockRenderer } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { createSignal } from "solid-js";
import { lstatSync } from "node:fs";

export default Plugin.define({
  id: "image-preview",
  setup(context) {
    let id = 0;
    const renderPreview: MarkdownCodeBlockRenderer = (token, render) => {
      const paths = token.text.trim().split(/\r?\n/);
      if (!paths.every(path => {
        if (!/^\/tmp\/opencode\/[\w-]+\.png$/.test(path)) return false;
        const file = lstatSync(path, { throwIfNoEntry: false });
        return file?.isFile() && file.size <= 8 * 1024 * 1024;
      })) return render.defaultRender();
      const row = new BoxRenderable(context.renderer, {
        id: `gallery-${++id}`, flexDirection: "row", flexWrap: "wrap", gap: 1, marginTop: 1,
      });
      paths.forEach((path, initial) => row.add(new ImageRenderable(context.renderer, {
        id: `image-preview-${++id}`, source: path, width: paths.length === 1 ? "100%" : 18, height: 8, fit: "fit", protocol: "auto",
        onMouseUp(event) {
          if (event.button !== 0) return;
          event.stopPropagation();
          context.ui.dialog.show(() => {
            context.ui.dialog.set({ size: "xlarge", centered: true });
            const dimensions = useTerminalDimensions();
            const [index, select] = createSignal(initial);
            const move = (step: number) => select(i => (i + step + paths.length) % paths.length);
            const many = paths.length > 1;
            if (many) context.keymap.layer(() => ({ mode: "modal", commands: [
              { bind: "left", run: () => { move(-1); } },
              { bind: "right", run: () => { move(1); } },
            ] }));
            const muted = context.theme.text.muted;
            return <box paddingLeft={3} paddingRight={3} paddingBottom={1} gap={1}>
              <box flexDirection="row" justifyContent="space-between">
                <text attributes={TextAttributes.BOLD}>Image {index() + 1} of {paths.length}</text>
                <text fg={muted} onMouseUp={() => context.ui.dialog.clear()}>esc</text>
              </box>
              <image source={paths[index()]} width="100%" height={Math.max(3, dimensions().height - 8)} fit="fit" protocol="auto" />
              <box flexDirection="row" justifyContent="space-between">
                <text fg={muted} onMouseUp={() => move(-1)}>{many ? "← previous" : ""}</text>
                <text fg={muted}>Image {index() + 1}</text>
                <text fg={muted} onMouseUp={() => move(1)}>{many ? "next →" : ""}</text>
              </box>
            </box>;
          });
        },
      })));
      return row;
    };
    const remove = context.markdown.registerCodeBlockRenderer("image-preview", renderPreview);
    // Keep previews in messages written before the fence was renamed.
    const removeLegacy = context.markdown.registerCodeBlockRenderer("miniatura", renderPreview);
    return () => { remove(); removeLegacy(); };
  },
});
