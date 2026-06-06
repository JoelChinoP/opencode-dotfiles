#requires -Version 5.1
# 02-provision.ps1 - Copia la config y los scripts a la home de Debian,
# normaliza finales de linea (CRLF->LF) y ejecuta provision.sh DENTRO de Debian.
. "$PSScriptRoot\common.ps1"

$repo   = Get-RepoRoot
$cfg    = Read-DotEnv (Join-Path $repo 'config\dotfiles.env')
$distro = $cfg['WSL_DISTRO']

Write-Step "2/3 - Aprovisionando $distro (paquetes, opencode, git, proxy, servicio)"

if (-not (Test-WslDistro -Distro $distro)) {
    throw "$distro no esta instalada. Ejecuta primero 01-setup-wsl.ps1"
}

$repoWsl = ConvertTo-WslPath -WinPath $repo -Distro $distro
Write-Ok "Repo visible en WSL como: $repoWsl"

# Comando bash: copiar -> normalizar CRLF -> dar permisos -> ejecutar provision.sh
# (`$VAR y `$( ) van con backtick = literales para bash; $repoWsl lo interpola PowerShell)
$bash = @"
set -e
DEST="`$HOME/.config/opencode-dotfiles"
mkdir -p "`$DEST"
cp -f "$repoWsl/config/dotfiles.env" "`$DEST/"
cp -f "$repoWsl/wsl/"*.sh   "`$DEST/" 2>/dev/null || true
cp -f "$repoWsl/wsl/"*.conf "`$DEST/" 2>/dev/null || true
cp -f "$repoWsl/wsl/Caddyfile" "`$DEST/" 2>/dev/null || true
find "`$DEST" -type f -exec sed -i 's/\r`$//' {} +
chmod +x "`$DEST/"*.sh
bash "`$DEST/provision.sh"
"@

wsl -d $distro -- bash -lc $bash
if ($LASTEXITCODE -ne 0) { throw "provision.sh fallo (codigo $LASTEXITCODE)" }
Write-Ok "Paso 2 completado"
