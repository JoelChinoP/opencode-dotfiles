# opencode-dotfiles-v2

Perfil de **OpenCode V2 para Arch Linux**, con Engram, Ponytail oficial y
statusline local. Versiones de referencia: OpenCode **2.2.0**, Engram **3.6.1**
y Ponytail **5.3.3**.

| Integración | Estado |
| --- | --- |
| Context7 MCP remoto | Activado; documentación solo cuando hace falta |
| Engram MCP local | Activado; memoria crítica y contexto limitado |
| CodeGraph MCP local | `codegraph serve --mcp`, desactivado por defecto |
| Engram local V2 | Política crítica y guía de compactación |
| Ponytail oficial V2 | Paquete npm 5.3.3 fijado; `lite` automático y nivel persistente entre conversaciones |
| subagent-statusline.v2 local | Estado y navegación de subagentes en la TUI |
| Editores locales | `/open-zed` y `/open-vscode` abren carpetas desde la TUI sin llamar al modelo |
| Herdr | Integración oficial automática si ya está instalado, estable >= 0.9.1 |
| Documentos, presentaciones y diagramas | `document-files`, `presentation-slides` y `diagram-design`; [arquitectura para presentar o editar](docs/calidad-visual.md) |
| Desarrollo web | `frontend-design` para diseño visual; `modern-web-guidance` para HTML, CSS, APIs del navegador, accesibilidad y compatibilidad. Guías locales, sin telemetría |
| Navegador | Skill y `@playwright/cli@0.1.21` fijados; Chromium del sistema |
| Gobernanza de skills | Catálogo permitido y mantenimiento manual no autoinvocable |

Ponytail queda activado en `lite` durante la instalación, sin iniciar un chat ni
enviar un mensaje para configurarlo. El plugin oficial sustituye el antiguo
adaptador y su panel TUI. Registra seis comandos y skills propios.

Uso recomendado: `lite` como base diaria, incluidas revisiones normales;
`/ponytail full` para implementación o refactorización con énfasis en soluciones
mínimas, y `/ponytail lite` para volver. No hay cambios automáticos de nivel.
El nivel elegido se comparte entre conversaciones mediante
`~/.config/opencode/.ponytail-active`. `/ponytail` sin argumentos conserva el
nivel si ya está activo. El default global se fija también en
`~/.config/ponytail/config.json` como `"defaultMode": "lite"`.

- `/ponytail-review [commit, rama o archivos]`: revisión puntual de cambios;
  sin argumentos revisa los cambios sin confirmar.
- `/ponytail-audit [directorio o módulo]`: auditoría del alcance indicado;
  sin argumentos analiza el repositorio actual.

Se añaden `/ponytail-debt`, `/ponytail-gain` y `/ponytail-help`. `/review` nativo
sigue disponible. `templates/commands/` conserva las variantes locales en español
de review/audit como overrides opcionales; el instalador usa los comandos oficiales.

## Instalar

Lee [arch/README.md](arch/README.md) antes de ejecutar:

```sh
bash arch/install.sh
```

El instalador **reemplaza el perfil global**, con respaldo completo del anterior
y de la base Engram. No es un merge: modelos/proveedores personalizados, reglas,
skills y plugins previos quedan en el respaldo. Las credenciales y sesiones que
OpenCode guarda en su directorio de datos se conservan. `service.json` conserva sus
ajustes, fijando la escucha en `127.0.0.1`. El perfil se valida antes de reemplazar
el anterior. No ejecuta `sudo` ni instala paquetes con pacman por ti.

Para desplegar sin reiniciar el servicio: `bash arch/install.sh --no-start`.
La [verificación](docs/verificacion.md) distingue las pruebas aisladas de la
sincronización con la instalación del equipo.

Tras instalar, abre una terminal Bash/Zsh nueva: `oc` abre OpenCode y
`oc-last` retoma la última sesión; `oc --session ses_ID` abre una concreta.
Por SSH, con el mismo usuario y HOME/XDG, se usan los mismos comandos en el
directorio del proyecto. V2 ya descubre/inicia un servicio separado de la terminal.

## Abrir la carpeta en un editor

Ambos comandos piden una ventana nueva (`-n`) para conservar el proyecto que
ya tengas abierto. Sin argumentos se abre la carpeta de la sesión activa. Para elegir una subcarpeta,
escribe `@` y parte de su nombre. Con el selector abierto, `Enter` elige la carpeta;
otro `Enter` ejecuta el comando. También puedes escribir la ruta relativa sin `@`
(entre comillas si tiene espacios). Si el nombre empieza literalmente por `@`,
puedes usar `./@equipo`.

```text
/open-zed
/open-zed @templates/plugins
/open-vscode "mi carpeta"
/open-vscode @templates --profile "desarrollo web"
```

`--profile` también funciona sin carpeta. Busca entre los perfiles con nombre
guardados por VS Code sin distinguir mayúsculas: `desarrollo web` encuentra
`Desarrollo Web`. Si el nombre no existe, o coincide con varios y no es exacto,
el comando avisa sin abrir el editor ni crear un perfil. Sin `--profile`, VS Code
usa su asociación habitual. El plugin requiere `zed` o `code` en el `PATH` de la
TUI y acceso local a la carpeta. La búsqueda de perfiles usa el catálogo local de
VS Code estable para Linux (`Code/User/globalStorage/storage.json`).

## Permisos y contexto

- Confirmaciones TUI en `prompt`; shell pide autorización salvo inspecciones Git
  acotadas. Los comandos de test/build se autorizan por proyecto mediante
  `permissions` o «Allow always». Cambiar el modo desde `Ctrl+P` afecta a la TUI
  global; no hay un `autoaccept` de TUI por proyecto.
- Preferencias TUI: tema oscuro, razonamiento oculto, contadores de tokens,
  `prompt.editor: false` y navegación de páginas con `<leader>k` / `<leader>j`.
- Solo se anuncian las skills integradas permitidas, las administradas y las seis de Ponytail;
  otras copias globales o de compatibilidad quedan ocultas hasta autorizarlas.
- Se prioriza código fuente; leer dependencias y artefactos requiere confirmación.
  La búsqueda se acota por instrucciones, no mediante `watcher.ignore`.
- Engram: sin captura de prompts, búsquedas de hasta 5 recuerdos y contexto de 8 KiB.
- Títulos: `agents.title.model` usa `opencode/big-pickle`, gratuito y disponible
  desde octubre de 2025. El catálogo lo admite, pero la prueba real con V2.0.8
  recibe HTTP 403 de Zen; véase [verificación](docs/verificacion.md).
- GPT-6.1 Sol compacta aproximadamente a 550k, GPT-6 Astra a 400k,
  GPT-6.1 Terra a 450k y GPT-6 Luna a 350k, incluidas sus variantes Fast.
  El buffer es de 20k y se conservan 30k recientes. Terra/Luna de GPT-5.6
  están deshabilitados también en el selector. Detalles y fuentes en el
  [análisis de contexto y consumo](docs/contraste-dotfiles.md#3-modelos-y-compactación).

## Subagentes

Las reglas globales indican primer plano (`background: false`) y esperar el
resultado; segundo plano solo por solicitud explícita del usuario.

El panel usa etiquetas en inglés y muestra tarea, agente/modelo, estado y tiempo
de sesión. Prioriza los subagentes que esperan permiso/respuesta y los que siguen
trabajando; distingue terminados, interrumpidos y errores. Muestra hasta cinco
filas y se oculta cuando la sesión no tiene subagentes. El tiempo va desde la
creación hasta el último reposo, o hasta ahora si sigue activo; no es tiempo
facturado del modelo.

- `[Open]` o clic en el título: entra en la sesión hija.
- `/subagents` o `↓` desde el prompt vacío: abre el selector nativo.
- Dentro del selector: `Ctrl+A` alterna activos/inactivos, `Enter` abre el
  seleccionado y `Ctrl+D` lo interrumpe. `Ctrl+D` fuera del selector tiene otra
  función. En la navegación de la sesión hija, `↑` vuelve al padre.

Panel y controles nativos comprobados en OpenCode **2.0.32**, incluida una
interrupción real de un subagente de prueba. `node arch/check.mjs` cubre estados,
prioridad y duración.

## Archivos

- `AGENTS.md`: reglas del proyecto y criterio de simplicidad para este repositorio.
- `templates/`: configuración portable, reglas, plugins locales y seis skills
  administradas. `skills-lock.json` fija procedencia, runtime y licencia;
  `tools/playwright-cli/` y `tools/presentations/` contienen los locks npm exactos.
- `arch/install.sh`: requisitos, Engram oficial verificado, respaldo, despliegue
  y export de `PONYTAIL_DEFAULT_MODE=lite`, más atajos en Bash/Zsh.
- `arch/verify.sh`: comprobaciones locales; `--live` comprueba el servicio y MCPs.
- `arch/check.mjs`: pruebas de los plugins, sin modelos ni red externa.
- `arch/check-ponytail.mjs /ruta/paquete`: prueba el paquete oficial descargado en
  un XDG temporal, incluido `lite` automático sin conversación y persistencia global.
- `arch/check-install.py`: instalación y atajos en HOME/XDG aislados, con binarios simulados.
- `arch/check-documents.sh`: smoke DOCX/PDF con las herramientas nativas.
- `arch/check-visuals.py`: DOCX editorial, PPTX editable, diagramas y regresiones de
  validación; `--output DIR-NUEVO` conserva archivos para inspección visual.
- [docs/calidad-visual.md](docs/calidad-visual.md): uso de las skills y protocolo de
  comparación con Claude Code usando el mismo modelo y encargo.
- [docs/contraste-dotfiles.md](docs/contraste-dotfiles.md): comparación con el repositorio
  anterior, propuesta de permisos y pendientes priorizados.
- [docs/hallazgos.md](docs/hallazgos.md): correcciones al informe y decisiones.
- [docs/fuentes.md](docs/fuentes.md): documentación primaria, versiones y licencias.
- [docs/verificacion.md](docs/verificacion.md): evidencia y límites de lo probado.
- `docs/oc-search-config.md`: informe original, conservado como contexto histórico.

Windows queda pendiente: su guía inicial aún no despliega el perfil completo de
plugins. La instalación soportada en esta revisión es la de Arch.
