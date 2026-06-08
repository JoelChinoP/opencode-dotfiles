# opencode-dotfiles

Instalación y configuración automatizada de **OpenCode** en **Windows**
(vía **WSL2 + Debian**) y en **Arch Linux** (nativo), optimizada para máxima
compatibilidad y mínima pérdida de rendimiento. Un **único** `opencode serve`
expone simultáneamente el **API** (para la app de escritorio y los SDK) y la
**web UI** en `/app`, publicado tras un dominio local
(`http://opencode.local`) vía **nginx** o **Caddy**, y arranca solo como
servicio **systemd**.

> Basado en la documentación oficial de OpenCode (recomienda WSL en Windows por
> "better file system performance, full terminal support, and compatibility")
> y en la documentación oficial de Microsoft para `.wslconfig`.

- **Windows** → sección [Windows (WSL2 + Debian)](#windows-wsl2--debian).
- **Arch Linux** → sección [Arch Linux (nativo)](#arch-linux-nativo).

---

# Windows (WSL2 + Debian)

## ¿Qué hace este setup?

1. **Instala/configura WSL2** y la distro **Debian** (la deja como predeterminada).
2. Aplica un **`.wslconfig`** optimizado para OpenCode + Docker.
3. Dentro de Debian instala **nano, git, curl** y **OpenCode**.
4. Aplica la configuración de git pedida:
   `core.fileMode=false` y `core.autocrlf=input`.
5. Levanta **un** servicio systemd permanente que arranca solo con la distro:
   **`opencode serve`** en `127.0.0.1:4096` → expone a la vez el **API REST**
   (lo usan la app de escritorio y los SDK) y la **web UI** en la ruta `/app`.
   No hace falta lanzar `opencode web` aparte.
6. Instala **nginx** *o* **Caddy** (lo eliges; nunca ambos) con el dominio
   **`http(s)://opencode.local`** apuntando al `:4096` del serve. Abres
   `http://opencode.local/app` en el navegador de Windows y ya está.
7. (Opcional) Instala la **app de escritorio** de OpenCode (Scoop) y la apunta al
   `opencode serve` de WSL.
8. Crea atajos **`opencode`** y **`oc`** en el PATH de Windows: corren dentro de
   Debian y vuelven a Windows al terminar (no escribes `wsl` cada vez).

Alcance: cubre desde cero hasta poder **lanzar OpenCode** (TUI, web y escritorio).
No configura el proveedor de IA (eso se hace luego con `opencode auth login`).

---

## Requisitos

- Windows 11 22H2 o superior (necesario para `networkingMode=mirrored`).
- Permisos de administrador (para instalar WSL y editar el `hosts` de Windows).
- Conexión a internet.

---

## Instalación rápida

Desde una terminal **PowerShell** (se auto-eleva a administrador con UAC):

```powershell
git clone <url-de-este-repo> D:\opencode-dotfiles
cd D:\opencode-dotfiles
powershell -ExecutionPolicy Bypass -File .\windows\install.ps1
```

Durante el proceso se te preguntará:

- Si Debian ya existe: **usar la actual** (por defecto) o **reinstalar limpio**.
- Qué reverse proxy quieres: **nginx (http)** por defecto o **Caddy (https)**.

Al terminar, abre una **terminal nueva** y ejecuta `opencode`, o entra a
`http://opencode.local` en el navegador.

> Si es la **primera vez** que se instala WSL en el equipo, Windows pedirá un
> **reinicio**. Reinicia y vuelve a ejecutar `install.ps1`.

---

## Estructura del repositorio

```
opencode-dotfiles/
├─ config/
│  └─ dotfiles.env            # Configuración central editable (compartida Win/Arch)
├─ windows/
│  ├─ .wslconfig             # Plantilla -> %USERPROFILE%\.wslconfig (ajustes de la VM)
│  ├─ common.ps1             # Utilidades compartidas
│  ├─ install.ps1            # Orquestador (auto-eleva) -> 01..04
│  ├─ 01-setup-wsl.ps1       # WSL2 + Debian + .wslconfig + systemd + hosts   [Admin]
│  ├─ 02-provision.ps1       # Copia y ejecuta provision.sh dentro de Debian
│  ├─ 03-launchers.ps1       # Atajos 'opencode' y 'oc' en el PATH de Windows
│  └─ 04-desktop.ps1         # App de escritorio (Scoop) -> conecta a opencode serve
├─ wsl/
│  ├─ provision.sh           # Provisión dentro de Debian (paquetes, opencode, proxy, systemd)
│  ├─ opencode-serve.sh      # Lanzador de 'opencode serve' (API + web UI en /app)
│  ├─ nginx-opencode.conf    # Plantilla del sitio nginx (http)
│  └─ Caddyfile              # Plantilla de Caddy (https con TLS local)
└─ arch/                     # Setup para Arch Linux nativo (ver su sección)
   ├─ install.sh             # Punto de entrada
   ├─ provision.sh           # Instala opencode, proxy, deps GUI y servicio systemd
   ├─ opencode-serve.sh      # Lanzador de 'opencode serve' (API + web UI en /app)
   ├─ desktop.sh             # Opcional: instala opencode-desktop-bin (AUR)
   ├─ nginx-opencode.conf    # Plantilla del sitio nginx (http)
   └─ Caddyfile              # Plantilla de Caddy (https con TLS local)
```

---

## Configuración central: `config/dotfiles.env`

Todo lo ajustable vive aquí. Cámbialo **antes** de instalar:

| Clave | Por defecto | Qué es |
|---|---|---|
| `WSL_DISTRO` | `Debian` | Distribución WSL a usar/instalar. |
| `OPENCODE_WORKDIR` | `code` | Carpeta de trabajo del servidor, en `~/code` (ext4 nativo, rápido). |
| `OPENCODE_SERVE_PORT` | `4096` | Puerto del `opencode serve` (API + web UI en `/app`). El reverse proxy apunta aquí. |
| `OPENCODE_DOMAIN` | `opencode.local` | Dominio local para el navegador. |
| `OPENCODE_SERVER_PASSWORD` | *(vacío)* | Basic Auth opcional (usuario `opencode`). Recomendado si expones el puerto. |
| `OPENCODE_PORT` | `47917` | *(legacy)* Puerto antiguo de `opencode web` por separado. Ya no lo usan ni Arch ni Windows; se mantiene para compatibilidad con setups personalizados. |

---

## Qué hace cada clave del `.wslconfig`

Archivo global de la VM de WSL2 (se copia a `%USERPROFILE%\.wslconfig`). Tras
editarlo: `wsl --shutdown` y reabrir (la "regla de los ~8 s" de Microsoft).

**Sección `[wsl2]`:**

| Clave | Valor | Para qué sirve |
|---|---|---|
| `memory` | `4GB` | RAM máxima de la VM. Por defecto WSL toma el 50% del PC. Súbela a 6-8GB si tienes ≥16GB y usarás Docker. |
| `processors` | `4` | Núcleos lógicos para la VM. |
| `nestedVirtualization` | `true` | Permite VMs/containers anidados (escenarios de Docker/K8s). |
| `guiApplications` | `true` | WSLg: apps Linux con interfaz gráfica. |
| `networkingMode` | `mirrored` | Red en espejo: `localhost` de WSL = `localhost` de Windows (clave para `opencode.local`) y mejor compatibilidad con VPN/Docker. **Requiere Win11 22H2+.** |
| `dnsTunneling` | `true` | Enruta el DNS de WSL a través de Windows (mejor con VPN/redes corporativas). |
| `autoProxy` | `true` | Usa el proxy HTTP de Windows dentro de WSL. |
| `firewall` | `true` | El Firewall de Windows aplica al tráfico de WSL (seguridad). |

**Sección `[experimental]`:**

| Clave | Valor | Para qué sirve |
|---|---|---|
| `autoMemoryReclaim` | `gradual` | Devuelve la RAM no usada lentamente. Útil con Docker, que retiene memoria. *(Debe ir aquí y con valor; el default real es `dropCache`.)* |
| `sparseVhd` | `true` | Los VHDX nuevos se autocompactan: el disco no crece sin control (ideal con Docker). |

> **Corrección respecto al borrador inicial:** `autoMemoryReclaim` **no** va en
> `[wsl2]` ni puede ir sin valor; pertenece a `[experimental]` y requiere
> `gradual` / `dropCache` / `disabled`. Se añadieron `firewall` y `sparseVhd`
> como mejoras para Docker.

---

## Por qué este diseño (rendimiento)

OpenCode es intensivo en I/O de disco (LSP, indexado, lecturas masivas). El
factor de rendimiento más importante es **dónde vive el proyecto**:

- Trabajar sobre `/mnt/c` o `/mnt/d` desde WSL usa el puente 9P Windows↔WSL: es
  **el caso más lento**.
- Por eso el servidor opera en **`~/code`** (filesystem **ext4 nativo** de
  Debian): máximo rendimiento.

Además, el `opencode serve` escucha solo en `127.0.0.1:4096` dentro de WSL; el
dominio público lo expone el reverse proxy. Con `networkingMode=mirrored`, el
navegador de Windows llega a `opencode.local` (y a `localhost:4096`)
directamente, sin configuración extra de red.

---

## Cómo se usa a diario

- `opencode` → abre el TUI de OpenCode dentro de Debian (en `~/code`). Al salir,
  vuelves a Windows automáticamente.
- `oc` → abre una shell de Debian (`exit` regresa a Windows).
- `oc <comando>` → ejecuta un comando en Debian y vuelve. Ej.: `oc git status`.
- **Web** → abre `http://opencode.local/app` en el navegador de Windows. La
  sirve el mismo `opencode-serve` permanente; no hay que lanzar nada aparte.

### Comandos útiles dentro de WSL (`oc`)

```bash
oc systemctl status opencode-serve    # estado del API (servicio permanente)
oc systemctl status nginx             # (o caddy) estado del proxy
oc journalctl -u opencode-serve -e    # logs del API
oc opencode auth login                # configurar el proveedor de IA
oc opencode upgrade                   # actualizar OpenCode
```

---

## Usar la web

Abre **`http://opencode.local/app`** en el navegador de Windows. Caddy, en su
caso: **`https://opencode.local/app`**. La sirve el mismo `opencode-serve` del
systemd, no hay que lanzar nada aparte.

Como el server está fijado por `WorkingDirectory=` a **`~/code`** (dentro de
Debian), la web mostrará los proyectos que tengas en esa carpeta. **Para
añadir proyectos:**

```bash
oc                                       # entra a shell en Debian
git clone <url> ~/code/<nombre>          # clona dentro de ~/code (ext4 nativo)
# o, si el repo ya está en otro sitio fuera de ~/code:
ln -s /mnt/d/repos/foo ~/code/foo        # symlink (sin coste de copia)
```

> **Sobre rendimiento (importante):** un symlink a `/mnt/c` o `/mnt/d` **no
> arregla** el cuello de botella — el server seguirá leyendo NTFS a través
> del puente 9P (5–30× más lento, file watching no fiable). El máximo
> rendimiento es con el repo realmente clonado en `~/code` (ext4 nativo).
> Detalles cuantitativos en la sección [Por qué este diseño (rendimiento)](#por-qué-este-diseño-rendimiento).

**Si necesitas que la web opere sobre OTRA carpeta** (caso raro, p. ej. un
repo concreto en `/mnt/d`), detén el servicio temporalmente y arranca el server
a mano en esa ruta:

```bash
oc
sudo systemctl stop opencode-serve
cd /mnt/d/repos/mi-proyecto
opencode serve --port 4096        # mismo puerto → opencode.local y la app desktop le siguen pegando
```

Cuando termines, `sudo systemctl start opencode-serve` te devuelve al setup
permanente sobre `~/code`.

---

## App de escritorio (Windows)

La app de escritorio se instala en **Windows** (con Scoop) y se conecta al
servidor **`opencode serve`** que corre dentro de **WSL**. Lo hace el paso
`04-desktop.ps1` (el orquestador lo ofrece al final; responde *Sí*).

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\04-desktop.ps1
```

**Cómo se le indica el servidor.** La app NO usa variables de entorno tipo
"host" ni lee fielmente `opencode.jsonc` para esto (lo ignora con frecuencia
y monta su propio server interno llamado `vlocal` en un puerto aleatorio).
**La única vía 100% confiable es añadir el servidor desde la propia UI:**

1. Abre la app.
2. **Configuración → Servidores → `+ Añadir servidor`**.
3. Pega una de estas URLs (cualquiera funciona; ver tabla más abajo):
   - `http://localhost:4096` — **recomendado**, directo al serve.
   - `http://opencode.local` — pasa por nginx (puerto 80 implícito).
   - `https://opencode.local` — Caddy, requiere la CA importada (ver más abajo).
4. **Click en la entrada** para activarla (el punto verde debe estar a su lado).
5. **Cierra la app desde su menú** (Archivo → Salir, o Ctrl+Q). No con `kill -9`,
   porque interrumpe el guardado en Electron y la selección no persiste.
6. Reabre. Debe arrancar conectada al servidor correcto.

**¿Cuál URL conviene?**

| URL | Pasa por proxy | Depende de nginx/Caddy arriba | TLS |
|---|---|---|---|
| `http://localhost:4096` | No | No | No |
| `http://opencode.local` | Sí | Sí | No |
| `https://opencode.local` | Sí | Sí | Sí, con Caddy + CA importada al **trust store del sistema Windows** (la app Electron no usa el del navegador) |

**Para uso normal**, `http://localhost:4096` es lo más robusto: cero dependencias
extra y sigue funcionando aunque pares nginx.

> ⚠️ La variable **`OPENCODE_PORT`** **no** sirve para apuntar a un host remoto:
> si está definida en tu entorno de Windows, la app intentará levantar su **propio
> servidor local** en ese puerto y fallará la conexión. `04-desktop.ps1` te avisa
> si la detecta. Bórrala con `setx OPENCODE_PORT ""` si da problemas.

**Cómo saber si está conectada al server correcto:**

```bash
oc ss -tlnp | grep opencode
```

Debe aparecer **solo un LISTEN en `:4096`**. Si ves un segundo puerto random
(`:43xxx`, `:40xxx`…) ocupado por un proceso `opencode-desktop`, significa
que la app sigue manteniendo su `vlocal` paralelamente. Vuelve a `+ Añadir
servidor`, asegúrate de seleccionar la nueva entrada (punto verde) y elimina
el `Local Server / vlocal` de la lista.

Si la app muestra *"Connection Failed"* o se queda en el splash: arranca WSL una
vez (`oc`) para que `opencode-serve` esté levantado, y revisa la URL del servidor.

---

## Cambiar de proxy o de puerto/dominio después

1. Edita `config/dotfiles.env`.
2. Reejecuta solo la provisión:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\windows\install.ps1 -SkipWslSetup -SkipLaunchers
   ```
   Vuelve a elegir nginx/Caddy. (Si cambiaste el dominio, reejecuta también `01`
   para actualizar el `hosts` de Windows.)

---

## HTTPS con Caddy: confiar en el certificado

Caddy usa una **CA local** (`tls internal`). Para que el navegador de Windows no
muestre advertencia, importa esa CA como entidad de confianza:

```powershell
# Exporta la CA raíz de Caddy desde WSL a Windows
oc sudo cat /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt > $env:USERPROFILE\caddy-root.crt
# Impórtala en "Entidades de certificación raíz de confianza" (PowerShell como Admin)
Import-Certificate -FilePath $env:USERPROFILE\caddy-root.crt -CertStoreLocation Cert:\LocalMachine\Root
```

---

## Solución de problemas

- **`opencode` no se reconoce**: abre una terminal nueva (el PATH se actualiza al
  reabrir).
- **`opencode.local/app` no carga**: comprueba que el server permanente esté
  arriba con `oc systemctl status opencode-serve` (debe decir `active (running)`
  y escuchar en `:4096`). Verifica el proxy con `oc systemctl status nginx` (o
  `caddy`) y la línea `127.0.0.1 opencode.local` en
  `C:\Windows\System32\drivers\etc\hosts`. Recuerda añadir `/app` a la URL.
- **App de escritorio sigue mostrando `vlocal` (puerto random)**: la app no
  guarda nada al iniciar; tienes que añadir el server desde su propia UI
  (`+ Añadir servidor` → `http://localhost:4096`) y cerrarla con su menú (no
  con `kill`) para que persista la elección. Detalles en
  [App de escritorio](#app-de-escritorio-windows).
- **Puerto 80 ocupado en Windows**: descomenta `ignoredPorts=80,443` en
  `.wslconfig`, o cambia de proxy/puerto.
- **Cambios en `.wslconfig` sin efecto**: `wsl --shutdown`, espera ~8 s y reabre.
- **`systemctl` dice que systemd no está activo**: reejecuta `01-setup-wsl.ps1`
  (habilita systemd en `/etc/wsl.conf` y reinicia WSL).

---

## Notas sobre git

Este setup aplica **solo** lo solicitado en WSL:

```bash
git config --global core.fileMode false
git config --global core.autocrlf input
```

Si además vas a editar/commitear el mismo repo desde el git de **Windows**
(p. ej. VSCode nativo sobre `/mnt/...`), considera replicar `autocrlf=input` en
PowerShell y añadir un `.gitattributes` (`* text=auto eol=lf`). Como aquí el
trabajo vive en `~/code` (nativo de WSL), normalmente no hace falta.

---
---

# Arch Linux (nativo)

En Arch es **mucho más simple**: es Linux nativo, así que **no** hay WSL, ni
`.wslconfig`, ni cruce de mundos, ni lanzadores de Windows. systemd ya está
activo y el sistema de archivos es nativo (máximo rendimiento sin trucos).

## Qué hace

1. Instala **OpenCode** con el comando recomendado:
   - `paru -S opencode-bin` (o `yay`), AUR siempre al día, si tienes un *AUR helper*.
   - si no, `sudo pacman -S opencode` (repo oficial *extra*, estable).
2. Instala las **dependencias gráficas** del portapapeles para el TUI:
   `wl-clipboard` (Wayland) o `xclip` (X11), según tu sesión.
3. Levanta el servicio systemd permanente **`opencode-serve`** en `127.0.0.1:4096`.
   Este único proceso expone a la vez el **API REST** (lo usan la app de escritorio,
   los SDK y plugins IDE) y la **web UI** en la ruta `/app`. No hace falta
   `opencode web` aparte.
4. Instala **nginx** *o* **Caddy** con **`http(s)://opencode.local`** apuntando al
   `:4096` del serve (lo eliges; nunca ambos). Abre `http://opencode.local/app`
   en el navegador y ya está.
5. Opcionalmente: `bash arch/desktop.sh` instala la app de escritorio nativa
   (`opencode-desktop-bin` de AUR).

## Instalación

```bash
git clone <url-de-este-repo> ~/opencode-dotfiles
cd ~/opencode-dotfiles
bash arch/install.sh
```

Se te preguntará el reverse proxy (nginx por defecto, o Caddy para https).
Ejecútalo como **tu usuario normal** (no root); pedirá `sudo` cuando haga falta.

> Usa la misma `config/dotfiles.env` que Windows (puerto del serve, dominio, etc.).
> Se ignoran `WSL_DISTRO` (no aplica en Arch nativo) y `OPENCODE_PORT` (es legacy
> del flujo viejo con `opencode web` como proceso separado; tanto Arch como
> Windows ahora unifican todo en `opencode serve`).

## Por qué un solo `opencode serve` (y no `serve` + `web` por separado)

A diferencia del setup WSL, en Arch nativo todo corre en la misma máquina, y el
binario `opencode serve` ya **sirve también la web UI** en la ruta `/app` además
del API. Un único proceso atiende los tres clientes:

| Cliente | A dónde se conecta |
|---|---|
| Navegador (web UI) | `http://opencode.local/` → proxy → `127.0.0.1:4096/app` |
| App de escritorio (`opencode-desktop`) | `http://127.0.0.1:4096` (API) |
| TUI / SDK / plugins IDE | `http://127.0.0.1:4096` (API) |

Es **menos memoria** (~300 MB vs ~600 MB con dos servers), **menos LSPs duplicados**
y elimina el problema de sesiones desincronizadas entre web y app desktop.

El trade-off: el `WorkingDirectory` del systemd está fijado a `~/code`, así que la
web mostrará por defecto proyectos dentro de esa carpeta (puedes symlinkear los que
estén en otro sitio). El TUI, en cambio, lo lanzas en cualquier carpeta y trabaja ahí.

## Uso diario (Arch)

```bash
opencode                              # TUI, ejecútalo en la carpeta del proyecto
opencode auth login                   # configurar proveedor de IA (paso obligatorio)
systemctl status opencode-serve       # ver estado del server
journalctl -u opencode-serve -e       # logs del server
opencode upgrade                      # actualizar (o: paru -S opencode-bin)
```

**Web:** abre el navegador en `http://opencode.local/app` (o `https://...` con
Caddy). Si prefieres directo sin proxy: `http://localhost:4096/app`.

### Configurar la app de escritorio (Arch)

Después de instalarla con `bash arch/desktop.sh`, la app arranca con un servidor
interno propio (`vlocal`, puerto aleatorio). Para que use tu `opencode-serve`
permanente, **añádelo desde la propia UI** — es la única vía 100% confiable
(la app no lee fiablemente `opencode.jsonc` para esto).

1. Abre la app.
2. **Configuración → Servidores → `+ Añadir servidor`**.
3. Pega una de estas URLs (cualquiera funciona):
   - `http://127.0.0.1:4096` — **recomendado**, directo al serve.
   - `http://opencode.local` — pasa por nginx (puerto 80 implícito).
   - `https://opencode.local` — Caddy. Requiere importar la CA al **trust store
     del sistema** (no solo del navegador): `sudo trust anchor /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt && sudo update-ca-trust`.
4. **Click en la nueva entrada** para activarla (punto verde a su lado).
5. Elimina `vlocal` de la lista si quieres limpieza.
6. **Cierra la app desde su menú** (Archivo → Salir, o Ctrl+Q), **no** con
   `kill -9` — Electron interrumpe el guardado y la elección no persiste.
7. Reabre. Debe arrancar conectada directamente.

**Comparación de URLs para la app de escritorio:**

| URL | Pasa por proxy | Depende de nginx/Caddy arriba | TLS |
|---|---|---|---|
| `http://127.0.0.1:4096` | No | No | No |
| `http://opencode.local` | Sí | Sí | No |
| `https://opencode.local` | Sí | Sí | Sí, con Caddy + CA en el trust store del sistema |

Para uso normal, `http://127.0.0.1:4096` es lo más robusto. El dominio solo
aporta si quieres TLS o una URL bonita; para la app, no añade nada real.

**Verifica que está conectada al server correcto:**

```bash
ss -tlnp | grep opencode
```

Debe aparecer **solo un LISTEN en `:4096`**. Si ves un segundo puerto random
(`:43xxx`, `:40xxx`…) propiedad de un proceso `opencode-desktop`, la app sigue
manteniendo su `vlocal`. Repite los pasos asegurándote de seleccionar la nueva
entrada y eliminar el `vlocal`.

## Solución de problemas (Arch)

- **`opencode.local` no carga**: el server permanente debe estar arriba —
  `systemctl status opencode-serve` (debe decir `active (running)` y escuchar en
  `:4096`). Verifica también el proxy con `systemctl status nginx` (o `caddy`) y
  la línea `127.0.0.1 opencode.local` en `/etc/hosts`. Recuerda añadir `/app` a
  la URL: `http://opencode.local/app`.
- **nginx no toma el sitio**: en Arch, `nginx.conf` no incluye `conf.d` por
  defecto; el provision añade ese `include` (con backup). Verifica `nginx -t`.
- **App de escritorio sigue mostrando `vlocal` (puerto random)**: la app no usa
  `opencode.jsonc`. Añade el server desde su propia UI (`+ Añadir servidor` →
  `http://127.0.0.1:4096`) y ciérrala con su menú (no con `kill -9`) para que
  persista la elección.
- **HTTPS con Caddy**: la CA local está en
  `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`. Impórtala
  en tu navegador para evitar el aviso de certificado.

---
---

# Skills y configuración global (paso opcional, válido para Arch y WSL)

Hasta aquí el setup base te deja `opencode serve` corriendo permanente con la
web UI y la API. Este paso añade lo que hace falta para que el agente tenga,
**de fábrica**, las capacidades que Claude trae en su chat: crear/editar Word,
PDF, PPT y Excel; arte generativo; testing E2E; MCPs útiles (Context7,
Playwright, GitHub opcional); búsqueda web; y un set de permisos balanceado.

Funciona idéntico en **Arch nativo** y **WSL**.

## Requisitos

- **Node 20+** (recomendado 22+). El setup verifica al arrancar.
- **Python 3.10+** (recomendado 3.12+). En Arch, el Python global está
  *externally-managed* — por eso usamos venv aislado (no pisa nada).
- **~3 GB libres** en disco:
  - LibreOffice still: ~1 GB
  - Chromium (Playwright): ~300 MB
  - Skills + venvs + node_modules aislado: ~500 MB
  - Resto de binarios (poppler, qpdf, tesseract, pandoc, ghostscript, imagemagick, ffmpeg): ~500 MB

## Instalación

**Arch nativo:**
```bash
cd /home/joel/git/opencode-dotfiles
bash arch/skills.sh
```

**WSL:**
```bash
oc bash ~/opencode-dotfiles/wsl/skills.sh
```

El script es **idempotente**: puedes reejecutarlo cuando quieras (actualiza
skills con `git pull --ff-only` y reinstala deps Python/Node solo si hace falta).

## Qué hace, paso a paso

1. **Binarios del sistema** (pacman/apt): LibreOffice (still), poppler, qpdf,
   tesseract, pandoc, ghostscript, imagemagick, ffmpeg, jq, rsync.
2. **Clona los 17 skills** de `anthropics/skills` a `~/.config/opencode/skills/`:
   - **Documentos:** `docx`, `pdf`, `pptx`, `xlsx`
   - **Diseño/Arte:** `algorithmic-art`, `brand-guidelines`, `canvas-design`,
     `theme-factory`, `slack-gif-creator`
   - **Frontend:** `frontend-design`, `web-artifacts-builder`
   - **Testing:** `webapp-testing` (Playwright Python)
   - **Comunicación:** `internal-comms`, `doc-coauthoring`, `claude-api`
   - **Meta:** `skill-creator`, `mcp-builder`
3. **venv Python aislado** en `~/.venvs/opencode-skills` con: `python-docx`,
   `openpyxl`, `pandas`, `pypdf`, `pdfplumber`, `reportlab`, `pytesseract`,
   `pdf2image`, `markitdown[all]`, `Pillow`, `beautifulsoup4`, `markdown`,
   `playwright`, `fastmcp`, `mcp`, `json5`.
4. **Chromium para Playwright** (~300 MB) en `~/.cache/ms-playwright/`.
5. **node_modules aislado** en `~/.opencode-skills/node/` con: `docx`,
   `pptxgenjs`, `@modelcontextprotocol/sdk`.
6. **Genera** `~/.config/opencode/opencode.jsonc` con MCP (Context7,
   Playwright) y permisos balanceados. Si ya tenías config, **se mergea**
   profundo y se hace backup (no se pisa nada de tu `server`/preferencias).
7. **Genera** `~/.config/opencode/AGENTS.md` con reglas globales (usar
   Context7 para docs, skills para Office, web search via Exa, idioma español).
8. **Hook al shell**: añade una función `opencode()` a `~/.zshrc` (y
   `~/.bashrc` si existe) que inyecta los paths aislados solo en esa
   invocación. **No contamina tu shell normal**.
9. **Reinicia `opencode-serve`** para que el systemd también cargue el venv
   y los módulos Node aislados.
10. **Smoke test** automático al final.

## Aislamiento — por qué no rompe tus otros proyectos

- **Python**: las libs viven en `~/.venvs/opencode-skills`, no en el Python
  global ni en `~/.local`. Tus otros venvs/proyectos no las ven.
- **Node**: las libs viven en `~/.opencode-skills/node`, no en `npm -g`.
  `NODE_PATH` actúa como **fallback** (Node prefiere `./node_modules` local),
  así que tus repos resuelven sus propias deps sin interferencia.
- **Shell**: la función `opencode()` usa un subshell `( ... )` para exportar
  las variables; al volver tu shell queda como antes. Si ejecutas `node` o
  `python` por fuera de `opencode`, ves tu entorno normal.

## Tokens opcionales (mejoran funcionalidades, no son obligatorios)

Hay **un solo lugar recomendado** para meterlos: tu `~/.zshrc` (o `~/.bashrc`)
o un archivo dedicado `~/.opencode-env` que sourceas desde el rc. La
función `opencode()` que añade `skills.sh` los hereda automáticamente.

```bash
# === EXA (web search) ===
# NO necesita API key. El flag OPENCODE_ENABLE_EXA=1 ya lo activa contra
# el MCP hosted de Exa AI sin autenticación. skills.sh ya lo exporta en
# ~/.config/opencode/skills-env.sh, no tienes que hacer nada más.

# === Context7 (docs de librerías) ===
# Funciona SIN key (rate-limit modesto). Si quieres más rate-limit, crea
# cuenta gratis en https://context7.com → Dashboard → genera una API key
# y exportala (también descomenta el bloque `headers` en opencode.jsonc):
export CONTEXT7_API_KEY=...

# === GitHub MCP ===
# Solo si decides activar el MCP (ver siguiente sección). Genera un PAT en
# https://github.com/settings/tokens (scopes mínimos: repo, read:org, gist).
export GITHUB_TOKEN=ghp_...
```

## Activar el MCP de GitHub (opcional)

El GitHub MCP **infla bastante el contexto** (muchas tools). Por eso queda
**comentado** en el opencode.jsonc por defecto. Si lo quieres:

1. Edita `~/.config/opencode/opencode.jsonc` y descomenta el bloque
   `"github": {...}`.
2. Exporta `GITHUB_TOKEN`.
3. Para reducir el impacto, considera deshabilitarlo en sesiones normales y
   activarlo solo en agentes específicos con `"tools": { "github_*": true }`
   en ese agente.

**Alternativa cero-overhead** (recomendada para la mayoría): déjalo comentado
y deja que el agente use `gh` por bash (`gh pr view`, `gh issue list`,
`gh search code`). El `AGENTS.md` global ya recomienda este enfoque.

## Estructura de permisos balanceada

El `opencode.jsonc` que se genera trae un bloque `permission` con esta
filosofía: **el último patrón que coincide gana**, así que los denies van
primero (irreversibles), el catch-all `"ask"` en medio, y los allows
específicos al final.

- **Denies duros** (siempre bloqueados): `sudo`, `rm -rf`, `mkfs`,
  `dd if=/of=/dev/*`, `shutdown`, `reboot`, pipes `curl|sh`, `chmod -R 777`.
- **Allows seguros**: lectura (`ls`, `cat`, `rg`, `grep`, `find`...), git no
  destructivo, runtimes (`python`, `node`, `go run`, `cargo build`...),
  scripts de proyecto (`npm run`, `npm test`, etc.), manipulación no
  destructiva (`mkdir`, `cp`, `mv`, `touch`), toolchain de skills (`soffice`,
  `pdftoppm`, `pandoc`, `convert`, `ffmpeg`...).
- **`pip install` y `npm install` quedan en `ask`** intencionalmente — te
  avisa antes de instalar paquetes (riesgo de typosquatting/malware). Cuando
  OpenCode te pregunte, elige "Always" en esa sesión si confías.
- **`.env`, claves SSH (`id_rsa`, `id_ed25519`), `*.pem`, `secrets/`**
  bloqueados en `read`.

Puedes editar `~/.config/opencode/opencode.jsonc` para ajustar a tu gusto;
el script no lo vuelve a pisar mientras tenga la sentinela.

## Verificación

```bash
bash config/skills-smoke-test.sh
```

Imprime OK/MISS por cada componente: imports Python, requires Node, binarios
del sistema, presencia de los 17 skills, validez del `opencode.jsonc`, hook
en el shell, `opencode-serve` activo y MCP de Context7 alcanzable.

Exit code = número de fallos (0 si todo OK).

## Desinstalación limpia

```bash
# 1. Quitar aislamientos
rm -rf ~/.venvs/opencode-skills ~/.opencode-skills

# 2. Quitar skills clonados (NO borra tu config ni tus sesiones)
rm -rf ~/.config/opencode/skills

# 3. (Opcional) Restaurar el opencode.jsonc previo — backups con timestamp:
ls ~/.config/opencode/opencode.jsonc.bak-*
# elige uno y: cp <bak> ~/.config/opencode/opencode.jsonc

# 4. (Opcional) Quitar el hook del .zshrc / .bashrc:
#    busca y elimina el bloque entre las sentinelas:
#    # >>> opencode-dotfiles skills env >>>
#    # <<< opencode-dotfiles skills env <<<

# 5. Reejecutar provision base para reponer el opencode-serve.sh "limpio":
bash arch/install.sh   # o el equivalente WSL
```

Los binarios del sistema (LibreOffice, etc.) los puedes dejar — no estorban.
Si quieres quitarlos: `sudo pacman -Rs libreoffice-still poppler ...`.

## Solución de problemas (skills)

- **`bash arch/skills.sh` aborta por `python venv create`**: en Arch falta el
  paquete `python` (deberías tenerlo); en Debian/WSL es `python3-venv`.
- **`playwright install chromium` cuelga**: red lenta — son ~300 MB. Si la
  ejecución se interrumpe, reejecuta `skills.sh` (es idempotente).
- **`tesseract-data-eng` no existe en Arch**: el script lo detecta y sigue
  sin él; tesseract base trae el OCR de inglés en muchos casos.
- **Smoke test falla en `python imports`**: probablemente el `pip install`
  no completó. Reejecuta `skills.sh` y mira la salida del Step 3.
- **Smoke test falla en `node requires`**: ídem para Step 5. Verifica con
  `ls ~/.opencode-skills/node/node_modules/`.
- **El TUI nuevo no carga los skills**: cierra y abre una terminal nueva
  (para cargar el hook del `.zshrc`). O simplemente `source ~/.zshrc`.
- **El systemd `opencode-serve` no encuentra los skills**: confirma que
  `~/.config/opencode/skills-env.sh` existe y que `opencode-serve.sh` en
  `~/.config/opencode-dotfiles/` tiene el `source` (el `skills.sh` lo
  re-copia automáticamente).
