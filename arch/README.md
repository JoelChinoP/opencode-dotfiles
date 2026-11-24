# Arch Linux

## 1. Dependencias del sistema

Ejecuta tú, si falta algún paquete:

```sh
sudo pacman -Syu --needed opencode python nodejs npm curl tar coreutils git ripgrep \
  pandoc libreoffice-still poppler chromium graphviz fontconfig noto-fonts
opencode --version
```

Debe ser OpenCode **V2**; la instalación actual está verificada con `2.2.0`
(las pruebas iniciales se hicieron con `2.0.8`). `pacman -Si opencode`
permite comprobar la versión ofrecida por tu mirror. No se usa AUR ni paru.
Python se usa con su biblioteca estándar y `-I`; no se activa ningún venv ni se
instalan librerías globales. Node.js 22+ y npm instalan los runtimes Playwright,
PptxGenJS y Modern Web Guidance fijados por lockfile. Graphviz renderiza los diagramas editables y Noto Sans/Serif
son las fuentes de referencia. No necesitas Bun, Go, SQLite CLI ni TypeScript.

`qpdf` y `tesseract` son capacidades documentales opcionales:

```sh
sudo pacman -Syu --needed qpdf tesseract tesseract-data-spa
```

Las skills base no requieren PyPI. Si una futura skill necesita una librería,
debe declarar PEP 723 y un lock por script para ejecución bajo demanda con `uv`;
no se exportará `VIRTUAL_ENV` ni se añadirá un venv al `PATH`. `uv` no se instala
por anticipado.

Engram no está en los repositorios oficiales consultados. El instalador sigue el
método oficial de archivo binario: **3.6.1 estable**, Linux amd64/arm64 y SHA-256
fijado. Lo guarda en:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/opencode-dotfiles-v2/bin/engram-3.6.1
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

`modern-web-guidance` **1.0.2** incluye buscador, guías y datos de compatibilidad
locales. El wrapper desactiva la telemetría y los registros de uso. Para probarlo:

```sh
modern-web-guidance search "light dismiss dialog"
modern-web-guidance retrieve light-dismiss-a-dialog
```

`slides-node` ejecuta generadores CommonJS con PptxGenJS **4.0.1** desde
`tools/presentations-<sha256-del-lock>/`. El hash identifica también las dependencias
transitivas; se instala con `npm ci --ignore-scripts`, sin modificar npm global.
El wrapper limita `NODE_PATH` a esa ejecución. Un script de usuario puede ejecutar
código normal de Node: se mantiene la autorización de shell por proyecto.

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
3. Instala Playwright, Modern Web Guidance y PptxGenJS fijados fuera del npm
   global; publica los wrappers `playwright-cli`, `modern-web-guidance` y `slides-node`.
4. Prepara plantillas, plugins y skills en un directorio temporal del mismo
   filesystem; fija `hostname: 127.0.0.1`.
5. Valida JSON, skills, licencias/procedencia, paquetes, permisos, binarios y
   pruebas locales antes del reemplazo.
6. Respalda la base Engram con SQLite Backup API (incluye datos en WAL) y copia el
   contenido del perfil anterior al respaldo, incluso si la carpeta es un symlink.
   Intercambia los perfiles con renames en el mismo
   filesystem y restaura el anterior si falla el segundo movimiento.
7. Fija `lite` en `opencode/.ponytail-active`, `ponytail/config.json` y
   `PONYTAIL_DEFAULT_MODE`; respalda la configuración y el entorno anteriores.
   OpenCode resuelve el paquete oficial `@dietrichgebert/ponytail@5.3.3` al cargar.
8. Añade `oc` y `oc-last` en Bash/Zsh sin duplicarlos al reinstalar; retira los
   aliases simples y el monitor instalados por la versión anterior.
9. Si Herdr estable >= 0.9.1 está en el PATH, ejecuta su integración oficial para
   OpenCode sobre el perfil desplegado. Sin Herdr, continúa con el perfil base.
10. Reinicia OpenCode y comprueba plugins y MCPs, salvo con `--no-start`.

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
Engram, Ponytail, las skills y los runtimes npm se cambian explícitamente con versión/commit y locks.

Para desplegar sin reiniciar (OpenCode recarga configuración y skills):

```sh
bash arch/install.sh --no-start
# Desde un directorio sin configuración de proyecto:
bash /ruta/al/repositorio/arch/verify.sh --live
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
- Engram debe aparecer `connected`; usa `--tools=agent` (23 herramientas en 3.6.1).
- CodeGraph debe aparecer `disabled`. La entrada es local:
  `codegraph serve --mcp`. El perfil no instala el binario ni genera índices.
  Actívalo solo en el proyecto que lo necesite, con el ejecutable disponible y su
  contexto preparado. Esta elección sustituye el endpoint remoto de codegraph.ru
  usado en la preparación inicial.
- Las reglas de Ponytail se aplican con el plugin oficial. La instalación activa
  `lite`; `/ponytail` sin argumento conserva el nivel activo, y
  `/ponytail lite|full|ultra|off` cambia el nivel compartido entre conversaciones.
- La statusline de subagentes vive en `templates/plugins/subagent-statusline.v2/`
  y se registra en `cli.json` como plugin de TUI; no consume contexto del modelo y
  solo muestra información en la interfaz.
- `document-files`, `presentation-slides`, `diagram-design`, `frontend-design` y
  `playwright-cli` se anuncian cuando son
  pertinentes. `skill-governance` queda disponible para carga explícita, pero
  `opencode/autoinvoke: false` la omite del catálogo del modelo.
- La política de skills deniega IDs no administrados y vuelve a permitir las
  integradas `opencode`/`report`, las seis fijadas y las seis de Ponytail. Para una skill propia de un
  proyecto hay que añadir una regla `skill` explícita en su configuración.
- `playwright-cli` usa perfiles en memoria por defecto. No adjuntes el navegador
  personal ni uses persistencia/estado de autenticación salvo necesidad expresa;
  cierra la sesión al terminar.

### Permisos por proyecto

El perfil global usa `session.permissions: prompt` en `cli.json`. `Ctrl+P` permite
cambiar el modo de la TUI, pero ese ajuste es global, no por proyecto. Para
autorizar una operación habitual solo en un proyecto, usa «Allow always» en su
solicitud de permiso o declara reglas acotadas en su `opencode.jsonc`, por ejemplo:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permissions": [
    { "action": "shell", "resource": "npm test", "effect": "allow" }
  ]
}
```

El resto de comandos sigue sujeto a las reglas globales. No se añade una
autorización general de shell a todos los proyectos.

### Ponytail y PONYTAIL_DEFAULT_MODE

El plugin oficial lee primero `~/.config/opencode/.ponytail-active`. Si falta o
no contiene un nivel válido, resuelve `PONYTAIL_DEFAULT_MODE` →
`~/.config/ponytail/config.json` (`defaultMode`) → `full`.
Las rutas respetan `XDG_CONFIG_HOME`. El instalador fija `lite` en ambos archivos
y en la shell, guardando los valores anteriores en el respaldo:

- zsh: `~/.zshenv` (o `$ZDOTDIR/.zshenv`)
- bash: `~/.bashrc`
- otros: `~/.profile`

No hace falta iniciar un chat para dejarlo activo. Para cambiar el nivel desde
la terminal, sin consumir tokens ni reiniciar OpenCode:

```sh
printf 'lite\n' > "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/.ponytail-active"
```

Sustituye `lite` por `full`, `ultra` u `off`. Se lee en la siguiente petición y
se comparte entre sesiones. Cambiar solo `defaultMode` no pisa un nivel activo.

### Herdr opcional

Herdr es opcional. Si su binario estable 0.9.1 o posterior ya está en el PATH,
`arch/install.sh` instala de nuevo su integración oficial **después de desplegar
el perfil**, también con `--no-start`. Si está ausente o es anterior, el perfil
base se instala sin registrar Herdr. El script no descarga ni actualiza Herdr.

Para integrar manualmente o comprobar su estado:

```sh
herdr integration install opencode
herdr integration status
```

Reabre la TUI de OpenCode después de instalar. Herdr administra sus archivos y el
registro de plugins de TUI; este repositorio no mantiene una copia modificada.
Si su integración falla, el instalador informa del error y conserva el perfil
desplegado y su respaldo. Tras actualizar Herdr, reinstala la integración para
recoger sus cambios. Consulta la
[documentación oficial](https://herdr.dev/docs/integrations/#opencode).

La versión local anterior, Herdr **0.8.2**, instalaba la integración V1
(`tui.jsonc`) y OpenCode 2.0.8 la rechazaba; en **0.9.1** la integración es v12 y
carga correctamente. Esa versión antigua además ignoraba `XDG_CONFIG_HOME` y escribía
en `~/.config/opencode`; la actual respeta las rutas configuradas.

#### Enlaces a archivos locales

Con Herdr >= 0.9.5, registra una vez el manejador opcional desde este checkout:

```sh
herdr plugin link "$PWD/arch/herdr-file-links"
```

La regla global entrega archivos como `[ruta absoluta](file:///ruta/archivo)`.
**Ctrl+clic** muestra el archivo seleccionado en el explorador mediante
`org.freedesktop.FileManager1.ShowItems` (por ejemplo, Nautilus). Requiere
`busctl` de systemd y una sesión gráfica local con ese servicio D-Bus.
Solo acepta enlaces `file:///...` o `file://localhost/...`; no abre documentos
en su aplicación ni resuelve rutas de otra máquina por SSH.

El manejador se ejecuta únicamente al pulsar el enlace, sin procesos residentes
ni llamadas al modelo. Conserva los controles del ratón de Herdr. El registro
es global e independiente del perfil de OpenCode; mantiene un enlace a este
checkout, que debe permanecer en su ubicación. Para retirarlo:

```sh
herdr plugin unlink opencode-dotfiles.file-links
```

Las skills integradas `opencode` y `report` continúan permitidas. Las copias que
existan en `~/.claude/skills` o `~/.agents/skills` siguen en disco, pero no se
anuncian mientras su ID no tenga una regla de permiso explícita.

## 4. Comprobar

```sh
node arch/check.mjs
python arch/check-install.py
bash arch/check-documents.sh
python -I arch/check-visuals.py --output /tmp/opencode/revision-visual-nueva
bash arch/verify.sh
bash arch/verify.sh --live
```

`check-install.py` ejecuta el instalador dos veces para Bash y Zsh en HOME/XDG
temporales, con dobles de OpenCode/Engram: no descarga binarios ni arranca servicios.
Comprueba respaldo del rc, symlinks, reinstalación, argumentos y códigos de salida
de los atajos, skills, wrapper Playwright, retirada de aliases/binario anteriores,
loopback y Ponytail. Comprueba Herdr ausente, compatible, antiguo y con fallo de
integración mediante un doble. También inyecta JSON inválido, un tipo CLI
incorrecto y un fallo de intercambio para comprobar que el perfil previo
se conserva/restaura. Requiere ambas shells y las dependencias del instalador en Arch.

`check-documents.sh` crea un DOCX desde Markdown, prueba el contenedor y su
lectura, lo convierte con un perfil LibreOffice aislado, extrae y renderiza el
PDF y usa `qpdf --check` cuando qpdf está disponible.

`check-visuals.py` prueba la referencia editorial, numeración, preservación de
archivos, gráfico/hoja de datos/notas nativos en PPTX, renderizado de tres slides y
diagramas SVG/PNG/PDF. Inyecta una figura fuera del lienzo, una relación rota y una
declaración de entidades XML para verificar rechazos. El directorio `--output`
debe ser nuevo; abre sus imágenes para completar la revisión visual. El script
no llama modelos y no acredita igualdad de paginación en Microsoft Office.

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

Para PptxGenJS actualiza `templates/tools/presentations/`, su entrada de runtime en
`skills-lock.json`, las comprobaciones de versión y el ejemplo si cambia la API.
Instala desde el lock en staging y ejecuta `check-visuals.py`. Los cambios en skills
locales también requieren recalcular sus hashes de contenido.

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
