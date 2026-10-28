export default {
  id: "ponytail.tui",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "ponytail.mode",
        title: "Ponytail lite|full|ultra|off (sin argumento: full)",
        group: "Session",
        palette: true,
        slash: { name: "ponytail", arguments: true },
        enabled: () => context.ui.router.current().type === "session",
        async run(input) {
          const route = context.ui.router.current();
          if (route.type !== "session") return;
          const mode = input?.trim().toLowerCase() || "full";
          try {
            await context.client.session.command({
              sessionID: route.sessionID,
              name: "ponytail",
              text: mode,
            });
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
