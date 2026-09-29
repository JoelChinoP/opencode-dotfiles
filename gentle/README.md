# Gentle en Arch Linux

Implementación standalone de **Pi + Gentle Shell + Gentle AI**, con Codex por
suscripción, Engram local y los comandos **`gsh` / `gsh-last`**.

Esta carpeta contiene el despliegue y sus comprobaciones. Preparar el repositorio
y ejecutar sus tests no instala el stack en tu usuario. **La instalación real es
el paso 4** y se ejecuta expresamente.

## 0. Decisiones acordadas

| Área | Elección |
| --- | --- |
| Plataforma inicial | Arch Linux, Ryzen 7 7730U, aproximadamente 16 GB de RAM |
| Instalación | Gentle Shell standalone con runtime npm privado |
| Autenticación | OpenAI Codex por OAuth, con la suscripción ChatGPT |
| Perfil inicial | `daily` |
| Otros perfiles | `performance` y `deep` |
| Trabajo habitual | ODD |
| Especificaciones formales | SDD/OpenSpec, activación explícita |
| Revisión nativa | RDD optativo, activación explícita |
| Paralelismo | Hasta 4 hijos por orquestador; background habilitado |
| Escrituras | Un escritor sobre los mismos archivos |
| Memoria | Engram oficial con base nueva e independiente |
| Commits, push, PR y merge | Solo ante petición explícita |
| Interfaz | Fullscreen y animaciones `performance` |
| Complementos iniciales | Stack oficial; sin portar las skills anteriores |
| Aprovisionamiento | Automático oficial al arrancar cuando el lanzador lo considere necesario |
| Compatibilidad Pi/Gentle | Adaptador local para evitar argumentos de recursos duplicados |

Distribución principal de modelos:

| Perfil | Coordinar | Explorar | Implementar | Diseño/verificación/revisión |
| --- | --- | --- | --- | --- |
| `daily` | Sol `high` | Luna `medium` | Sol `high` | Sol `xhigh` |
| `performance` | Astra `high` | Luna `high` | Sol **`xhigh`** | Astra `xhigh` |
| `deep` | Astra `xhigh` | Sol `high` | Astra `high` | Astra `max` |

`performance` busca mayor capacidad de coordinación y evaluación; no promete ser
más rápido ni consumir menos que `daily`. El modo visual `performance` es un
ajuste independiente. Consulta [modelos y razonamiento](docs/modelos.md) para las
26 asignaciones de cada perfil, sus límites y cómo compararlos con trabajo real.

## 1. Entender las rutas

Con HOME y XDG convencionales, el instalador utiliza:

```text
~/.local/bin/
├── gsh                              # abre Gentle Shell en su perfil
└── gsh-last                         # el mismo entorno + --continue

~/.gentle-shell/
├── agent/
│   ├── settings.json                # preferencias y paquetes Pi
│   ├── auth.json                    # creado posteriormente por /login
│   ├── AGENTS.md                    # preferencias personales
│   ├── subagents.json               # límite y routing de hijos
│   ├── mcp.json                     # si lo genera el complemento instalado
│   ├── npm/                        # complementos del setup oficial
│   └── sessions/                   # sesiones de este perfil
└── gentle-ai/
    ├── profiles.json                # catálogo daily/performance/deep
    ├── models.json                  # routing activo de roles
    ├── animations.json              # performance
    └── background-subagents.json    # on

~/.local/share/
├── gentle/
│   ├── runtimes/pi-0.87.1-gentle-3.7.0/
│   │   ├── bin/pi
│   │   ├── bin/gentle-shell
│   │   └── lib/node_modules/gentle-pi/.gentle-ai/v3.7.0/gentle-ai
│   ├── bin/engram                   # Engram 2.2.1
│   ├── bin/pi                       # adaptador del lanzador Gentle
│   ├── pi_compat.py                 # filtro de rutas de recursos repetidas
│   ├── env.sh                       # entorno común de los dos lanzadores
│   ├── installed.json               # versiones observadas y último respaldo
│   ├── setup/                       # cwd del aprovisionamiento
│   └── backups/install-*/
└── engram-pi/                       # nueva base Engram
```

`XDG_DATA_HOME` cambia los dos directorios bajo `.local/share`. Las rutas se fijan
al instalar; abrir otra shell o reanudar no cambia de perfil accidentalmente.
El instalador respeta `ZDOTDIR` para encontrar `.zshrc`.

Los lanzadores fijan `PI_CODING_AGENT_DIR`, `GENTLE_PI_AGENT_HOME`,
`GENTLE_SHELL_HOME` y `GENTLE_PI_CONFIG_HOME`. Este último permite que **nuestros
perfiles de modelos y preferencias Gentle** vivan en `.gentle-shell/gentle-ai`
en lugar del valor oficial predeterminado `.pi/gentle-ai`.

Esto selecciona un perfil; no aísla todo el HOME. Gentle AI conserva estado
compartido en `~/.gentle-ai`, y su setup puede consultar rutas `~/.pi`. Las
instrucciones `AGENTS.md` de proyectos y ancestros también siguen aplicándose.

## 2. Comprobar requisitos

Se requieren Python **3.11+**, Node **22.19.0+**, npm, Git, curl, ripgrep y una
shell Bash/Zsh. En Arch, si faltan dependencias, el paso de sistema es:

```sh
sudo pacman -Syu --needed python nodejs npm git curl ripgrep
```

Comprobar versiones:

```sh
python3 --version
node --version
npm --version
```

El instalador se ejecuta como usuario, **sin sudo**. Usa la biblioteca estándar
de Python y un prefijo npm privado, sin configurar un prefijo global para npm.

Las versiones de referencia están en [`versions.json`](versions.json):

- Pi `0.87.1`.
- Gentle Shell / paquete `gentle-pi` `3.7.0`.
- Gentle AI privado `3.7.0`, instalado por Gentle Shell.
- Engram `2.2.1`, archivo oficial Linux con SHA-256 fijado para amd64/arm64.

Gentle Shell exige Pi >= 0.85.1. El lanzador y los hijos apuntan explícitamente al
Pi de este runtime, por lo que no eligen otra versión instalada en el PATH.

El lanzador pasa por `bin/pi`, que ejecuta el mismo Pi fijado. En la pareja
Gentle Shell 3.7.0 / Pi 0.87.1, el manifiesto del paquete ya aporta skills,
prompts y temas. El adaptador elimina sus tres argumentos redundantes únicamente
cuando ese mismo paquete se está cargando con `-e`; conserva otros recursos,
subcomandos y argumentos tras `--`. Esto elimina los avisos de un prompt y tres
temas duplicados observados en la TUI. Los hijos siguen usando el Pi fijado.

## 3. Validar y consultar el plan

Desde la raíz de este repositorio:

```sh
python3 -I gentle/check.py
python3 -I gentle/test_install.py
python3 -I gentle/install.py --plan
```

- `check.py`: valida plantillas, versiones y coherencia de los perfiles.
- `test_install.py`: prueba instalación, fallos y lanzadores en HOME/XDG temporales
  bajo `/tmp/opencode`, con dobles locales. Necesita Bash y Zsh.
- `--plan`: imprime rutas y orden; no descarga, escribe ni ejecuta el setup.

Si el directorio temporal no existe en otro equipo, créalo antes de los tests:

```sh
mkdir -p /tmp/opencode
```

Revisa especialmente `agent`, `config`, `memory`, `bin` y `rc` en el plan.
Si ya existe un comando `gsh` ajeno a este instalador o un alias homónimo en el
archivo de shell seleccionado, se informa del conflicto para resolverlo antes.

## 4. Instalar expresamente

Cierra las sesiones Gentle antes de desplegar o reinstalar. Ejecuta un solo
instalador a la vez.

```sh
python3 -I gentle/install.py
```

### Orden exacto de la implementación

1. **Validar entradas.** Comprueba plantillas, JSON previos, rutas absolutas,
   plataforma, comandos y Node. Un JSON roto no se sustituye silenciosamente.
2. **Respaldar.** Guarda configuración del agente, preferencias Gentle, archivos
   compartidos relevantes, comandos anteriores y archivo de shell. Si ya existe
   la nueva base Engram, usa SQLite Backup API para incluir datos pendientes en WAL.
3. **Preparar Engram.** Descarga el archivo fijado, comprueba su SHA-256, extrae
   exclusivamente el ejecutable y valida su versión.
4. **Preparar Pi/Gentle.** Instala las versiones fijadas con npm en el runtime
   privado. Sus scripts de instalación preparan el Gentle AI privado firmado.
   Despliega el adaptador local que evita recursos duplicados del lanzador.
5. **Ejecutar setup oficial.** Llama a `gentle-shell --isolated setup` desde un
   directorio de aprovisionamiento, con el perfil y Engram seleccionados.
6. **Sembrar preferencias.** Añade ajustes que faltan, los tres perfiles, routing
   inicial, concurrencia, política background, animaciones y reglas personales.
   Configura RDD en `off` si no existe una decisión global previa, usando el CLI
   oficial; conserva un `on` u `off` elegido previamente.
7. **Verificar archivos.** Comprueba versiones, ejecutables, paquetes declarados
   e instalados y ausencia de declaraciones retiradas o duplicadas.
8. **Publicar comandos.** Escribe `gsh`, `gsh-last` y su entorno común. Añade a
   `.bashrc` o `.zshrc` un bloque idempotente para `~/.local/bin`.
9. **Registrar resultado.** Guarda versiones efectivas de complementos y ruta del
   respaldo en `installed.json`. Imprime los pasos de autenticación.

Los complementos administrados por el setup oficial son:

- `gentle-engram`.
- `pi-mcp-adapter`.
- `pi-web-access`.
- `pi-btw`.

El lanzador carga su propia copia de `gentle-pi`. El setup retira su declaración
redundante y la antigua integración `rpiv-ask-user-question` cuando corresponde.
No añadas otra copia de Gentle al mismo perfil.

**Límite de reproducibilidad:** los cuatro runtimes principales están fijados,
pero el setup oficial obtiene algunos complementos con selectores móviles y npm
resuelve dependencias transitivas. `installed.json` registra qué se instaló; no
equivale a un lockfile de todo el ecosistema.

**Límite de recuperación:** el setup de terceros no es una transacción de todo
el perfil. Un fallo puede dejar sus archivos parcialmente escritos. El instalador
no publica los nuevos lanzadores hasta validar, conserva el respaldo e informa
del error. Corregido el problema, se puede repetir el comando.

## 5. Abrir la shell y autenticar Codex

Abre una terminal nueva. Desde un proyecto concreto:

```sh
gsh --version
gsh list
gsh
```

Dentro de Gentle:

```text
/login
```

Elige **OpenAI Codex / OpenAI (ChatGPT Plus/Pro)** y completa OAuth. Este perfil
almacena su propia autenticación; no copia credenciales de OpenCode o de otro Pi.

Después:

```text
/model
/gentle:status
/gentle:doctor
/gentle:profiles
```

Comprueba:

1. Proveedor `openai-codex`.
2. Disponibilidad de `gpt-6-sol`, `gpt-6-luna` y `gpt-6-astra` para tu cuenta.
3. Perfil `daily`, con orquestador Sol `high`.
4. Herramientas de memoria disponibles.
5. Ningún fallo de carga de extensiones o herramientas duplicadas.

Si Astra no está disponible para tu cuenta, `daily` utiliza exclusivamente Sol y
Luna. No apliques los otros perfiles esperando una sustitución automática.

Desde la terminal, una comprobación local posterior es:

```sh
python3 -I gentle/check.py --installed
gsh --list-models
```

El checker inspecciona archivos; no demuestra que OAuth o una llamada al modelo
funcionen. El catálogo y `/gentle:doctor` completan la comprobación interactiva.

## 6. Empezar con ODD

ODD ya es el flujo habitual. No necesitas inicializar SDD para programar:

```text
Corrige este error usando las convenciones del proyecto. Explora primero,
limita los cambios al problema y ejecuta las comprobaciones pertinentes.
```

Para cambios sustanciales, Gentle puede crear `odd/tasks/<feature>.md`, mantener
su progreso y reflejarlo en Engram. El AGENTS instalado establece que **los
commits y operaciones de publicación requieren una petición tuya**.

Esa regla es una preferencia de comportamiento entregada al modelo; no es un
bloqueo del sistema operativo ni un interceptor de comandos Git.

TDD sigue lo decidido por cada proyecto. La mera existencia de tests no habilita
TDD estricto. Indica el runner exacto y el modo cuando corresponda.

## 7. Elegir perfil y observar subagentes

```text
/gentle:profiles
```

Selecciona `daily`, `performance` o `deep` y pulsa Enter para aplicar.
La selección puede cambiar el modelo de la sesión actual si está autenticado y
disponible. Para ajustar roles:

```text
/gentle:models
```

`Ctrl+S` guarda routing; `u` guarda y actualiza también el perfil correspondiente.
Cambiar solamente `/model` o `/thinking` no redefine por sí mismo todo el perfil.

La versión 3.7.0 documenta un posible lanzamiento de retraso en la reconciliación
del routing de hijos. Comprueba el modelo/esfuerzo mostrado en la primera tarea
tras cambiar de perfil; no asumas que la etiqueta del perfil prueba el routing.

Background está inicialmente habilitado:

```text
/gentle:background-subagents status
```

`max_concurrency: 4` es un límite **por orquestador de Gentle Agents**, no una
cuota global del equipo o de Codex. Varias sesiones pueden sumar más procesos;
la revisión nativa tiene su propia ejecución. No se obliga a crear cuatro hijos.

- `Alt+A`: ver agentes y sus resultados.
- `Alt+G`: cambios capturados por herramientas de edición.
- `Alt+K`: paleta de comandos Gentle.
- `/gentle:usage`: cuota disponible cuando el proveedor la exponga.
- `/session`: contexto y consumo de la sesión.

La vista de cambios no sustituye `git diff`: las escrituras mediante shell no
necesariamente aparecen en ella. Los hijos que deban preguntarte usan `task`,
pues sus diálogos no se atienden en modo background.

## 8. Comprobar Engram

Los lanzadores fijan:

```text
ENGRAM_DATA_DIR = ${XDG_DATA_HOME:-$HOME/.local/share}/engram-pi
ENGRAM_PORT = 7438
ENGRAM_BIN = <directorio de datos>/gentle/bin/engram
```

El complemento oficial arranca su servidor local cuando lo necesita. `gsh` limpia
un `ENGRAM_URL` heredado para que no redirija memoria a un servidor anterior.

En el primer proyecto, pide comprobar `mem_current_project`. Revisa que el
proyecto resuelto corresponda al repositorio actual antes de usar memoria de ese
proyecto. `/gentle:doctor` permite comprobar la disponibilidad de herramientas.

La integración oficial elegida **captura prompts y eventos automáticamente**,
gestiona recuperación tras compactación y envía resultados elegibles para captura
pasiva. No reproduce la antigua política personalizada de memoria crítica.

La versión npm publicada observada al preparar esta guía fue `gentle-engram`
`0.1.16`; sus herramientas Pi nativas conviven con un gateway MCP configurado con
`directTools: false`. La documentación de desarrollo ya prepara `0.1.17`, cuya
inicialización cambia. Consulta `installed.json` antes de aplicar instrucciones
de una versión diferente. Algunas herramientas requieren Engram core >= 2.1.0;
el binario fijado aquí es 2.2.1.

## 9. Usar SDD cuando lo elijas

Para una tarea en la que quieras propuesta, especificación, diseño y tareas
separadas:

```text
/gentle:sdd-preflight
```

Confirma en su diálogo:

| Pregunta | Elección inicial recomendada |
| --- | --- |
| Ejecución | `auto` |
| Almacén de artefactos | `openspec` |
| Estrategia de entrega | `ask-on-risk` |

Después, si el proyecto aún no está inicializado:

```text
/gentle-sdd-init
```

Los agentes y soporte SDD se instalan bajo demanda. No se necesita otro CLI de
OpenSpec. Las especificaciones aceptadas viven en `openspec/specs/` y los cambios
en `openspec/changes/`.

Cada sesión interactiva confirma su preflight la primera vez que usa SDD.
La inicialización de proyecto y esa confirmación de sesión son cosas distintas.

**Matiz de la versión fijada:** Gentle AI 3.7.0 aún exige verificación y evidencia
en su flujo nativo, aunque algunas secciones upstream describan una futura ruta
de archivo con verificación opcional. Sigue el estado e instrucciones del runtime.

## 10. Activar RDD cuando lo elijas

Consulta primero:

```text
/gentle:review-mode status
```

La prueba real confirmó que **Gentle AI 3.7.0 usa RDD `on` por defecto**, aunque
partes de la documentación de Gentle Shell lo describen como opt-in. Para aplicar
la elección de este perfil, el instalador ejecuta el CLI oficial y guarda `off`
cuando todavía no existe una decisión global. Es un estado compartido de Gentle AI
en `~/.gentle-ai`, no una preferencia privada de la TUI.

Una decisión global previa `on` u `off` se conserva. Si aparece activo y quieres
ODD sin RDD, utiliza explícitamente `disable`.

Para habilitar revisión nativa:

```text
/gentle:review-mode enable
```

Para deshabilitar nuevas revisiones:

```text
/gentle:review-mode disable
```

Los perfiles ya incluyen los roles de revisión, refutación y validación. Tenerlos
configurados no inicia una revisión. RDD añade llamadas y coordinación; úsalo
cuando quieras ese proceso adicional. No requiere habilitar SDD.

Las decisiones de revisión y perfil no sustituyen tu autorización para un commit,
push, PR o merge.

## 11. Reanudar correctamente

```sh
gsh                            # nueva sesión
gsh-last                       # última sesión del proyecto actual
gsh -r                         # selector de sesiones
gsh --session ID               # sesión concreta
```

Los comandos son ejecutables, no aliases: también sirven desde scripts o SSH con
terminal. Ambos usan el mismo entorno y directorios, y conservan el cwd y los
argumentos con espacios. `gsh-last` no impone modelo o esfuerzo al reanudar:
Pi restaura los registrados en esa sesión.

**Continuar no es mantener el trabajo vivo.** Al cerrar Pi terminan sus hijos
activos. `gsh-last` recupera la conversación y el trabajo registrado, no un daemon
que continuó calculando después de cerrar la terminal. Para una sesión SSH que
deba seguir abierta durante una desconexión, una terminal persistente como tmux
es una decisión adicional, no una propiedad de estos lanzadores.

## 12. Mantenimiento y respaldos

### Reinstalación

```sh
python3 -I gentle/install.py
```

Se crea otro respaldo y vuelve a ejecutarse el setup oficial. Nuestros ajustes
son **valores iniciales**: se conservan claves existentes, perfil seleccionado,
perfiles editados y políticas elegidas en la interfaz. El bloque administrado de
AGENTS y los lanzadores sí se actualizan desde este repositorio.

Los nombres anteriores `diario`, `rendimiento` y `profundo` se migran a `daily`,
`performance` y `deep`, conservando el perfil activo y sus asignaciones. Si hay
dos perfiles distintos con el nombre antiguo y el nuevo, el instalador pide
resolver el conflicto antes de desplegar. Los pins de otros repositorios se
actualizan desde `/gentle:profiles`; no se recorren repositorios ajenos al instalar.

Editar `templates/profiles.json` no reemplaza un perfil del mismo nombre ya
personalizado en el equipo. Para cambiarlo, usa `/gentle:models` y `u`, o aplica
deliberadamente los cambios al catálogo instalado después de respaldarlo.

### Aprovisionamiento oficial

```sh
gsh setup
```

Reejecuta el setup de la versión Gentle AI privada. Para reponer también nuestras
preferencias que falten, utiliza el instalador completo. Un `gentle-ai sync`
global podría usar otra versión y otro perfil; no es el mantenimiento de esta
instalación standalone.

Se eligió **mantener el aprovisionamiento automático oficial**. `gsh` y
`gsh-last` limpian un `GENTLE_SHELL_NO_AUTO_SETUP` heredado, para que el lanzador
decida cuándo hace falta aprovisionar según sus propias marcas y versiones.

En Gentle Shell 3.7.0, el `setup` manual no escribe la marca utilizada por el
aprovisionamiento automático. Por eso, después del instalador, el primer `gsh`
puede repetir el setup. La ejecución automática satisfactoria registra su marca;
no debería repetirse en cada arranque sin otro motivo.

El lanzador también puede reaprovisionar al detectar cambios de versión o un
aprovisionamiento incompleto. Los selectores móviles de sus complementos pueden
resolver versiones nuevas; revisa el resultado y vuelve a ejecutar el checker.
Si el auto-setup falla, el comportamiento oficial es avisar, intentar abrir Pi y
reintentarlo en otro arranque. Que aparezca la interfaz no demuestra que el setup
haya terminado bien: consulta `/gentle:doctor` y, si hace falta, `gsh setup`.

### Actualizar versiones principales

#### Aviso «Package Updates Available: pi-mcp-adapter»

El setup de Gentle AI 3.7.0 declara `pi-mcp-adapter: ^2.6.0` en
`~/.gentle-shell/agent/npm/package.json`. La instalación verificada usa **2.38.0**,
mientras npm publica **3.1.0** como última versión. El aviso de Pi compara con la
última publicación; no significa que un plugin haya fallado.

La versión 3.x queda fuera del rango administrado por Gentle. `pi update
--extensions` no es una garantía de resolver esa diferencia, y el setup puede
volver a aplicar el rango 2.x. Mantén la versión comprobada hasta actualizar la
integración de Gentle o decidir expresamente probar el cambio de versión mayor.

#### Procedimiento

1. Leer las notas de Pi, Gentle Shell y su pin de Gentle AI.
2. Actualizar `versions.json`; Engram requiere cambiar también sus SHA-256.
3. Revisar los esquemas y nombres de roles si upstream los ha cambiado.
4. Ejecutar checker y tests.
5. Cerrar sesiones y ejecutar el instalador.
6. Validar `/gentle:doctor`, routing, una tarea pequeña y reanudación.

Los runtimes npm se guardan en directorios versionados. Los hashes de descarga
protegen la instalación inicial de Engram; la reutilización local comprueba su
versión, no vuelve a acreditar la integridad de todos los archivos instalados.

### Recuperar configuración

Cada respaldo tiene un `manifest.json` con la ruta original y si existía. Los
directorios `npm`, `git` y `sessions` se excluyen de la copia de configuración;
no es una copia completa del HOME ni de todo el historial.

Con Gentle cerrado, usa ese manifiesto para comparar y restaurar únicamente los
archivos afectados. La copia de la base es `engram.db`; cualquier restauración de
SQLite requiere detener primero el servidor que la usa. Restaurar JSON no
revierte paquetes, migraciones de base ni otros efectos del setup de terceros.

## 13. Qué está verificado y qué falta al desplegar

La [verificación real del 28 de septiembre](docs/verificacion.md) documenta la
instalación en el equipo: 17 extensiones sin conflictos, Engram independiente,
reanudación de una sesión sintética, prueba de TUI y OpenCode conservado. También
se verificaron cero diagnósticos de colisión en skills, prompts y temas después
del adaptador. Tras completar OAuth, una respuesta real de Sol `high` confirmó
la conexión Codex y un arranque sin overrides confirmó ese modelo inicial.

La [verificación de perfiles del 29 de septiembre](docs/verificacion-perfiles.md)
añade llamadas reales a Sol, Luna y Astra: los tres perfiles completaron una
corrección y sus cinco tests, con routing efectivo correcto en los nueve hijos.
También se midieron arranque, consumo de la TUI y la cola de concurrencia 4.
Es una muestra funcional acotada, no una garantía de rendimiento para toda tarea.

**Comprobaciones automatizadas locales:**

- Esquemas utilizados y cobertura de roles de las tres plantillas.
- Instalación/reinstalación con dobles, preservación de preferencias y respaldos.
- `gsh` y `gsh-last` en Bash y Zsh, con rutas con espacios/apóstrofes y rc enlazado.
- Entorno de perfil, memoria, runtime de hijos y paso correcto de argumentos.
- Rechazo de JSON inválido, comandos ajenos y archivo Engram con hash incorrecto.
- Fallo de setup antes de publicar los lanzadores; extracción limitada del tar.

**Comprobaciones del primer despliegue real:** descarga y setup de los releases,
carga de extensiones, OAuth, catálogo accesible por tu cuenta, petición a un
modelo, delegación con el routing esperado, memoria efectiva y reanudación.
SDD/RDD necesitan su prueba real cuando decidas usarlos. Los tests con dobles no
afirman esas capacidades ni miden rendimiento de modelos.

Pi no pide permiso antes de cada herramienta. `defaultProjectTrust: ask` controla
la carga de recursos del proyecto; no es el sistema de permisos de OpenCode.

## Archivos y documentación primaria

| Archivo | Responsabilidad |
| --- | --- |
| `install.py` | Plan, requisitos, respaldo, runtimes, setup, configuración y comandos |
| `pi_compat.py` | Elimina únicamente las rutas de recursos redundantes del paquete Gentle |
| `check.py` | Comprobaciones de plantillas y archivos instalados |
| `test_install.py` | Pruebas aisladas sin red ni llamadas a modelos |
| `versions.json` | Versiones y hashes de Engram |
| `templates/settings.json` | Preferencias iniciales de Pi |
| `templates/profiles.json` | Perfiles oficiales de routing |
| `templates/AGENTS.md` | Reglas personales instaladas |
| [docs/modelos.md](docs/modelos.md) | Asignaciones, esfuerzo y criterio de ajuste |
| [docs/fuentes.md](docs/fuentes.md) | Documentación y versiones contrastadas |
| [docs/verificacion.md](docs/verificacion.md) | Evidencia del despliegue real y pendientes |
