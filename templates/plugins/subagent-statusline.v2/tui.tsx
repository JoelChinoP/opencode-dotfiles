import { Plugin } from "@opencode/plugin/tui";

const MAX_ROWS = 5;

function children(context, sessionID) {
  if (!sessionID) return [];
  const rootID = context.data.session.root(sessionID);
  return context.data.session
    .family(rootID)
    .map((id) => context.data.session.get(id))
    .filter((session) => session?.parentID)
    .sort((left, right) => right.time.updated - left.time.updated);
}

function status(context, session) {
  if (context.data.session.status(session.id)) return "running";
  return session.outcome === "failed" ? "failed" : "done";
}

function counts(context, sessions) {
  return sessions.reduce(
    (result, session) => {
      result[status(context, session)] += 1;
      return result;
    },
    { running: 0, done: 0, failed: 0 },
  );
}

function title(session) {
  return session.title.replace(/\s*\(@[^)]+ subagent\)\s*$/, "");
}

function tokens(session) {
  const total = session.tokens
    ? session.tokens.input + session.tokens.output + session.tokens.reasoning
    : 0;
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)}k`;
  return String(total);
}

function marker(value) {
  if (value === "running") return "~";
  if (value === "failed") return "x";
  return "✓";
}

export default Plugin.define({
  id: "subagent-statusline.v2",
  setup(context) {
    const footer = context.ui.slot({
      append: "prompt.footer.status",
      render: ({ sessionID }) => {
        const summary = counts(context, children(context, sessionID));
        if (!summary.running && !summary.done && !summary.failed) return null;
        return (
          <text>{`SA ~${summary.running} ✓${summary.done} x${summary.failed}`}</text>
        );
      },
    });

    const sidebar = context.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => {
        if (!sessionID) return null;
        const sessions = children(context, sessionID);
        const summary = counts(context, sessions);
        return (
          <box flexDirection="column">
            <text>{`Subagents  ~${summary.running} ✓${summary.done} x${summary.failed}`}</text>
            {sessions.slice(0, MAX_ROWS).map((session) => {
              const value = status(context, session);
              return (
                <text>{`${marker(value)} ${title(session)} · ${tokens(session)} tok`}</text>
              );
            })}
          </box>
        );
      },
    });

    return () => {
      footer();
      sidebar();
    };
  },
});
