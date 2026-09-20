# Contraste con opencode-dotfiles y pendientes

Revisión: **20-09-2026**, OpenCode local **2.0.8**. Base V2: commit `1ab0877`.
Se compara con el **árbol de trabajo actual** de `../opencode-dotfiles`, que
tiene cambios sin commit sobre `8828f6a`. Su documentación histórica describe
componentes retirados; no todos siguen formando parte de su instalador actual.

## Balance

La base nueva es más pequeña y coherente con V2: servicio administrado nativo,
MCP en formato nativo, Engram fijado y verificado, respaldo SQLite consistente y
plugins locales con comprobaciones. Tras el diagnóstico se aplicaron permisos,
prevalidación y atajos `oc`/`oc-last` para usar la TUI también por SSH. Los límites
acordados se aplican en la sección 3. Quedan pendientes la
migración real, las pruebas con modelo/TUI y Windows. No hace falta recuperar
todo el aprovisionamiento antiguo.

| Área | Repositorio anterior, árbol actual | Perfil V2 actual |
| --- | --- | --- |
| Instalación | Pacman/AUR mediante sudo; servicio systemd propio | Comprueba dependencias; despliega perfil con respaldo; servicio nativo |
| Configuración | `config/opencode.json` V1 es referencia y el instalador base no lo copia | Despliega `opencode.jsonc`, `cli.json`, `AGENTS.md`, plugins y skills fijadas |
| Servicio | Unidad de sistema `opencode-serve`, puerto 4096 y `MemoryHigh=4G` | Servicio nativo en `127.0.0.1`; conserva puerto y autenticación; sin ese límite systemd |
| Engram | Ruta declarada dependiente del PATH/instalación previa | Binario 2.0.0 privado con checksum de descarga y ruta generada |
| Plugins | El paso histórico de skills/plugins fue retirado | Adaptaciones V2 locales Engram, Ponytail y statusline; Herdr oficial opcional |
| Context7 | Configuración de referencia con clave desde entorno | MCP remoto sin clave en plantilla, autenticación por el cliente si hace falta |
| CodeGraph | Binario local `@colbymchenry/codegraph` según inventario previo | Servicio remoto de codegraph.ru desactivado; **es otro producto** |
| Permisos | `bash: ask`, muchas excepciones y bloqueos de lecturas | `shell: ask`, excepciones cortas, lecturas costosas con confirmación y TUI en `prompt` |
| Portapapeles | Instalaba `wl-clipboard`/`xclip` | No los comprueba ni instala |
| Skills | Siete skills de Anthropic, runtimes compartidos y seguimiento de `main` | Tres skills funcionales fijadas y una de gobernanza explícita; sin venv global |
| Windows | Reservado para implementación futura | Guía parcial; no instala el perfil completo |

Las diferencias de permisos son entre **archivos declarados**, no una prueba de
qué política usa hoy el servicio real del usuario.

## 1. Permisos aplicados

### Problema corregido

- La TUI estaba en `autoaccept` y el perfil solo restringía Engram; `build`
  conservaba permiso general de shell. Se cambió a `prompt` y `shell: ask`.
- Confirmar un permiso es una respuesta del cliente al servidor, no otra
  inferencia del modelo. `autoaccept` habría eliminado las confirmaciones de
  `.env`, directorios externos y comandos no autorizados.

**Política instalada:** inspección local con herramientas dedicadas, edición de
código normal y una lista corta de comandos Git permitidos. Los intérpretes,
scripts de paquetes, escrituras Git y otros comandos piden autorización. `sudo`
y lectura/edición de `~/.ssh/*` están denegados. `subagent: ask` controla la
delegación. Se conservan los defaults V2 de `.env` y directorios externos.
Las skills usan allowlist: se permiten `opencode`, `report` y las cuatro
administradas; otros IDs descubiertos en ubicaciones de compatibilidad quedan
ocultos hasta que un proyecto los autorice expresamente.

Comandos de shell permitidos por la plantilla:

```sh
pwd
git status                            # también admite sus argumentos
git ls-files
git diff --no-ext-diff --no-textconv
git diff --no-ext-diff --no-textconv --stat
git log -5 --oneline
```

Los comandos diff desactivan ejecutables externos/textconv y no llevan un `*`
final: opciones como `--output` requieren aprobación. Las reglas exactas están
en [la plantilla](../templates/opencode.jsonc), sin duplicarlas en otro perfil.

Es un punto de partida para repositorios de confianza, no un sandbox. La última
regla coincidente gana. Las reglas específicas de un agente se añaden después
de las globales; los subagentes tienen sus propios permisos. `subagent: ask`
recupera la confirmación que pretendía `task: ask` en el archivo anterior.

Los permisos de archivos no impiden que una shell autorizada lea o modifique
esos archivos. Tampoco filtran automáticamente los resultados de `grep`, cuya
regla recibe la expresión buscada, no las rutas de cada resultado. La política
no es un sandbox de sistema operativo.

### Por qué no copiar la lista antigua

La lista de `../opencode-dotfiles/config/opencode.json` permitía `python *`,
`node *`, `awk *`, `find *`, `make *`, `gh api *`, `cp *` y `mv *`, entre otros.
Pueden ejecutar código, escribir o acceder a los mismos archivos que `read`
deniega. Tampoco `git remote *` es exclusivamente lectura. Una lista de comandos
"peligrosos" denegados no cubre sus equivalentes en un intérprete permitido.

Es preferible autorizar los comandos de test/build necesarios **por proyecto**.
V2 permite guardar aprobaciones con **Allow always**, también por proyecto;
conviene revisar el patrón ofrecido antes de aceptarlo. Un `deny` configurado
no queda anulado por esas aprobaciones. Code Mode sigue aplicando los permisos
de las herramientas anidadas: no hace falta bloquear `execute` para esto.

Para evitar contexto inútil, las reglas globales priorizan fuentes/tests y
búsquedas acotadas, respetando `.gitignore`. Las lecturas directas dentro de
`node_modules`, entornos virtuales, `vendor`, `.git`, `dist`, `build`, `.next` y
cobertura requieren confirmación, permitiendo inspección excepcional. Los
lockfiles y minificados se consultan por fragmentos solo cuando aportan algo.
No se usa `watcher.ignore` como si fuera un filtro de búsqueda: solo afecta al
watcher. La salida de herramientas se limita a 1.000 líneas/32 KiB; lo necesario
se recupera después por partes.

## 2. Correcciones y pendientes

### Configuración e instalación

1. **Temperatura: corregida.** Se retiró `agent.build.temperature: 0.2`.
   Los overlays por agente aún no se envían según la guía V2 y Astra no admite
   `temperature`/`top_p`. No se fuerza otro valor ni se cambia el razonamiento
   de una variante elegida por el usuario. Véase la investigación de modelos abajo.

2. **Guía Windows incompleta, pendiente por petición del usuario.**
   `windows/README.md:5-9` copia únicamente `opencode.jsonc`, que referencia dos
   directorios de plugins y un ejecutable Engram que esa receta no instala.
   Hay que completar instalación y verificación, o retirar esa receta parcial
   y marcarla claramente como pendiente. También faltan `cli.json`, statusline,
   reglas, respaldo y atajos PowerShell.

3. **Validación previa y recuperación: corregidas.** `verify.sh --config-dir`
   comprueba el staging antes de tocar el perfil/rc. El respaldo se copia antes
   de mover nada; los dos renames de intercambio comparten filesystem y se
   restaura el anterior si falla el segundo. No es un intercambio atómico único.
   Un fallo posterior de red o arranque se informa y conserva el respaldo para
   restauración manual; no se manipula la base de datos ni se reinicia en bucle.

### Memoria, entorno y uso real

4. **Engram: corregido y acotado.** El hook fuerza `capture_prompt: false` en
   `mem_save`, incluso si el modelo manda `true`; bloquea la captura interna
   opcional que no cubría denegar `mem_save_prompt`. Limita `mem_search` a cinco
   resultados y conserva `mem_context` compacto de hasta 8 KiB. Respeta límites
   menores, no añade llamadas automáticas y mantiene el criterio de guardar
   conocimiento durable que no esté ya documentado. El criterio semántico sigue
   siendo una instrucción, no un contador infalible.

5. **Ponytail: `lite` consistente.** El instalador respalda y normaliza su
   asignación de shell a `lite`, igual que el entorno del reinicio. La opción
   del plugin sigue siendo `lite`; una sesión puede usar `/ponytail` para cambiar.

6. **Migración del servicio antiguo y wrappers.**
   La instalación nueva no deshabilita `opencode-serve.service` ni retira la
   función histórica `opencode()` que cargaba el entorno de skills. Comprobar
   `systemctl status opencode-serve.service` y `opencode service status` antes
   de migrar evita dejar dos servidores o un puerto ocupado. El atajo nuevo usa
   `command opencode`, por lo que evita esa función al invocarlo. Para trabajo
   local basta el servicio administrado; recuperar systemd solo tiene sentido
   si se necesita un servidor al arrancar el equipo o controles de recursos.

7. **Verificación rígida y cobertura real.**
   `arch/verify.sh` exige el conjunto exacto de MCPs; añadir otro o activar
   CodeGraph hace fallar la verificación del perfil base. Si se quieren admitir
   extensiones, comprobar las integraciones requeridas sin exigir igualdad
   exacta. Falta probar las filas de statusline con subagentes reales, permisos
   `ask`/`deny` en TUI y una tarea real con modelo; las pruebas previas de carga
   de plugins no demuestran esos comportamientos.

### Según necesidad

- **Portapapeles:** documentar/comprobar `wl-clipboard` para Wayland o `xclip`
  para X11 si se necesita pegar imágenes; era una función del instalador anterior.
- **Skills: implementado de forma acotada.** `document-files` evita PyPI con
  Pandoc/LibreOffice/Poppler; `frontend-design` fija commit/licencia;
  `playwright-cli` fija npm y usa Chromium del sistema; `skill-governance` no se
  anuncia automáticamente. No se reconstruye el venv ni se descarga otro navegador.
- **Herdr:** la reinstalación limpia elimina su registro; volver a ejecutar su
  instalación oficial después del perfil ya está documentado.
- **CodeGraph:** elegir el producto y probar un proyecto antes de activarlo;
  el endpoint remoto no sustituye automáticamente al índice local antiguo.
- **Documentación:** se corrigieron los fragmentos duplicados/truncados en
  `docs/hallazgos.md` y `docs/verificacion.md`, y `docs/fuentes.md` enumera los
  tres plugins locales actuales. No hay un entorno Docker de pruebas en este repo,
  aunque `templates/AGENTS.md` lo menciona como recurso si existe en el proyecto.
- **Mediciones y plataformas:** el ahorro de tokens sigue sin medirse; ARM64
  tiene checksum pero no ejecución validada, y Windows no está verificado.

## 3. Modelos y compactación

### Hallazgo: `context` e `input` se combinan, no se sustituyen

Se consultaron documentación V2, código de **v2.0.8**, catálogo real, fichas
OpenAI y discusiones públicas. Antes del ajuste, la plantilla declaraba `context`
750.000 para Astra, 650.000 para Sol y 500.000 para Terra/Luna y sus `-fast`.
No configuraba `input`; Astra/Sol `-fast` tampoco tenían un override.

V2 combina cada campo de `limit` con el catálogo. Para compactar usa:

```text
min(input - buffer, context - max(min(output, 32000), buffer))
```

Por eso **subir solo `context` no basta**. Se comprobó contra el servicio real,
con configuraciones en directorios temporales y sin enviar prompts:

| Configuración | Límite efectivo | Umbral estimado |
| --- | --- | ---: |
| Astra: solo `context: 750000` | 750k contexto / 272k entrada / 128k salida | 252k |
| Sol: solo `context: 650000` | 650k contexto / 272k entrada / 128k salida | 252k |
| Astra: `context: 750000, input: 600000` | 750k / 600k / 128k | 580k |
| Sol: `context: 650000, input: 500000` | 650k / 500k / 128k | 480k |

Los overrides de usuario se aplican **después** del ajuste OAuth en V2. Solo
cambió `limit` en los modelos comparados: se conservaron rutas, transporte,
variantes y demás metadatos. No hace falta otro plugin.

### Capacidad y presupuesto de uso

| Ruta observada | Astra, Sol, Luna y Terra |
| --- | --- |
| API pública | 1.050.000 contexto / 922.000 entrada / 128.000 salida |
| OpenCode 2.0.8 con OAuth Codex, sin overrides | 400.000 contexto / 272.000 entrada / 128.000 salida |
| Catálogo oficial del cliente Codex | `context_window: 272000`, `max_context_window: 872000` |

La revisión anterior trataba 272k como un techo efectivo sin distinguir su
origen. El código V2 lo fija para mantener coherencia con el presupuesto del
cliente Codex; **no demuestra el límite físico del endpoint**. El catálogo
oficial consultado ya distingue presupuesto inicial y máximo ampliado para los
cuatro modelos. Reservar 128k de salida sobre 872k de entrada corresponde al
nivel de 1M, no obliga a usarlo entero.

Los issues [#44821](https://github.com/anomalyco/opencode/issues/44821) y
[#46527](https://github.com/anomalyco/opencode/issues/46527) documentan pruebas
de contexto ampliado con OAuth; el primero llega a ~922k de entrada en una cuenta.
[#47646](https://github.com/anomalyco/opencode/issues/47646) reproduce el ajuste
400k/272k en V2. Son evidencia comunitaria por versión/cuenta/ruta, no una
garantía de que cualquier cuenta acepte 922k. Las recetas V1 de sus comentarios
no se copian: el comportamiento V2 se contrastó con su fuente y catálogo real.

### Configuración aplicada tras la elección del usuario

La configuración actual aplica compactación cercana a 350k también a Astra,
además de Sol/Terra/Luna, aceptando el consumo asociado:

| Modelo | `context` | `input` | `output` | Compactación aproximada |
| --- | ---: | ---: | ---: | ---: |
| Astra | 500.000 | 370.000 | 128.000 | 350.000 |
| Sol | 500.000 | 370.000 | 128.000 | 350.000 |
| Terra y Terra Fast | 500.000 | 370.000 | 128.000 | 350.000 |
| Luna y Luna Fast | 500.000 | 370.000 | 128.000 | 350.000 |

`370000 - 20000 = 350000`. El contexto de 500k permite 370k de entrada más 128k
de salida sin anunciar una ventana innecesariamente grande.

Son presupuestos operativos elegidos, no un óptimo medido. Los IDs `-fast` son
entradas independientes: Astra Fast y Sol Fast mantienen su catálogo, porque
el usuario los retiró de la plantilla. La fuente de configuración es
[`templates/opencode.jsonc`](../templates/opencode.jsonc), con estos ajustes:

```json
{
  "compaction": {
    "auto": true,
    "keep": { "tokens": 30000 },
    "buffer": 20000
  }
}
```

`output: 128000` conserva la capacidad del modelo; no pide que cada respuesta
genere 128k. La reserva que usa el cálculo de compactación está limitada a 32k.
Reducir la salida a unos pocos miles puede truncar razonamiento o parches y no
es la primera palanca para ahorrar.

### Ajustes que acompañan al contexto

1. **Conservar 30k recientes**, frente a los 15k anteriores. Mejora la continuidad
   después del resumen sin retener 100k en cada compactación. No conserva el
   prompt original indefinidamente ni las salidas completas: el resumen local
   abrevia resultados de herramientas a 2.000 caracteres. El hook Engram ya pide
   conservar objetivo, decisiones, archivos y pendientes. Para una tarea extensa,
   una especificación/checklist breve en el repositorio sigue siendo la referencia
   exacta que puede releerse; los requisitos duraderos pueden vivir en `AGENTS.md`.
2. **Mantener `auto: true` y `buffer: 20000`**. Desactivar compactación o quitar
   margen cambia resúmenes preventivos por errores de contexto; `auto` también
   habilita una recuperación ante overflow. El buffer es global, no por modelo.
3. **Razonamiento según tarea**: `medium` como punto de partida en Astra/Sol;
   `low` en Terra/Luna para cambios claros. Subir a `high` cuando la dificultad lo
   requiera, sin fijar `max`/`xhigh` globalmente. Usar las variantes de `/models`;
   no imponer temperatura, `top_p`, límites de pasos ni overlays de agente que V2
   aún no envía. Son recomendaciones de uso, no cambios aplicados.
4. **Caché y transporte nativos**: conservar instrucciones/herramientas estables.
   OpenAI tiene caché automática y la ruta Codex observada ya usa WebSocket.
   WebSocket reduce transferencia, no el tamaño lógico del contexto ni garantiza
   ahorro de cuota. Para GPT-5.6/Astra la guía API usa `prompt_cache_options`, no
   la receta antigua `prompt_cache_retention: "24h"`; no hace falta forzarlos en
   este perfil. La política exacta de cuota con OAuth no se deduce de precios API.
5. **`warming` omitido**: ya está apagado. Activarlo introduce llamadas reales
   durante las pausas; no se justifica para este objetivo de consumo moderado.
6. **Compactación nativa como prueba posterior**, solo en Astra/Sol mediante
   `settings.compaction.type: "native"` por modelo. Puede conservar estado del
   proveedor en checkpoints opacos, pero no garantiza memoria perfecta; depende
   del endpoint y se reutiliza solo con proveedor/modelo/protocolo/endpoint
   compatibles. El perfil mantiene el resumen local conocido. La función
   `experimental_mode` de Codex no es una opción de OpenCode.
7. **Mantener las salidas acotadas** a 1.000 líneas/32 KiB, las lecturas por
   fragmentos y Engram bajo demanda. Ampliar la ventana no obliga a llenarla y
   volver a leer logs/archivos completos la desperdicia.

**Consumo:** en API pública, estos modelos superando 272k de entrada pasan a 2× la
tarifa de entrada/caché y 1,5× salida para toda la solicitud. En ChatGPT OAuth se
consume la cuota del plan; el catálogo local con coste cero no significa uso
gratuito ni ilimitado. Retener más historia incrementa tokens lógicos por turno,
aunque la caché reduzca trabajo/coste; compactar también consume tokens y puede
romper reutilización de caché. El usuario acepta el consumo de la configuración
aplicada a los cuatro modelos.

La resolución local de todos los valores aplicados fue comprobada. Falta medir
en tareas reales aceptación remota, compactaciones, uso de caché y cuota; no se
enviaron cientos de miles de tokens sintéticos para afirmar una garantía.

### Modelo gratuito para títulos: aplicado

En V2 `small_model` es compatibilidad V1 para **`agents.title.model`**. No elige
el modelo de compactación, que sigue siendo el de la sesión. La plantilla usa:

```json
{ "agents": { "title": { "model": "opencode/big-pickle" } } }
```

DeepSeek V4 Flash Free sigue listado en la documentación y en el endpoint Zen,
pero models.dev lo marca **`deprecated`** y no está entre los modelos disponibles
de esta instancia. Se eligió **Big Pickle**, gratuito y veterano: models.dev fecha
su lanzamiento el **17-10-2025**; el catálogo real lo muestra activo con entrada,
salida y caché a cero. Sustituye a MiMo por petición del usuario.

La prueba real mediante `opencode run --model opencode/big-pickle` en V2.0.8
recibe HTTP 403: `OpenCode's free tier can only be used from within OpenCode`.
Por tanto, su selección resuelve, pero **la inferencia gratuita no quedó validada**.
Es un rechazo del proveedor incluso desde el cliente nativo, no un error del
campo `agents.title.model`. Queda pendiente resolver el acceso de esta instalación
a Zen; no se añaden cabeceras ficticias ni un adaptador para eludirlo.

Los modelos gratuitos son ofertas temporales; revisar disponibilidad al actualizar.
V2 tiene fallback al modelo principal si el de títulos no se resuelve o falla:
esta selección no es una garantía absoluta de cero consumo del principal.

## 4. SSH y elección de agente

El instalador fija `127.0.0.1` y conserva el puerto. OpenCode gestiona su
autenticación interna sin una contraseña escrita en las plantillas. Con SSH al
mismo usuario y HOME/XDG se usa descubrimiento local, sin exponer la API a la LAN.
La TUI con `oc-last` o `oc --session ses_ID` cubre historial, actividad y permisos.
El servicio compartido ya se inicia separado de la terminal; `service start`
permite arrancarlo expresamente, pero no se añade a cada invocación ni se crea
otro daemon. Los detalles están en [la guía Arch](../arch/README.md).

**Evaluación: mantener `build` como agente predeterminado.** Crear `code` con
el mismo modelo, permisos e instrucciones duplicaría mantenimiento y no reduciría
contexto. `plan` ya cubre exploración/planificación y `/ponytail off` permite
quitar las reglas en una sesión. Un agente adicional tendría sentido solo con
un contrato realmente distinto de permisos/modelo/flujo. No se creó ninguno ni
se cambió el alcance del plugin: Ponytail sigue siendo por sesión, también fuera
de `build`.

## 5. Verificación de esta revisión

- El instalador conserva solo `oc` y `oc-last` en Bash/Zsh; al reinstalar limpia
  los aliases simples anteriores y el ejecutable del monitor retirado.
- Conserva el symlink del rc, respalda su contenido antes de añadir aliases y
  evita duplicarlos al reinstalar. No se fija un puerto para el servicio local.
- `arch/check-install.py` prueba instalación/reinstalación aisladas, rutas con
  espacios, ZDOTDIR, respaldo, symlinks, argumentos y códigos de salida, limpieza,
  loopback, prevalidación y recuperación del perfil ante fallo de intercambio.
  Usa dobles de los binarios, sin servicio real ni descargas.
- `arch/check.mjs` comprueba los hooks Engram, Ponytail, ejemplos de matching de
  las reglas y aislamiento de los ajustes de modelos. El matching simulado no
  sustituye una prueba del scanner/permisos de la TUI real.
- Uso y comprobaciones añadidos a las guías principal y de Arch.

Verificado: `python arch/check-install.py`, `node arch/check.mjs`, análisis
sintáctico Bash y `git diff --check`. ShellCheck no está instalado y no existe
una configuración de lint/typecheck adicional en el repositorio. No se aplicó
el instalador al HOME real ni se reinició el servicio de esta sesión.

## Fuentes

- [Permisos V2](https://opencode.ai/v2/docs/permissions): defaults, orden,
  directorios, shell, Code Mode y aprobaciones persistidas.
- [Preferencias CLI](https://opencode.ai/v2/docs/cli/config): `prompt`/`autoaccept`.
- [CLI V2](https://opencode.ai/v2/docs/cli) y `opencode --help` de 2.0.8:
  `--server`, `--continue`, `--session` y `--auto`.
- [Migración V1](https://opencode.ai/v2/docs/migrate-v1) y
  [agentes](https://opencode.ai/v2/docs/agents): normalización y overlays de request.
- [Engram MCP v2.0.0](https://github.com/Gentleman-Programming/engram/blob/v2.0.0/internal/mcp/mcp.go):
  schema `capture_prompt` y comprobación de `activity.CurrentPrompt` en `handleSave`.
- [Compactación V2](https://opencode.ai/v2/docs/compaction),
  [modelos V2](https://opencode.ai/v2/docs/models) y
  [servicio web](https://opencode.ai/v2/docs/cli/web).
- [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
  [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol),
  [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
  [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) y
  [catálogo público](https://models.dev/api.json): límites anunciados.
- [Guía de Astra](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra):
  retirada de `temperature`/`top_p` y conservación del razonamiento efectivo.
- [Modelos Codex](https://developers.openai.com/codex/models): disponibilidad según
  cuenta/cliente y gestión experimental de contexto del cliente Codex, no de OpenCode.
- [Catálogo Codex fechado](https://github.com/openai/codex/blob/968835997714baaff199cfed5f89a2c65d8ca77d/codex-rs/models-manager/models.json):
  presupuesto 272k y máximo ampliado 872k para los cuatro modelos.
- Fuente V2 **v2.0.8**: [overrides de configuración](https://github.com/anomalyco/opencode/blob/v2.0.8/packages/core/src/config/plugin/provider.ts#L97-L158),
  [ajuste OAuth](https://github.com/anomalyco/opencode/blob/v2.0.8/packages/core/src/plugin/provider/openai.ts#L268-L292),
  [arranque separado](https://github.com/anomalyco/opencode/blob/v2.0.8/packages/client/src/service-contender.ts),
  [selección de títulos](https://github.com/anomalyco/opencode/blob/v2.0.8/packages/core/src/session/context.ts#L95-L118)
  y [fallback de títulos](https://github.com/anomalyco/opencode/blob/v2.0.8/packages/core/src/session/title.ts#L127-L133).
- [Caché OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching),
  [WebSocket V2](https://opencode.ai/v2/docs/providers#websockets) y
  [warming](https://opencode.ai/v2/docs/warming): consumo y defaults.
- [Modelos y precios Zen](https://opencode.ai/v2/docs/console/models),
  [catálogo Zen](https://opencode.ai/zen/v1/models) y
  [models.dev](https://models.dev/api.json): gratuidad frente a disponibilidad.
