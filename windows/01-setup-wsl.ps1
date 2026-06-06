#requires -Version 5.1
# 01-setup-wsl.ps1 - Instala/configura WSL2 + Debian, copia .wslconfig,
# habilita systemd dentro de Debian y registra el dominio en el hosts de Windows.
# REQUIERE Administrador.
. "$PSScriptRoot\common.ps1"
Assert-Admin

$repo    = Get-RepoRoot
$cfg     = Read-DotEnv (Join-Path $repo 'config\dotfiles.env')
$distro  = $cfg['WSL_DISTRO']
$domain  = $cfg['OPENCODE_DOMAIN']

Write-Step "1/3 - Configurando WSL2 + $distro"

# --- .wslconfig (global de la VM) ---
$src = Join-Path $PSScriptRoot '.wslconfig'
$dst = Join-Path $env:USERPROFILE '.wslconfig'
if (Test-Path -LiteralPath $dst) {
    $bak = "$dst.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item -LiteralPath $dst -Destination $bak -Force
    Write-Note "Ya existia .wslconfig; respaldado en $bak"
}
Copy-Item -LiteralPath $src -Destination $dst -Force
Write-Ok "Copiado .wslconfig -> $dst"

# --- WSL presente? ---
$wslOk = $true
try { wsl --status | Out-Null; if ($LASTEXITCODE -ne 0) { $wslOk = $false } } catch { $wslOk = $false }
if (-not $wslOk) {
    Write-Step "Instalando WSL (sin distro)"
    wsl --install --no-distribution
    Write-Note "Si es la primera instalacion de WSL, REINICIA Windows y vuelve a ejecutar install.ps1"
}

Write-Step "Actualizando el motor de WSL"
wsl --update
wsl --set-default-version 2 | Out-Null

# --- Debian presente? ---
if (Test-WslDistro -Distro $distro) {
    Write-Note "$distro ya esta instalada."
    Write-Host "    [U] Usar la instalacion actual (por defecto)"
    Write-Host "    [R] Reinstalar LIMPIO (BORRA todo lo que haya en $distro)"
    $ans = Read-Host "Elige U/R [U]"
    if ($ans -match '^[Rr]') {
        $confirm = Read-Host "Esto ELIMINA $distro y todos sus datos. Escribe BORRAR para confirmar"
        if ($confirm -ceq 'BORRAR') {
            wsl --unregister $distro
            Write-Ok "$distro eliminada. Reinstalando limpio..."
            wsl --install -d $distro
            Write-Note "Se abrira $distro para crear tu usuario y contrasena de Linux."
            Read-Host "Cuando termines de crear el usuario, pulsa Enter para continuar"
        } else {
            Write-Note "Confirmacion incorrecta: se conserva la instalacion actual."
        }
    } else {
        Write-Ok "Se usara la instalacion actual de $distro."
    }
} else {
    Write-Step "Instalando $distro"
    wsl --install -d $distro
    Write-Note "Se abrira $distro para crear tu usuario y contrasena de Linux."
    Read-Host "Cuando termines de crear el usuario, pulsa Enter para continuar"
}

# --- Debian como distro por defecto ---
wsl --set-default $distro
Write-Ok "$distro establecida como distro por defecto"

# --- Habilitar systemd dentro de Debian (necesario para los servicios) ---
Write-Step "Habilitando systemd en $distro (/etc/wsl.conf)"
wsl -d $distro -u root -- bash -c "printf '[boot]\nsystemd=true\n' > /etc/wsl.conf"
Write-Ok "systemd habilitado"

# --- hosts de Windows: dominio -> 127.0.0.1 (para el navegador de Windows) ---
Write-Step "Registrando $domain en el hosts de Windows"
$hosts = Join-Path $env:WINDIR 'System32\drivers\etc\hosts'
$already = $false
try { $already = [bool](Select-String -Path $hosts -SimpleMatch $domain -Quiet) } catch { $already = $false }
if (-not $already) {
    Add-Content -LiteralPath $hosts -Value "127.0.0.1`t$domain"
    Write-Ok "Anadido: 127.0.0.1 $domain"
} else {
    Write-Ok "El hosts ya contenia $domain"
}

# --- Reiniciar WSL para aplicar .wslconfig + systemd (regla de los ~8s) ---
Write-Step "Reiniciando WSL para aplicar la configuracion"
wsl --shutdown
Start-Sleep -Seconds 9
Write-Ok "Paso 1 completado"
