# Hallazgos y decisiones — Arch / OpenCode V2

Fecha: **20 de septiembre de 2026**. Alcance: preparar este repositorio y probarlo
en un HOME/XDG aislado. La configuración global del usuario no se ha aplicado.

## Correcciones al informe de entrada

El [informe original](oc-search-config.md) es útil como hipótesis, pero sus marcas
`turn…` no son enlaces bibliográficos verificables y varios ejemplos son V1.
Las fuentes primarias consultadas están en [fuentes.md](fuentes.md).

| Informe | Hallazgo V2 / decisión |
| --- | --- |
| `plugin`, `agent`, `permission` | Formas nativas: `plugins`, `agents`, `permissions` |
| MCP directamente bajo `mcp` / `enabled` | `mcp.servers` / `disabled` |
| MCP `timeout: 5000` | Objeto `startup`, `catalog`, `execution`; conservar defaults |
| `compaction.prune: true` | V2 lo ignora y avisa; no equivale a activar pruning |
| `reserved` | Forma nativa `buffer`; cola reciente `keep.tokens` |
| Reserva 12k y temperatura/top_p fijos | Mantener defaults V2 20k/15k y ajustes del modelo, sin proveedor elegido |
| `small_model` | Equivale al modelo del agente `title`; no un modelo pequeño universal |
| LSP como recuperación local | V2 acepta configuración LSP, pero no ejecuta servidores/herramientas LSP actualmente |
| Hook `experimental.session.compacting` | API V2: `ctx.session.hook("compaction", ...)` |
| `engram setup opencode` | En Engram 2.0.0 instala aún el adaptador **OpenCode 1.x** |
| `mem_context` con contadores por sección | MCP 2.0.0 solo expone `project`, `scope`, `compact`, `max_bytes` |
| Ponytail `lite` cuesta 0.2–0.5k | No es una garantía: upstream 4.10.0 conserva casi todo el ruleset en cada modo |
| Todos los plugins en servidor | Statusline y Herdr V2 pertenecen a `cli.json` |
| `codegraph serve --mcp` | No corresponde al producto del informe; usar el endpoint oficial remoto verificado |

La documentación de plugins muestra algunas rutas a archivos, pero la versión
instalada 2.0.8 emite `configured plugin path must be a directory` para las rutas
explícitas probadas. Engram se conserva como paquete local mínimo en
`templates/plugins/engram/`, con `package.json` y exports, sin dependencias npm.
Las rutas de configuración, instalación y pruebas apuntan a ese directorio.

No se empleó el esquema genérico `opencode.ai/config.json` para inferir la forma
V2: se contrastó con la documentación `/v2/`, OpenAPI V2 y el runtime 2.0.8.
Se conserva `$schema` por integración del editor.

## Perfil implementado

- Contexto fijo corto: reglas globales + política Engram + reglas Ponytail inyectadas
  por su plugin local.
- MCP Context7 remoto activado, sin plugin que añada skills.
- MCP Engram local activado con el binario oficial **2.0.0 estable**, perfil agent.
- MCP CodeGraph remoto configurado y desactivado, sin procesos ni índice local.
- Plugins locales mantenidos: Engram, Ponytail y statusline. Herdr se instala por
  su mecanismo oficial.
- Compactación nativa: `auto: true`, `keep.tokens: 30000`, `buffer: 20000`.
- Agentes integrados de OpenCode. Los cinco agentes extra propuestos en el informe
  no son necesarios para los tres MCP de este alcance.
- Cuatro skills administradas: `document-files` local, `frontend-design`
  vendorizada, `playwright-cli` adaptada y `skill-governance` de invocación
  explícita. El resto de IDs queda oculto por permisos.
- Playwright usa CLI fijada y Chromium del sistema, no browser MCP. Se mantienen
  fuera GitHub MCP, cachés personalizadas, embeddings, router y gestor de presupuestos.

## Engram: gate crítico

El plugin previo no solo inyectaba instrucciones: guardaba prompts, capturaba
resultados de subagentes, consultaba recordatorios y recuperaba memoria al compactar.
Una regla en AGENTS.md no detendría esas llamadas programadas.

Este adaptador **no inicia HTTP, no captura prompts ni tool outputs y no lee/escribe
memoria automáticamente**. OpenCode inicia únicamente el proceso MCP solicitado.
La continuidad inmediata se conserva con la compactación nativa; las memorias
durables son llamadas explícitas del agente cuando pasan el gate.

Además, Engram 2.0.0 anuncia en su propio `initialize.instructions` saves proactivos
y resúmenes obligatorios. El hook V2 sustituye solo esa sección del servidor
`engram` por una referencia a la política local. Así no permanecen dos protocolos
contradictorios. No cambia las instrucciones de otros servidores.

### Lecturas

- Cero llamadas por comenzar una tarea, detectar un repositorio o terminar un turno.
- Buscar cuando falta historia necesaria o el usuario refiere una decisión previa.
- Primero `mem_search`, hasta 5 resultados (límite aplicado por el hook); abrir
  solo observaciones relevantes.
- `mem_context` solo ante recuperación insuficiente. El hook fija `compact=true`
  y limita `max_bytes` a 8192 antes de ejecutarlo, respetando presupuestos menores.

### Escrituras

Puntuación orientativa del informe: valor entre sesiones +3, decisión/contrato +3,
causa no obvia +2, seguridad/datos +2, costoso de redescubrir +2, preferencia
persistente explícita +3; ya documentado −2, temporal −3, útil solo en el turno −2.
Guardar si suma ≥4 o el usuario pide expresamente recordar algo.

- `topic_key` estable para evolución, `mem_update` para un ID conocido.
- Antes de la primera escritura, registrar una vez el ID real de OpenCode con
  `mem_session_start`; saves/resúmenes usan ese `session_id` explícito.
- No asumir que `_meta.sessionID` de OpenCode registra por sí solo una sesión en
  Engram. La release advierte ambigüedad con sesiones raíz antiguas (#1242).
- Resumir solo un cierre significativo/traspaso durable, no cada respuesta.
- Cerrar la sesión registrada con `mem_session_end` cuando realmente termine.
- `mem_save_prompt` y `mem_capture_passive` quedan denegados por configuración.
- `mem_save` recibe siempre `capture_prompt: false` desde el hook, incluso si
  el modelo intenta activarlo. Esto cierra la vía interna de captura de Engram.

El gate semántico y los presupuestos son **instrucciones al modelo**, no un contador
de llamadas infalible. Sí son controles ejecutables el límite de `mem_context`,
los permisos y la ausencia de captura automática. Añadir un clasificador externo
para decidir si cada memoria es «crítica» agregaría inferencia y complejidad.

## Ponytail y statusline restaurados

El commit `8fce8a1` retiró las adaptaciones de Ponytail, statusline y Herdr, sus
pruebas y la plantilla `cli.json`. A petición del usuario se restauran **Ponytail y
statusline** con sus mecanismos locales; Herdr sigue delegado a su instalador.

- **Ponytail:** el entrypoint upstream 4.10.0 (`config`,
  `experimental.chat.system.transform`, `command.execute.before`) usa la API V1,
  que OpenCode 2.0.8 no ejecuta. Se restaura la adaptación local V2, sin dependencia
  npm, con `/ponytail`, estado por sesión y reglas equivalentes a 4.10.0.
  `PONYTAIL_DEFAULT_MODE` se consulta antes que la opción del plugin (`lite`), así
  que la variable exportada anula el `defaultMode: off` que exista en
  `~/.config/ponytail/config.json` para otros agentes.
- **Statusline:** se restaura el `tui.tsx` de la máquina (versión más reciente que
  la eliminada, con estado `done`), registrado en `cli.json` como plugin de TUI.
  No añade contexto al modelo; no requiere npm.
- **Herdr:** su integración oficial V2 requiere una versión con soporte
  (documentado en 0.9.1; la local 0.8.2 instala V1 y OpenCode 2.0.8 la rechaza).
  Herdr administra ese archivo, así que el repositorio no mantiene una copia.
- **Entorno:** el instalador establece `export PONYTAIL_DEFAULT_MODE=lite` en
  `~/.zshenv` (zsh), `~/.bashrc` (bash) o `~/.profile`, de forma idempotente y
  con respaldo del valor previo; escribe a través del symlink a dotfiles.

Los paquetes publicados se gestionan con `opencode plugin add/check/update`.
`update` omite rutas locales y revisiones exactas; una actualización de OpenCode
o Engram sigue requiriendo comprobar el pequeño adaptador de memoria.

## Instalación y límites

- Pacman para dependencias del sistema; el instalador solo indica el comando.
- Excepción autorizada para Engram: archivo de la release oficial con SHA-256 fijado,
  sin Homebrew, AUR, compilación, curl-pipe-shell ni `@latest` móvil.
- Playwright CLI se instala desde un lock npm exacto, con lifecycle scripts
  desactivados y fuera del prefijo global; utiliza Chromium de Arch.
- No existe un venv de OpenCode ni librerías PyPI globales. Las skills actuales
  usan herramientas del sistema, Node fijado o biblioteca estándar. Una futura
  dependencia Python exige PEP 723 y lock `uv` por script, sin activación global.
- Instalación de perfil limpio con respaldo completo, SQLite Backup API y staging.
- Credenciales/modelos no se inventan. Un proveedor personalizado del perfil anterior
  se recupera selectivamente del respaldo; la autenticación nativa queda en datos.
- CodeGraph está listo como entrada desactivada, no autenticado ni validado contra
  un proyecto real. Su endpoint puede recibir código/contexto al activarlo.
- El ahorro de tokens no está medido aquí. Las cifras del informe son estimaciones,
  no resultados de un benchmark de este perfil.

La revisión posterior añade permisos con confirmación, presupuesto por modelo,
loopback, prevalidación y monitor SSH. Véase el
[contraste actualizado](contraste-dotfiles.md) para decisiones, fuentes y pruebas offline.
