import { Ponytail } from "./rpc.js";

export default {
  setup(context) {
    const rpc = context.client.rpc(Ponytail);
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "ponytail.mode",
        title: "Ponytail lite|full|ultra|off (sin argumento: full)",
        group: "Session",
        palette: true,
        slash: { name: "ponytail", arguments: true },
        enabled: () => ["home", "session"].includes(context.ui.router.current().type),
        async run(input) {
          const route = context.ui.router.current();
          if (route.type === "home") {
            context.ui.toast.show({
              title: "Ponytail",
              message: "Inicia un chat para cambiar el modo de Ponytail.",
              variant: "info",
            });
            return;
          }
          if (route.type !== "session") return;
          let mode;
          try {
            ({ mode } = await rpc.set({
              sessionID: route.sessionID,
              mode: input ?? "",
            }, { location: context.data.session.get(route.sessionID)?.location ?? context.location }));
          } catch (error) {
            context.ui.toast.show({
              title: "Ponytail",
              message: error instanceof Error ? error.message : String(error),
              variant: "error",
            });
            return;
          }
          context.ui.toast.show({
            title: "Ponytail",
            message: mode === "off" ? "Desactivado en esta sesión" : `Modo ${mode} activado en esta sesión`,
            variant: "success",
          });
        },
      }],
    }));
  },
};

// El servidor es la fuente de verdad; una respuesta antigua no pisa un cambio reciente.
export function watchMode(context, sessionID, update) {
  const rpc = context.client.rpc(Ponytail);
  const location = context.data.session.get(sessionID)?.location ?? context.location;
  let revision = 0;
  let disposed = false;
  let unsubscribe;
  const connect = () => {
    unsubscribe?.();
    unsubscribe = rpc.events.on("updated", (event) => {
      if (disposed || event.data.sessionID !== sessionID) return;
      if (location && event.location.directory !== location.directory) return;
      revision += 1;
      update(event.data.mode);
    });
    const request = ++revision;
    void rpc.get({ sessionID }, { location }).then(
      ({ mode }) => { if (!disposed && request === revision) update(mode); },
      () => { if (!disposed && request === revision) update(null); },
    );
  };
  const stop = context.data.on("server.connected", connect);
  connect();
  return () => {
    disposed = true;
    unsubscribe?.();
    stop();
  };
}
