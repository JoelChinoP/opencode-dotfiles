import { createEffect, createSignal, onCleanup } from "solid-js";
import controls, { watchMode } from "./ui.js";

function Status(props) {
  const [mode, setMode] = createSignal();
  createEffect(() => {
    setMode(undefined);
    onCleanup(watchMode(props.context, props.sessionID, setMode));
  });
  const label = () => mode() === undefined ? "loading…" : mode() === null ? "unavailable" : mode();
  return (
    <box flexDirection="column" marginTop={1}>
      <text fg={mode() && mode() !== "off" ? props.context.theme.text.base : props.context.theme.text.muted}>
        <b>Ponytail</b>{` · ${label()}`}
      </text>
    </box>
  );
}

export default {
  id: "ponytail.tui",
  setup(context) {
    controls.setup(context);
    return context.ui.slot({
      append: "sidebar.content",
      render: (props) => <Status context={context} sessionID={props.sessionID} />,
    });
  },
};
