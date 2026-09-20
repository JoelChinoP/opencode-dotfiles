// Adaptador V2 local para Engram 2.0.0. No instala el adaptador oficial de V1.
// ponytail: gate semántico por instrucciones; añadir cuotas externas si se necesita enforcement auditable.
const policy = `Engram — memoria crítica, no registro de actividad.
No busques al empezar cada tarea ni guardes al terminar cada respuesta.
Lee solo si el usuario refiere historia ausente del contexto, falta una decisión
previa o el resumen de compactación es insuficiente. Empieza con mem_search
(limit <= 5); abre con mem_get_observation solo los IDs relevantes.
mem_context: solo recuperación, compact=true y max_bytes<=8192; no inventes
parámetros observations, prompts, sessions o pinned, que no existen en este MCP.
Guarda solo conocimiento durable: +3 valor entre sesiones, +3 decisión/contrato,
+2 causa no obvia, +2 seguridad/datos, +2 costoso de redescubrir,
+3 preferencia persistente explícita; -2 ya documentado, -3 resultado temporal,
-2 útil solo en este turno. Usa mem_save si suma >=4 o el usuario pide recordarlo.
Usa topic_key estable; actualiza un ID conocido con mem_update. No guardes prompts,
logs crudos, secretos, cambios triviales ni resultados de tests. No consultes para
confirmar un save exitoso. Ignora recordatorios temporales que no superen este gate.
Antes de la primera escritura significativa registra una vez la sesión mediante
mem_session_start usando el ID real indicado abajo; utiliza ese session_id en saves
y summaries. Ante identidad de proyecto ambigua, resuélvela; no inventes un proyecto.
mem_session_summary solo al cerrar trabajo significativo o para un traspaso durable
que el contexto no conserve: objetivo, decisiones, archivos, pendientes y verificación.
Cierra con mem_session_end la sesión registrada cuando realmente finalice, no cada turno.
Tras compactar, usa primero el resumen nativo. No llames memoria automáticamente.
Presupuesto orientativo: trivial 0 llamadas; tarea normal <=1 búsqueda y <=1 guardado;
trabajo mediano <=5 llamadas. Supera el presupuesto solo por nueva evidencia crítica.
Un fallo de memoria no debe impedir entregar la respuesta al usuario.`;

export default {
  id: "engram",
  async setup(ctx) {
    await ctx.session.hook("context", (event) => {
      // Engram 2.0.0 también exige saves incondicionales en initialize.instructions.
      // Sustituir esa sección evita dos protocolos contradictorios en cada turno.
      for (const part of event.system) {
        if (part.type !== "text") continue;
        part.text = part.text.replace(
          /(<server name="engram">)[\s\S]*?(<\/server>)/g,
          "$1Usa la política de memoria crítica del plugin local.$2",
        );
      }
      event.system.push({ type: "text", text: `${policy}\nOpenCode session_id: ${event.sessionID}` });
    });
    await ctx.tool.hook("execute.before", (event) => {
      if (event.tool === "engram_mem_save") {
        event.input = { ...event.input, capture_prompt: false };
      }
      if (event.tool === "engram_mem_search") {
        const requested = event.input?.limit;
        const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 5) : 5;
        event.input = { ...event.input, limit };
      }
      if (event.tool === "engram_mem_context") {
        const requested = event.input?.max_bytes;
        const maxBytes = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 8192) : 8192;
        event.input = { ...event.input, compact: true, max_bytes: maxBytes };
      }
    });
    await ctx.session.hook("compaction", (event) => {
      event.system.push({
        type: "text",
        text: "Conserva objetivo, decisiones, archivos activos, fallos pendientes, verificación e IDs de memoria útiles. Omite logs y búsquedas duplicadas. No ordenes llamadas automáticas a Engram al continuar.",
      });
    });
  },
};
