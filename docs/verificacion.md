# Verificación del perfil Arch

Fecha: **20-09-2026**. OpenCode `2.0.8`, paquete Arch `2.0.8-1`; Engram `2.0.0`;
Ponytail local 4.10.0 adaptado. Pruebas en Linux x86_64 con HOME, XDG_CONFIG_HOME,
XDG_DATA_HOME, XDG_STATE_HOME, XDG_CACHE_HOME y ENGRAM_DATA_DIR temporales.
No se aplicó el perfil global real.

## Perfil verificado inicialmente

Engram, Ponytail y la statusline son adaptaciones locales sin dependencias npm.
Playwright CLI es una herramienta separada, instalada desde un lock npm exacto.
Herdr sigue fuera del repositorio: se instala con su mecanismo oficial cuando su
versión soporte OpenCode V2. `arch/check.mjs` prueba la política Engram y los modos
Ponytail; `arch/verify.sh` comprueba los paquetes, `cli.json`, los MCPs y, con
`--live`, el estado real del servicio.

Tras restaurar Ponytail y la statusline (commit `8fce8a1` los había retirado), se
repite la batería completa en el entorno aislado:

| Comprobación | Resultado |
| --- | --- |
| Bash `bash -n arch/*.sh` (por archivo) | Correcto |
| JavaScript `node --check` de Engram y Ponytail | Correcto |
| `node arch/check.mjs` | Ponytail: `lite` inicial, `/ponytail`→`full`, aislamiento por sesión, rechazo de nivel inválido, apagado, precedencia del entorno e invalidación con valor desconocido. Engram: sustitución del protocolo, presupuesto 8 KiB |
| Descarga de Engram | Archivo amd64 con SHA-256 oficial verificado |
| Instalación `--no-start` | Correcta: plugins, cuatro skills, lock de procedencia, wrapper Playwright, `cli.json` y `service.json` conservado |
| Export de entorno | `export PONYTAIL_DEFAULT_MODE=lite` añadido a `$HOME/.zshenv` del entorno aislado; reinstalar detecta la línea existente |
| Instalación completa | Servicio aislado reiniciado y `verify.sh --live` correcto |
| Entorno del servicio | `/proc/<pid>/environ` del servicio incluye `PONYTAIL_DEFAULT_MODE=lite` |
| API `/api/plugin` | `engram` y `ponytail`: `active`, origen local |
| API `/api/mcp` | `context7=connected`, `engram=connected`, `codegraph=disabled` |
| TUI real en pseudo-terminal | `subagent-statusline.v2` importado desde `plugins/subagent-statusline.v2` registrado en `cli.json`: `setup` y cleanup correctos, sin npm ni errores |
| Prueba con plugin marcador | Un plugin TUI mínimo en `cli.json` registró su `setup` en archivo; el mecanismo de plugins de cliente funciona y la statusline usa la misma ruta, sin anidar `chunks/` |
| MCP Engram stdio | Handshake, 19 herramientas, registro de sesión, save, search, contexto compacto y cierre correctos en base de pruebas |
| Respaldos | SQLite Backup API íntegra tras varias instalaciones; JSON del perfil respaldado válido |
| Credenciales en plantillas | Ninguna; la ruta del binario Engram se genera al instalar |

El nivel inicial `lite` efectivo está garantizado por partida doble: el plugin usa
`lite` como último recurso y el instalador exporta la variable en el entorno de la
shell y en el proceso que reinicia el servicio. La precedencia del plugin es
`PONYTAIL_DEFAULT_MODE` → opción `defaultMode` → `lite`.

## Problemas encontrados durante las pruebas

1. **Rutas de plugin a archivos:** el runtime las rechazó con
   `configured plugin path must be a directory`. Resuelto mediante directorios de
   paquete con `package.json` y exports explícitos; la API confirmó ambos plugins
   de servidor activos.
2. **Puerto del servicio aislado:** dos perfiles XDG del mismo usuario intentaron
   usar el mismo puerto por defecto. Se asignó un puerto libre solo al entorno de
   prueba mediante `opencode service set port 4197`; después pasó la instalación
   completa. El perfil distribuido no impone un puerto y preserva `service.json`.
3. **Protocolo Engram duplicado:** el MCP añade instrucciones de guardado
   obligatorio en `initialize`. El hook V2 sustituye solo esa sección sin borrar
   instrucciones de otros servidores.
4. **`defaultMode: off` preexistente:** la máquina tenía
   `~/.config/ponytail/config.json` con `off` para el plugin upstream. No afecta al
   plugin local, pero la variable exportada es la única forma de anularlo también
   en los agentes que usan la resolución upstream.

## Qué no demuestra esta verificación

- No se hizo un benchmark de tokens ni una evaluación estadística de obediencia al
  gate semántico. El modelo decide qué conocimiento es crítico.
- No se envió una tarea a un proveedor LLM real ni se consumieron tokens facturados.
  Una prueba con proveedor simulado no resolvió su modelo temporal; no se considera
  evidencia end-to-end con un modelo.
- No se autenticó CodeGraph ni se consultó un proyecto remoto: queda desactivado.
- Herdr no forma parte de este perfil; su integración oficial V2 no se ejecutó aquí.
  En la máquina real, Herdr 0.9.1 con su integración v12 quedó instalado y su
  plugin de servidor carga en OpenCode 2.0.8.
- Un plugin TUI mínimo en `cli.json` registró su `setup` en archivo; la statusline
  se importó desde su nueva ruta. No se lanzó un subagente real para ver dibujadas
  las filas; solo se comprobó la importación y el mecanismo de carga.
- ARM64 y Windows no se ejecutaron.
- ShellCheck no estaba instalado. Se ejecutó análisis sintáctico Bash y pruebas
  funcionales; su comando opcional está documentado en la guía de Arch.

## Repetir las pruebas básicas

```sh
node arch/check.mjs
python arch/check-install.py
bash arch/check-documents.sh
bash arch/verify.sh
bash arch/verify.sh --live
```

Para un entorno aislado, exporta **todas** las rutas anteriores a un directorio de
prueba, despliega con `--no-start` y configura un puerto libre con el comando nativo
antes de arrancar el servicio. No basta cambiar solo `XDG_CONFIG_HOME`: compartirías
sesiones, credenciales y memoria con el entorno habitual. El instalador también
escribe el export en el `$HOME` del entorno de prueba, no en el real.

Al acabar, detén únicamente el servicio del entorno de prueba con las mismas
variables: `opencode service stop`. No uses `pkill opencode` ni borres bases de datos.

## Revisión posterior: permisos, contexto y SSH

En esta revisión se ejecutaron solo comprobaciones offline y consultas de
documentación/catálogo, sin tareas a modelos, migración ni reinicio del servicio real:

- `arch/check.mjs`: sustitución del protocolo, búsqueda <=5, contexto <=8 KiB,
  `capture_prompt=false` incluso si se solicita `true`, modos Ponytail y ejemplos
  de matching de permisos. Comprueba campos de límites de Astra/Sol/Luna/Terra
  y el modelo gratuito de títulos sin fijar los antiguos presupuestos de entrada.
- `arch/check-install.py`: instalación/reinstalación en Bash/Zsh con rutas con
  espacios y symlinks; puerto conservado y hostname loopback; Ponytail previo
  `off` normalizado a `lite`; argumentos y códigos de salida de `oc`/`oc-last`;
  retirada de aliases simples y binario del monitor anterior.
- Una plantilla inválida falla antes de tocar perfil/rc o crear respaldo; un
  segundo rename fallido restaura byte a byte el perfil anterior en la prueba.
- Si la carpeta de configuración es un symlink relativo, el respaldo contiene
  los archivos y el destino original se conserva.
- `opencode service set hostname 127.0.0.1` en HOME/XDG temporal, sin arrancar
  servidor, confirmó el formato `{"hostname":"127.0.0.1"}` del archivo de servicio.
- Consulta de solo lectura a `/api/model`: el acceso Codex efectivo presenta
  400k/272k/128k para los cuatro modelos. Se contrastó con la API pública.
- Sintaxis Bash y `git diff --check`: correctos.

Los permisos en TUI y el ahorro medido quedan para la migración posterior.
La simulación de matching no reproduce el scanner de comandos de OpenCode.

## Revisión: servicio, contexto ampliado y títulos

- Servicio real: `opencode service status` y `/api/info` confirman V2.0.8 activo;
  `ps` muestra `serve --service` sin TTY y con SID propio. La fuente v2.0.8 usa
  `detached: true` y `unref()`. No se reinició el servicio ni se simuló desconexión
  SSH durante una inferencia.
- Catálogo en Locations temporales bajo `/tmp/opencode`, sin inferencias para
  probar capacidad: el ajuste de solo `context` conserva `input: 272000`. Con la
  configuración final, Astra resuelve 400k/272k/128k (umbral 252k) y Sol/Terra/Luna
  500k/370k/128k (umbral 350k), incluidas Terra/Luna Fast. Una comparación de los
  objetos completos confirma que únicamente cambia `limit`; se conservan variantes,
  transporte, rutas y demás metadatos.
- Los catálogos de una Location recién abierta pueden estar incompletos hasta
  terminar la carga de plugins; la comprobación se hizo con los proveedores listos.
- `opencode/big-pickle`: activo, habilitado y precios cero en catálogo real;
  models.dev fecha su lanzamiento el 17-10-2025.
  DeepSeek V4 Flash Free: `deprecated` en models.dev, ausente de la lista disponible,
  aunque documentación y endpoint Zen todavía lo enumeran.
- Límites, retención de 30k y Big Pickle aplicados a la plantilla; despliegue al
  perfil global pendiente. El buffer permanece en 20k y `auto` activado.
- `node arch/check.mjs` y `TMPDIR=/tmp/opencode python -I arch/check-install.py`:
  correctos, incluyendo cálculo de umbrales, espacio para entrada/salida,
  reinstalación y limpieza de aliases/binario anteriores. `git diff --check`: correcto.
- Prueba de inferencia gratuita: petición genérica de un título, primero directa
  y luego mediante `opencode run --model opencode/big-pickle` con un agente temporal
  de un paso y herramientas denegadas. Zen respondió HTTP 403 en ambos casos:
  `OpenCode's free tier can only be used from within OpenCode`. La ejecución nativa
  también falló, así que no se considera validada la generación de títulos.

Esto valida resolución local de configuración, no la aceptación del proveedor
de una solicitud de 370k tokens. El acceso gratuito a Zen queda pendiente de
resolver en esta instalación; el fallback de títulos al principal se comprobó en
el código v2.0.8. La configuración aplicada y las fuentes
están en [contraste-dotfiles.md](contraste-dotfiles.md#3-modelos-y-compactación).

## Revisión: skills, documentos y Playwright CLI

Esta revisión tampoco tocó el perfil global real. Se verificó lo siguiente:

- `frontend-design` se obtuvo del commit fijado de Anthropic con su licencia
  Apache-2.0. `playwright-cli` y sus diez referencias proceden del commit fijado
  de Microsoft; la adaptación local elimina instalación global/`@latest` y añade
  límites para perfiles, secretos, orígenes y `run-code`.
- `skills-lock.json` coincide con las cuatro carpetas. `skill-governance` tiene
  `opencode/autoinvoke: false`; el permiso global deniega IDs desconocidos y
  vuelve a permitir las skills integradas y administradas.
- `npm ci --omit=dev --ignore-scripts` resolvió exactamente tres paquetes:
  `@playwright/cli@0.1.21`, `playwright@1.64.0-alpha-1789764292000` y
  `playwright-core` en la misma revisión. Las integridades del lock coincidieron.
- En HOME/XDG temporal, el instalador tomó la rama npm real, creó el wrapper fuera
  del prefijo global y pasó la prevalidación. El wrapper abrió Chromium del sistema
  sobre una página `data:` local, `find` localizó el botón esperado y `close`
  terminó la sesión. No se descargó un navegador Playwright.
- OpenCode V2 observó la fuente absoluta generada bajo el XDG temporal y
  `/api/skill` registró `document-files`, `frontend-design`, `playwright-cli` y
  `skill-governance`. La carga de plugins/skills es asíncrona al arrancar el
  servicio; por ello `verify.sh --live` espera también el catálogo de skills.
- La verificación `--live` completa pasó en ese HOME/XDG aislado: OpenCode 2.0.8,
  Engram/Ponytail activos, Context7/Engram conectados, CodeGraph desactivado y
  las cuatro skills registradas. El servicio temporal se detuvo al terminar.
- En una sesión temporal con coste y tokens en cero se activó `document-files`
  mediante el endpoint nativo con `resume: false`; el historial registró un
  mensaje `type: skill` con su cuerpo correcto, sin ejecutar un modelo. La sesión
  y el servicio temporal se eliminaron/detuvieron después.
- El smoke documental creó DOCX desde Markdown con Pandoc, validó su ZIP con
  `python -I -m zipfile`, lo leyó de vuelta, convirtió a PDF con un perfil aislado
  de LibreOffice, pasó `qpdf --check`/`pdfinfo`, extrajo texto con Poppler y revisó
  visualmente la primera página renderizada sin cortes ni glifos ausentes.
- `node arch/check.mjs`, `TMPDIR=/tmp/opencode python -I arch/check-install.py`,
  `bash arch/check-documents.sh`, `bash -n arch/*.sh` y `git diff --check`
  pasan con el catálogo nuevo. Los hashes SHA-256 del contenido de cada skill
  también se verifican contra `skills-lock.json`.

No se evaluó la calidad de `frontend-design` con un modelo, no se procesaron
documentos hostiles ni formularios/revisiones avanzadas y no se probó Windows.
`uv` no está instalado ni es necesario: ninguna skill actual importa paquetes
PyPI. La política PEP 723 + lock por script queda como gate para una necesidad
futura, no como infraestructura anticipada.
