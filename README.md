# opencode-dotfiles

Instalación y configuración automatizada de **OpenCode** en **Windows**
(vía **WSL2 + Debian**) y en **Arch Linux** (nativo), optimizada para máxima
compatibilidad y mínima pérdida de rendimiento. Publica `opencode web` tras un
dominio local (`http://opencode.local`) vía **nginx** o **Caddy**, expone el API
(`opencode serve`) para la **app de escritorio**, y deja todo como servicios
**systemd** que arrancan solos.

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
   - **`opencode serve`** → el **API** al que se conecta la **app de escritorio**.
   - La **interfaz web** (`opencode web`) **no** corre como servicio: se usa
     **bajo demanda** (ver [Usar la web y añadir proyectos](#usar-la-web-y-añadir-proyectos)).
6. Instala **nginx** *o* **Caddy** (lo eliges; nunca ambos) con el dominio
   **`http(s)://opencode.local`** apuntando al puerto de la web, listo para cuando
   la lances bajo demanda en ese puerto.
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
│  ├─ opencode-web.sh        # Lanzador de 'opencode web' (uso bajo demanda)
│  ├─ opencode-serve.sh      # Lanzador de 'opencode serve' API (servicio systemd)
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
| `OPENCODE_PORT` | `47917` | Puerto interno (poco usado) de `opencode web`, solo en `127.0.0.1`. |
| `OPENCODE_SERVE_PORT` | `4096` | Puerto del API `opencode serve` para la **app de escritorio**/SDK. |
| `OPENCODE_DOMAIN` | `opencode.local` | Dominio local para el navegador. |
| `OPENCODE_SERVER_PASSWORD` | *(vacío)* | Basic Auth opcional (usuario `opencode`). Recomendado si expones el puerto. |

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

Además, `opencode web` escucha solo en `127.0.0.1:OPENCODE_PORT`; el dominio
público lo expone el reverse proxy. Con `networkingMode=mirrored`, el navegador
de Windows llega a `opencode.local` sin configuración extra de red.

---

## Cómo se usa a diario

- `opencode` → abre el TUI de OpenCode dentro de Debian (en `~/code`). Al salir,
  vuelves a Windows automáticamente.
- `oc` → abre una shell de Debian (`exit` regresa a Windows).
- `oc <comando>` → ejecuta un comando en Debian y vuelve. Ej.: `oc git status`.
- **Web** → bajo demanda (ver abajo). El único servicio permanente es
  `opencode serve` (para la app de escritorio).

### Comandos útiles dentro de WSL (`oc`)

```bash
oc systemctl status opencode-serve    # estado del API (servicio permanente)
oc systemctl status nginx             # (o caddy) estado del proxy
oc journalctl -u opencode-serve -e    # logs del API
oc opencode auth login                # configurar el proveedor de IA
oc opencode upgrade                   # actualizar OpenCode
```

---

## Usar la web y añadir proyectos

A diferencia de la app de escritorio (que tiene un explorador de carpetas nativo),
**la web no puede "buscar y añadir" un directorio desde el navegador**: un navegador
no puede abrir el explorador de archivos del sistema ni recorrer el filesystem del
servidor. Por eso **`opencode web` se ancla al directorio donde lo ejecutas**.

Como consecuencia, **`opencode web` ya no corre como servicio permanente**. Para
trabajar un proyecto en la web, lo **lanzas en su carpeta**:

```powershell
# Desde Windows, en la carpeta del proyecto que quieras abrir:
#   - en el puerto fijo, para acceder por el dominio bonito:
oc opencode web --port 47917         # luego abre  http(s)://opencode.local
#   - o sin puerto fijo: opencode elige uno y abre el navegador directamente:
oc opencode web
```

> El `47917` es tu `OPENCODE_PORT`. Solo cuando la web corre en ese puerto, el
> proxy `opencode.local` la sirve; si usas `opencode web` a secas, accede por el
> `localhost:<puerto>` que abra OpenCode.

**Para "cambiar de proyecto" = ejecutar el comando en otra carpeta.** Dentro de
WSL puedes ir a cualquier ruta y lanzarlo, por ejemplo:

```bash
oc                                   # abre shell en Debian
cd ~/code/otro-proyecto              # o:  cd /mnt/d/repos/mi-proyecto
opencode web --port 47917            # sirve ESE proyecto en opencode.local
```

Recuerda que el mejor rendimiento es con proyectos dentro de `~/code` (ext4 nativo).
El **API** (`opencode serve`) sí queda siempre activo para la app de escritorio;
ese también opera sobre `~/code` por defecto.

---

## App de escritorio (Windows)

La app de escritorio se instala en **Windows** (con Scoop) y se conecta al
servidor **`opencode serve`** que corre dentro de **WSL**. Lo hace el paso
`04-desktop.ps1` (el orquestador lo ofrece al final; responde *Sí*).

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\04-desktop.ps1
```

**Cómo se le indica el servidor (importante).** Contrario a la creencia común,
**no** se hace con una variable de entorno de "host". Los métodos oficiales son:

1. **Archivo `opencode.jsonc`** (lo que automatiza este repo). Se crea en
   `%USERPROFILE%\.config\opencode\opencode.jsonc` con una sección `server`:
   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "server": { "hostname": "127.0.0.1", "port": 4096 }
   }
   ```
   Con `networkingMode=mirrored`, `127.0.0.1:4096` de Windows = el `opencode serve`
   de WSL.
2. **Ajuste in-app**: en la pantalla *Home*, clic en el nombre del servidor (con
   el punto de estado) → *Server picker* → fijas la URL `http://localhost:4096`.

> ⚠️ La variable **`OPENCODE_PORT`** **no** sirve para apuntar a un host remoto:
> si está definida en tu entorno de Windows, la app intentará levantar su **propio
> servidor local** en ese puerto y fallará la conexión. `04-desktop.ps1` te avisa
> si la detecta. Bórrala con `setx OPENCODE_PORT ""` si da problemas.

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
- **`opencode.local` no carga**: la web es **bajo demanda** — debe estar corriendo
  `oc opencode web --port 47917`. Comprueba el proxy con `oc systemctl status nginx`
  (o `caddy`) y la línea `127.0.0.1 opencode.local` en
  `C:\Windows\System32\drivers\etc\hosts`.
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
> En Arch se ignoran `WSL_DISTRO` y `OPENCODE_PORT` (solo aplican al setup WSL,
> donde la web sí corre como proceso aparte).

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

**App de escritorio:** tras instalarla con `bash arch/desktop.sh`, abre la app y
en `Configuración → Servidores → + Añadir servidor` pon `http://127.0.0.1:4096`
y selecciónalo (la app NO lee `opencode.jsonc` para esto; el `+` de la UI es la
única vía oficial).

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
