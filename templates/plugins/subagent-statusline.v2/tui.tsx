import { Plugin } from "@opencode/plugin/tui";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { children, elapsed, state, states, title } from "./state.js";

// ponytail: cinco filas en la barra; el selector nativo permite recorrer todas.
const MAX_ROWS = 5;

function Row(props) {
  const context = props.context;
  const info = createMemo(() => states[state(context, props.session)]);
  const color = () => info().tone
    ? context.theme.text.feedback[info().tone].base
    : context.theme.text.muted;
  const open = () => context.ui.router.navigate({ type: "session", sessionID: props.session.id });
  onMount(() => {
    const id = props.session.id;
    void Promise.allSettled([
      context.data.session.permission.sync(id),
      context.data.session.form.sync(id, props.session.location),
    ]);
  });

  return (
    <box flexDirection="column" marginTop={1}>
      <text fg={context.theme.text.base} maxHeight={2} wrapMode="word" onMouseUp={open}>
        <b>{title(props.session)}</b>
      </text>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={color()}>{info().label}</text>
        <text fg={context.theme.text.muted}>{elapsed(props.session, info().active, props.now)}</text>
      </box>
      <text fg={context.theme.text.muted} wrapMode="word" maxHeight={2}>
        {`${props.session.agent ?? "subagent"} / ${props.session.model?.id ?? "unknown model"}`}
      </text>
      <text fg={context.theme.text.base} onMouseUp={open}>[Open]</text>
    </box>
  );
}

function Sidebar(props) {
  const context = props.context;
  const sessions = createMemo(() => children(context, props.sessionID));
  const active = createMemo(() => sessions().filter((session) => states[state(context, session)].active).length);
  const [now, setNow] = createSignal(Date.now());
  const busy = createMemo(() => active() > 0);

  createEffect(() => {
    if (!busy()) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <Show when={sessions().length}>
      <box flexDirection="column" marginTop={1}>
        <text fg={context.theme.text.base}><b>Subagents</b>{`  ${active()} active / ${sessions().length}`}</text>
        <For each={sessions().slice(0, MAX_ROWS)}>
          {(session) => <Row context={context} session={session} now={now()} />}
        </For>
        <Show when={sessions().length > MAX_ROWS}>
          <text fg={context.theme.text.muted}>{`+${sessions().length - MAX_ROWS} more in picker`}</text>
        </Show>
        <text marginTop={1} fg={context.theme.text.base}
          onMouseUp={() => context.keymap.dispatch("session.child.first")}>
          /subagents: open picker
        </text>
      </box>
    </Show>
  );
}

function Footer(props) {
  const sessions = createMemo(() => children(props.context, props.sessionID));
  const active = () => sessions().filter((session) => states[state(props.context, session)].active).length;
  const errors = () => sessions().filter((session) => state(props.context, session) === "failed").length;
  return (
    <Show when={sessions().length}>
      <text>{`Subagents: ${active()} active${errors() ? `, ${errors()} failed` : ""}`}</text>
    </Show>
  );
}

export default Plugin.define({
  id: "subagent-statusline.v2",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "subagent-statusline.manage",
        title: "Manage subagents",
        group: "Session",
        palette: true,
        slash: { name: "subagents" },
        enabled: () => context.ui.router.current().type === "session",
        run: () => context.keymap.dispatch("session.child.first"),
      }],
    }));
    const footer = context.ui.slot({
      append: "prompt.footer.status",
      render: (props) => <Footer context={context} sessionID={props.sessionID} />,
    });
    const sidebar = context.ui.slot({
      append: "sidebar.content",
      render: (props) => <Sidebar context={context} sessionID={props.sessionID} />,
    });
    return () => {
      footer();
      sidebar();
    };
  },
});
