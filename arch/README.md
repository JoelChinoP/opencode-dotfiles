# Arch Linux

## 1. Dependencias del sistema

Ejecuta tú, si falta algún paquete:

```sh
sudo pacman -Syu --needed opencode python nodejs npm curl tar coreutils git ripgrep \
  pandoc libreoffice-still poppler chromium
opencode --version
```

Debe ser OpenCode **V2**; la versión probada es `2.0.8`. `pacman -Si opencode`
permite comprobar la versión ofrecida por tu mirror. No se usa AUR ni paru.
Python se usa con su biblioteca estándar y `-I`; no se activa ningún venv ni se
instalan librerías globales. Node.js 20+ y npm instalan el runtime Playwright
fijado por lockfile. No necesitas Bun, Go, SQLite CLI ni un compilador de TypeScript.

`qpdf` y `tesseract` son capacidades documentales opcionales:

```sh
sudo pacman -Syu --needed qpdf tesseract tesseract-data-spa
```

Las skills base no requieren PyPI. Si una futura skill necesita una librería,
debe declarar PEP 723 y un lock por script para ejecución bajo demanda con `uv`;
no se exportará `VIRTUAL_ENV` ni se añadirá un venv al `PATH`. `uv` no se instala
por anticipado.

Engram no está en los repositorios oficiales consultados. El instalador sigue el
método oficial de archivo binario: **2.0.0 estable**, Linux amd64/arm64 y SHA-256
fijado. Lo guarda en:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/opencode-dotfiles-v2/bin/engram-2.0.0
```

El MCP usa esa ruta absoluta generada. No depende del `engram` antiguo de tu PATH
ni cambia instalaciones externas. La comprobación real se hizo en x86_64; arm64
tiene checksum oficial, pero no se ejecutó en hardware ARM.

Playwright CLI se instala sin tocar el prefijo npm global en:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/opencode-dotfiles-v2/tools/playwright-cli-0.1.21
```

`npm ci --ignore-scripts` verifica las integridades del lockfile y el wrapper
administrado utiliza `/usr/bin/chromium`; no descarga otro navegador. El directorio
`bin/` administrado se añade al entorno de Bash/Zsh sin activar Python.

## 2. Desplegar el perfil

Cierra las sesiones de OpenCode antes de activar el perfil. Si tienes un
`engram serve` antiguo, detén ese proceso desde su terminal/servicio antes de usar
la nueva versión con la misma base. Este perfil usa MCP stdio y no necesita daemon HTTP.

Desde la raíz del repositorio:

```sh
bash arch/install.sh
```

El script realiza, en orden:

1. Comprueba Arch, usuario sin root, comandos necesarios y versión de OpenCode.
2. Descarga y verifica Engram antes de tocar la configuración existente.
3. Instala el paquete Playwright fijado fuera del npm global y genera su wrapper
   para Chromium del sistema.
4. Prepara plantillas, plugins y skills en un directorio temporal del mismo
   filesystem; fija `hostname: 127.0.0.1`.
5. Valida JSON, skills, licencias/procedencia, paquetes, permisos, binarios y
   pruebas locales antes del reemplazo.
6. Respalda la base Engram con SQLite Backup API (incluye datos en WAL) y copia el
   contenido del perfil anterior al respaldo, incluso si la carpeta es un symlink.
   Intercambia los perfiles con renames en el mismo
   filesystem y restaura el anterior si falla el segundo movimiento.
7. Instala `PONYTAIL_DEFAULT_MODE=lite` y el directorio de herramientas
   administradas, respaldando y normalizando el entorno anterior.
8. Añade `oc` y `oc-last` en Bash/Zsh sin duplicarlos al reinstalar; retira los
   aliases simples y el monitor instalados por la versión anterior.
9. Reinicia OpenCode y comprueba plugins y MCPs, salvo con `--no-start`.

Los antiguos scripts numerados eran TODOs. Estas fases están ahora en un único
instalador; las skills forman parte del staging verificado y no tienen un
bootstrap independiente.

**Es un reemplazo, no un merge.** El respaldo conserva todos los ajustes previos,
incluidos modelos/proveedores personalizados, skills, comandos y plugins.
`service.json` conserva puerto, autenticación y demás ajustes, excepto el hostname,
que se fija en `127.0.0.1`. No se configura una contraseña manual: OpenCode gestiona
su credencial interna y el cliente local la descubre automáticamente. La autenticación y las
sesiones de OpenCode almacenadas fuera de la configuración no se borran.

Cada ejecución imprime el respaldo único bajo
`${XDG_DATA_HOME:-$HOME/.local/share}/opencode-dotfiles-v2/backups/`.
Reinstalar vuelve a aplicar las plantillas y crea otro respaldo; incorpora cambios
permanentes a las plantillas o recupéralos después. No hay actualizaciones móviles:
Engram, las skills y Playwright se cambian explícitamente con versión/commit y locks.

Para separar despliegue y activación:

```sh
bash arch/install.sh --no-start
opencode service restart
bash arch/verify.sh --live
```

## 3. Primer uso

```sh
opencode
```

### Atajos de terminal

Abre una terminal nueva después de instalar:

```sh
oc                                    # opencode; descubre/inicia el servicio local
oc-last                               # opencode --continue; retoma la última sesión
oc --session ses_ID                    # retoma una sesión concreta
```

Para el servicio administrado local basta `oc`, aunque cambie el puerto.
`opencode service status` muestra su dirección efectiva.

El instalador añade `alias oc='command opencode'` y
`alias oc-last='command opencode --continue'` a `~/.bashrc` o a
`${ZDOTDIR:-$HOME}/.zshrc`. Pasan los argumentos al ejecutable del PATH y evitan
funciones antiguas llamadas `opencode`. Antes de añadirlos, el archivo existente
se copia al respaldo como `shellrc`; si es un symlink, se conserva y se escribe
en su destino. Estos nombres quedan reservados para OpenCode en esa shell.

Son aliases interactivos: en scripts usa `opencode`. Para otras shells el
instalador imprime las equivalencias para configurarlas con su sintaxis nativa.

### Retomar una sesión por SSH

```sh
ssh usuario@equipo
cd /ruta/del/proyecto
oc-last
# O una sesión concreta:
oc --session ses_ID
```

Usa el mismo usuario y las mismas rutas HOME/XDG que iniciaron OpenCode. No hace
falta publicar el servidor en la LAN, abrir un puerto ni introducir otra contraseña.
SSH proporciona el acceso remoto; el cliente se conecta al servicio local.

La TUI ya muestra historial, actividad y permisos, y permite intervenir. No se
instala un monitor adicional. Los aliases son interactivos; para lanzar la TUI
desde un comando SSH directo, reserva una terminal y usa el ejecutable:

```sh
ssh -t usuario@equipo 'cd /ruta/del/proyecto && opencode --continue'
```

### Servicio y cierre de la terminal

`opencode service start` es adecuado, pero **no es necesario antes de cada `oc`**:
V2 descubre o inicia automáticamente el mismo servicio compartido. En 2.0.8 se
lanza separado de la terminal (`detached`, `unref`); la instancia inspeccionada
ya ejecutaba `opencode serve --service` sin TTY. Cerrar la terminal o desconectar
SSH deja el trabajo en el servicio; al reconectar puedes abrir la misma sesión.
Un permiso pendiente seguirá esperando tu respuesta en la TUI.

Para arrancarlo expresamente sin abrir la interfaz:

```sh
opencode service start
opencode service status
```

El instalador ya usa `service restart` para activar el perfil. El modo
`--standalone` tiene un servidor privado y no es el flujo previsto para esto.
La separación de la terminal no garantiza continuidad tras apagar/reiniciar el
equipo, parar el servicio o una política del sistema que mate los procesos al
cerrar todas las sesiones de usuario. No se necesita otra unidad systemd para
el uso normal de la TUI por SSH.

### Integraciones

- Selecciona tu proveedor/modelo en la interfaz. Si necesitas fijarlo, añade
  `"model": "proveedor/modelo"` a la configuración instalada.
- Context7 funciona sin clave en la prueba realizada. Si solicita autenticación,
  usa `/mcps`, selecciona Context7 e inicia sesión. No se guarda ninguna clave
  en el repositorio; la autenticación depende del servidor y sus límites.
- Engram debe aparecer `connected`; usa `--tools=agent` (19 herramientas en 2.0.0).
- CodeGraph debe aparecer `disabled`. Es el servicio de **codegraph.ru** descrito
  por el informe, no uno de los otros proyectos homónimos. Su activación requiere
  acceso a un proyecto en ese servicio: cambia `disabled` a `false`, autentica
  desde `/mcps` y comprueba la identidad del proyecto. No se instala su plugin V1.
- Las reglas de Ponytail se aplican con el plugin local. El nivel inicial es
  `lite`; `/ponytail` sin argumento usa `full`, y `/ponytail lite|full|ultra|off`
  lo cambia solo en esa sesión.
- La statusline de subagentes vive en `templates/plugins/subagent-statusline.v2/`
  y se registra en `cli.json` como plugin de TUI; no consume contexto del modelo y
  solo muestra información en la interfaz.
- `document-files`, `frontend-design` y `playwright-cli` se anuncian cuando son
  pertinentes. `skill-governance` queda disponible para carga explícita, pero
  `opencode/autoinvoke: false` la omite del catálogo del modelo.
- La política de skills deniega IDs no administrados y vuelve a permitir las
  integradas `opencode`/`report` y las cuatro fijadas. Para una skill propia de un
  proyecto hay que añadir una regla `skill` explícita en su configuración.
- `playwright-cli` usa perfiles en memoria por defecto. No adjuntes el navegador
  personal ni uses persistencia/estado de autenticación salvo necesidad expresa;
  cierra la sesión al terminar.

### Ponytail y PONYTAIL_DEFAULT_MODE

El plugin local (`~/.config/opencode/plugins/ponytail/`) respeta esta precedencia
para el nivel inicial: `PONYTAIL_DEFAULT_MODE` → opción `defaultMode` del plugin
(`lite`) → `lite`. El instalador establece `lite` también en el entorno de shell,
actualizando una asignación previa y guardando el archivo anterior como
`ponytail-env` dentro del respaldo:

- zsh: `~/.zshenv` (o `$ZDOTDIR/.zshenv`)
- bash: `~/.bashrc`
- otros: `~/.profile`

Si el archivo es un enlace a tus dotfiles, se escribe en el destino. Abre una
shell nueva (o reinicia el servicio) para que el entorno la reciba. Para cambiar
el nivel por defecto, edita esa línea o la opción del plugin en `opencode.jsonc`.

Nota: si usas además Ponytail con otro agente, su resolución upstream es
`PONYTAIL_DEFAULT_MODE` → `~/.config/ponytail/config.json` → `full`. Una
configuración propia con `defaultMode: off` no afecta al plugin local, pero la
variable de entorno sí la anula en esos agentes.

### Herdr opcional

Si usas Herdr, instala su integración oficial (requiere Herdr 0.9.1 o posterior)
**después de desplegar el perfil**:

```sh
herdr integration install opencode
herdr integration status
```

Reabre la TUI de OpenCode después de instalar. Herdr administra sus archivos y el
registro de plugins de TUI; este repositorio no mantiene una copia modificada. Si
reinstalas el perfil limpio, vuelve a ejecutar ese comando. Tras actualizar Herdr,
reinstala la integración para recoger sus cambios. Consulta la
[documentación oficial](https://herdr.dev/docs/integrations/#opencode).

La versión local anterior, Herdr **0.8.2**, instalaba la integración V1
(`tui.jsonc`) y OpenCode 2.0.8 la rechazaba; en **0.9.1** la integración es v12 y
carga correctamente. Esa versión antigua además ignoraba `XDG_CONFIG_HOME` y escribía
en `~/.config/opencode`; la actual respeta las rutas configuradas.

Las skills integradas `opencode` y `report` continúan permitidas. Las copias que
existan en `~/.claude/skills` o `~/.agents/skills` siguen en disco, pero no se
anuncian mientras su ID no tenga una regla de permiso explícita.

## 4. Comprobar

```sh
node arch/check.mjs
python arch/check-install.py
bash arch/check-documents.sh
bash arch/verify.sh
bash arch/verify.sh --live
```

`check-install.py` ejecuta el instalador dos veces para Bash y Zsh en HOME/XDG
temporales, con dobles de OpenCode/Engram: no descarga binarios ni arranca servicios.
Comprueba respaldo del rc, symlinks, reinstalación, argumentos y códigos de salida
de los atajos, skills, wrapper Playwright, retirada de aliases/binario anteriores,
loopback y Ponytail. También inyecta una
plantilla inválida y un fallo de intercambio para comprobar que el perfil previo
se conserva/restaura. Requiere ambas shells y las dependencias del instalador en Arch.

`check-documents.sh` crea un DOCX desde Markdown, prueba el contenedor y su
lectura, lo convierte con un perfil LibreOffice aislado, extrae y renderiza el
PDF y usa `qpdf --check` cuando qpdf está disponible.

Para validar una preparación sin tocar el perfil instalado:

```sh
bash arch/verify.sh --config-dir /ruta/al/staging
```

`--config-dir` y `--live` son excluyentes. La validación previa es local; la conexión
MCP y carga TUI reales se comprueban al activar. Un fallo de red/arranque posterior
se informa y deja el respaldo disponible, sin intentar cambios de base de datos
ni reinicios adicionales para ocultarlo.

`--live` comprueba el servidor y los MCPs del directorio desde el que lo ejecutas.
Una configuración local del proyecto puede cambiar el perfil global. Para aislar
ese caso, usa un directorio sin configuración de proyecto.
Si algún plugin falla al cargar, `--live` muestra su ID o su origen, incluso si el
plugin incompatible no llegó a registrar un ID.

Lint Bash opcional, si quieres instalarlo:

```sh
sudo pacman -Syu --needed shellcheck
shellcheck arch/*.sh
```

## Actualizaciones

Actualiza OpenCode con pacman. Engram está fijado: al cambiar su versión, actualiza
también los checksums del instalador y comprueba la política con `node arch/check.mjs`
y el perfil instalado con `bash arch/verify.sh --live`.

Para actualizar Playwright cambia juntos `templates/tools/playwright-cli/`, la
skill vendorizada, su `UPSTREAM.md` y `skills-lock.json`; ejecuta `npm ci` en un
staging y prueba una sesión real con Chromium. Para `frontend-design`, revisa el
árbol y la licencia del nuevo commit antes de copiarlo.

Para futuros plugins publicados compatibles con V2, usa `opencode plugin add`,
`opencode plugin check` y `opencode plugin update`. Este último omite plugins
locales y versiones exactas fijadas; esas versiones se cambian explícitamente.

## Restaurar

Con OpenCode y los procesos Engram detenidos, usa la ruta de respaldo que imprimió
el instalador. Conserva primero la configuración nueva si quieres recuperarla:

```sh
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
backup="/ruta/al/respaldo/install.XXXXXXXX"
mv "$config_dir" "${config_dir}.v2-apartado-$(date +%s)"
mv "$backup/opencode" "$config_dir"
opencode service restart
```

Una base migrada por Engram 2 no debe abrirse a ciegas con Engram 1. Para volver
a Engram 1, conserva aparte la carpeta Engram actual completa (DB/WAL/SHM) y
restaura `engram.db` del respaldo con todos sus procesos detenidos. Los recuerdos
creados después del respaldo no están en esa copia; expórtalos primero si los necesitas.
