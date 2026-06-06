# opencode-dotfiles

Instalación y configuración automatizada de **OpenCode** en **Windows** mediante
**WSL2 + Debian**, optimizada para máxima compatibilidad y mínima pérdida de
rendimiento, con `opencode web` publicado tras un dominio local
(`http://opencode.local`) vía **nginx** o **Caddy**.

> Basado en la documentación oficial de OpenCode (recomienda WSL en Windows por
> "better file system performance, full terminal support, and compatibility")
> y en la documentación oficial de Microsoft para `.wslconfig`.

---

## ¿Qué hace este setup?

1. **Instala/configura WSL2** y la distro **Debian** (la deja como predeterminada).
2. Aplica un **`.wslconfig`** optimizado para OpenCode + Docker.
3. Dentro de Debian instala **nano, git, curl** y **OpenCode**.
4. Aplica la configuración de git pedida:
   `core.fileMode=false` y `core.autocrlf=input`.
5. Levanta **`opencode web`** como **servicio systemd** que arranca solo con la distro.
6. Publica ese servidor tras **`http(s)://opencode.local`** con **nginx** *o* **Caddy**
   (lo eliges en la instalación; nunca ambos, para no malgastar recursos).
7. Crea atajos **`opencode`** y **`oc`** en el PATH de Windows: corren dentro de
   Debian y vuelven a Windows al terminar (no escribes `wsl` cada vez).

Alcance: cubre desde cero hasta poder **lanzar OpenCode** y abrir su web. No
configura el proveedor de IA (eso se hace luego con `opencode auth login`).

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
│  └─ dotfiles.env            # Configuración central editable (distro, puerto, dominio...)
├─ windows/
│  ├─ .wslconfig             # Plantilla -> %USERPROFILE%\.wslconfig (ajustes de la VM)
│  ├─ common.ps1             # Utilidades compartidas
│  ├─ install.ps1            # Orquestador (auto-eleva) -> 01, 02, 03
│  ├─ 01-setup-wsl.ps1       # WSL2 + Debian + .wslconfig + systemd + hosts   [Admin]
│  ├─ 02-provision.ps1       # Copia y ejecuta provision.sh dentro de Debian
│  └─ 03-launchers.ps1       # Atajos 'opencode' y 'oc' en el PATH de Windows
└─ wsl/
   ├─ provision.sh           # Provisión dentro de Debian (paquetes, opencode, proxy, systemd)
   ├─ opencode-web.sh        # Lanzador de 'opencode web' (lo usa el servicio systemd)
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
- Navegador → `http://opencode.local` (o `https://` si elegiste Caddy).

El servicio `opencode web` arranca solo cuando la distro inicia (systemd).

### Comandos útiles dentro de WSL (`oc`)

```bash
oc systemctl status opencode-web      # estado del servidor web
oc systemctl status nginx             # (o caddy)
oc journalctl -u opencode-web -e      # logs del servidor
oc opencode auth login                # configurar el proveedor de IA
oc opencode upgrade                   # actualizar OpenCode
```

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
- **`opencode.local` no carga**: comprueba `oc systemctl status opencode-web` y el
  proxy; confirma la línea `127.0.0.1 opencode.local` en
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
