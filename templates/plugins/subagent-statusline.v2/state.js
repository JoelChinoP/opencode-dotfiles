export const states = {
  permission: { label: "Awaiting permission", tone: "warning", active: true, order: 0 },
  question: { label: "Awaiting response", tone: "warning", active: true, order: 0 },
  running: { label: "Running", tone: "info", active: true, order: 1 },
  failed: { label: "Failed", tone: "error", active: false, order: 2 },
  interrupted: { label: "Interrupted", tone: "warning", active: false, order: 3 },
  idle: { label: "Idle", tone: null, active: false, order: 4 },
  done: { label: "Completed", tone: "success", active: false, order: 5 },
};

export function state(context, session) {
  // V2 devuelve strings: "idle" también es truthy.
  if (context.data.session.status(session.id) === "running") {
    if (context.data.session.permission.list(session.id)?.length) return "permission";
    if (context.data.session.form.list(session.id, session.location)?.length) return "question";
    return "running";
  }
  if (session.outcome === "failed") return "failed";
  if (session.outcome === "interrupted") return "interrupted";
  return session.outcome === "succeeded" ? "done" : "idle";
}

export function children(context, sessionID) {
  if (!sessionID) return [];
  return context.data.session
    .family(context.data.session.root(sessionID))
    .map((id) => context.data.session.get(id))
    .filter((session) => session?.parentID && !session.time.archived)
    .sort((left, right) =>
      states[state(context, left)].order - states[state(context, right)].order ||
      right.time.updated - left.time.updated,
    );
}

export function title(session) {
  return (session.title || "Untitled subagent")
    .replace(/\s*\(@[^)]+ subagent\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function elapsed(session, active, now) {
  // Tiempo de sesión hasta su último reposo; no tiempo facturado del modelo.
  const end = active ? now : (session.time.idle ?? session.time.updated);
  const seconds = Math.max(0, Math.floor((end - session.time.created) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
}
