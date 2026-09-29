# Instalación y verificación real — 28 de septiembre de 2026

## Resultado

Instalación standalone completada en el equipo Arch de referencia. `gsh` y
`gsh-last` están disponibles en una nueva shell Zsh. La comprobación de carga
detectó **17 extensiones, 58 herramientas de extensión y ningún error o nombre
de herramienta duplicado**. El usuario completó OAuth y la prueba real con
**OpenAI Codex / GPT-6 Sol / high** respondió correctamente.

## Versiones observadas

| Componente | Versión instalada |
| --- | --- |
| Pi | 0.87.1 |
| Gentle Shell | 3.7.0 |
| Gentle AI privado | 3.7.0 |
| Engram core independiente | 2.2.1 |
| gentle-engram | 0.1.16 |
| pi-mcp-adapter | 2.38.0 |
| pi-web-access | 0.33.0 |
| pi-btw | 0.6.1 |

El adaptador MCP quedó en la rama 2.x admitida por el aprovisionamiento de Gentle
AI, aunque npm publicaba 3.1.0 como `latest`. Se verificó el resultado instalado,
no se sustituyó por el paquete más reciente por iniciativa propia.

## Conservación de OpenCode

Se guardó una referencia antes de instalar y se comparó después de la instalación
y de las pruebas de arranque/reanudación:

| Comprobación | Resultado |
| --- | --- |
| OpenCode instalado | 2.0.18 |
| PID del servicio | 6926 antes y después |
| Endpoint | `http://127.0.0.1:49374`, sin cambios |
| Archivos comparados | 43, hashes idénticos |
| Plugins reportados por su API | 91, estados idénticos y ninguno fallido |
| Plugin Engram | `active` |
| Plugin Ponytail | `active` |
| MCP Engram / Context7 | `connected` / `connected` |
| MCP CodeGraph | `disabled`, igual que antes |
| `oc` | `command opencode` |
| `oc-last` | `command opencode --continue` |
| Binario resuelto | `/usr/bin/opencode` |
| `.zshrc` | Conserva el contenido previo y añade solo el bloque Gentle |

La comparación incluye configuración global, plugins/skills locales, directorio
de compatibilidad cuando existe, registro del servicio, binario Engram anterior
y archivos de shell seleccionados. Excluye dependencias instaladas, builds y
datos dinámicos de sesiones. No se comparó la base de conversaciones de OpenCode:
esta sesión está utilizándola durante la verificación.

Al retomar la tarea, el proceso tenía PID **6100** y el directorio temporal de
esa primera fase ya no estaba disponible. Se tomó una nueva referencia antes de
la prueba final de TUI: **44 archivos** (incluyendo ahora `.zshrc` completo), los
91 estados de plugins, MCPs, aliases y datos del servicio. La comparación posterior
fue idéntica; el PID 6100 se conservó durante esa prueba. Esta segunda referencia
y sus resultados se guardan en el directorio de datos de Gentle.

Se comprobó que los procesos Engram de OpenCode continúan usando el binario
`opencode-dotfiles-v2/bin/engram-2.0.0` y su directorio habitual. El nuevo servidor
es otro ejecutable, escucha en **127.0.0.1:7438** y usa
`${XDG_DATA_HOME:-$HOME/.local/share}/engram-pi`. Su `/health` respondió `ok` y
versión `2.2.1`.

## Carga real de plugins

Se arrancó **el comando instalado `gsh --mode rpc`**, con el aprovisionamiento
automático oficial habilitado, en un repositorio temporal de diagnóstico.

El proceso registró 48 comandos de extensión. Se ejecutaron los comandos
oficiales de diagnóstico, sin enviar una tarea a un modelo:

- `/gentle:doctor`.
- `/gentle:status`.
- `/gentle:background-subagents status`.
- `/gentle:animations status`.
- `/gentle:review-mode status`.

Resultados:

- Activos de delegación y revisión sin archivos obsoletos reportados.
- Configuración de modelos válida y routing `daily` materializado (llamado
  `diario` durante la primera comprobación).
- Herramientas nativas Engram activas; gateway MCP conectado con 19 herramientas.
- Background `on`, capacidad de delegación `ready`.
- Animaciones `performance`.
- SDD bajo demanda, todavía no instalado; OpenSpec ausente en el proyecto de
  diagnóstico, como corresponde al flujo ODD elegido.
- Ningún evento `extension_error` durante los comandos.

Además se cargaron los mismos paquetes mediante `DefaultResourceLoader` del SDK
Pi instalado. Se inspeccionaron los errores de carga y los propietarios de los
nombres de herramientas: **17 extensiones / 58 herramientas / 0 errores /
0 duplicados**. Ningún plugin se cargó desde `~/.config/opencode`.

El setup oficial deja dos declaraciones de `gentle-engram`, una sin versión y
otra `@0.1.16`. En esta instalación resuelven a la misma ruta: el cargador registra
una sola extensión Engram. Por ello no se confundió duplicación de declaraciones
con duplicación efectiva de herramientas.

## Hallazgo corregido: recursos duplicados en TUI

La prueba de terminal mostró cuatro avisos adicionales que el informe inicial
de herramientas no cubría: un prompt y tres temas del mismo paquete. El lanzador
3.7.0 inyectaba `-e <paquete>` y además las carpetas `--skill`,
`--prompt-template` y `--theme`. Pi 0.87.1 también descubre esos recursos por el
manifiesto del paquete.

Se aprobó e instaló `pi_compat.py`: elimina solo esas carpetas redundantes cuando
el mismo paquete ya está cargado con `-e`, y ejecuta el Pi fijado. Conserva los
recursos ajenos y el aprovisionamiento automático oficial.

Después del cambio:

- `gsh` arrancó en una pseudoterminal de 160 × 45 celdas.
- `/gentle:doctor` se ejecutó en la TUI y reportó memoria Engram activa.
- La interfaz terminó con código 0, sin terminación forzada.
- No hubo avisos de colisión ni errores de carga detectados.
- El SDK confirmó **17 extensiones, 58 herramientas, 19 skills, un prompt y tres
  temas**, con cero diagnósticos de error o colisión en esos recursos.

## Hallazgo corregido: RDD

El runtime reportó inicialmente **`on (decided by default)`**, contrario a la
descripción opt-in de parte de la documentación. Se aplicó mediante su CLI
oficial la elección acordada:

```text
gentle-ai review mode disable --scope global --json
```

Se utilizó el binario privado de Gentle Shell. La siguiente sesión confirmó
**`off (decided by global)`**. El instalador ahora siembra esa elección cuando no
existe una decisión global previa y conserva un `on`/`off` explícito anterior.
Una prueba automatizada cubre la conservación de esa elección.

## Reanudación

Pi no persiste una sesión nueva hasta que contiene una respuesta de asistente.
La sesión inicial, que solo ejecutaba diagnósticos, no tenía todavía archivo que
`gsh-last` pudiera recuperar.

Para comprobar el contrato sin consumir cuota se creó, mediante el SDK oficial,
una **sesión sintética identificada como diagnóstico**, dentro del proyecto
temporal. `gsh-last --mode rpc` restauró exactamente su ID y archivo. El proceso
terminó ordenadamente al cerrar stdin.

Esto comprueba selección del perfil, rutas y reanudación de un historial
persistido. No representa una conversación real con Codex ni una prueba de que
un trabajo continúe ejecutándose después de cerrar Pi.

## Comprobaciones automatizadas

```sh
python3 -I gentle/test_install.py
python3 -I gentle/check.py --installed
git diff --no-ext-diff --no-textconv --check
```

Resultado: **14 tests satisfactorios**, validación de versiones/configuración
instalada y 26 asignaciones por perfil. En `deep`, los cuatro roles de
exploración acordados utilizan Sol `high`.

## Autenticación y prueba real de Codex

El usuario completó `/login` con OpenAI Codex. Se confirmó la presencia de una
credencial OAuth sin mostrar su contenido. El catálogo autenticado incluyó Sol,
Luna y Astra.

Se ejecutó una única solicitud de diagnóstico en un proyecto temporal, usando
Sol `high` y pidiendo responder exactamente `GSH_CODEX_OK` sin herramientas:

| Comprobación | Resultado |
| --- | --- |
| Proveedor/modelo efectivo | `openai-codex/gpt-6-sol` |
| Nivel de razonamiento | `high` |
| Respuesta | `GSH_CODEX_OK` |
| Motivo de finalización | `stop` |
| Errores de comando/extensión | 0 / 0 |
| Tokens de entrada/salida reportados | 17.918 / 9 |

Es una comprobación de conexión y ejecución, no un benchmark ni una medición del
coste real de la suscripción. La entrada incluye las instrucciones del harness.

Después del login, el modelo inicial había quedado en GPT-5.5 `high`. Con
confirmación del usuario se restableció Sol `high`. Un arranque RPC posterior
**sin argumentos de modelo** confirmó Sol `high` y cero errores de extensiones.

Los perfiles se renombraron conservando sus asignaciones:

- `diario` → `daily` (activo).
- `rendimiento` → `performance`.
- `profundo` → `deep`.

El instalador migra también esos nombres en despliegues anteriores y conserva
personalizaciones. Los tests comprueban esa migración y el rechazo de perfiles
distintos que ya ocupen el nombre de destino.

Quedan pendientes pruebas de delegación con modelos y los flujos SDD/RDD cuando
se activen expresamente. No se hicieron llamadas a Luna o Astra para esta prueba.

## Evidencias locales

La primera fase utilizó este directorio temporal, ya no disponible al retomar:

```text
/tmp/opencode/gentle-install-TZSPOy6F
```

Los resultados finales se conservan ahora en:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/gentle/verification/2026-09-28-final
```

Incluyen `opencode-before.json`, `opencode-after.json`, `tui.txt`,
`tui-summary.json`, `resources.json`, `runtime.json`, `codex.json` y
`daily-startup.json`. Contienen la comparación
actual de OpenCode, el diagnóstico de terminal, los recursos cargados y los
estados de Engram/RDD/autenticación, sin exponer credenciales.

Respaldos del despliegue inicial y de la incorporación del adaptador:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/gentle/backups/install-xxkz2a0b
${XDG_DATA_HOME:-$HOME/.local/share}/gentle/backups/install-l74yjke2
${XDG_DATA_HOME:-$HOME/.local/share}/gentle/backups/install-znmg3w3j
```

La selección efectiva de versiones, rutas y modo de revisión queda registrada en
`gentle/installed.json` dentro del directorio de datos del usuario.
