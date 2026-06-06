#requires -Version 5.1
<#
  install.ps1 - Orquesta TODA la instalacion de opencode-dotfiles en Windows.
  Ejecuta en orden:
    01-setup-wsl.ps1   WSL2 + Debian + .wslconfig + systemd + hosts   [requiere Admin]
    02-provision.ps1   paquetes, opencode, git, proxy y servicio (dentro de Debian)
    03-launchers.ps1   atajos 'opencode' y 'oc' en el PATH de Windows

  Uso (terminal normal; se auto-eleva a Administrador con UAC):
    powershell -ExecutionPolicy Bypass -File .\windows\install.ps1

  Flags para reejecutar pasos sueltos:
    -SkipWslSetup  -SkipProvision  -SkipLaunchers
#>
param(
    [switch]$SkipWslSetup,
    [switch]$SkipProvision,
    [switch]$SkipLaunchers
)
. "$PSScriptRoot\common.ps1"

# --- Auto-elevacion: 01 (instalar WSL / editar hosts) requiere Administrador ---
if (-not (Test-Admin)) {
    Write-Host "Se necesita Administrador. Elevando con UAC..." -ForegroundColor Yellow
    $a = @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    if ($SkipWslSetup)  { $a += '-SkipWslSetup' }
    if ($SkipProvision) { $a += '-SkipProvision' }
    if ($SkipLaunchers) { $a += '-SkipLaunchers' }
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $a
    return
}

$repo = Get-RepoRoot
Write-Host "opencode-dotfiles - instalacion" -ForegroundColor Magenta
Write-Host "Repositorio: $repo"

if (-not $SkipWslSetup)  { & "$PSScriptRoot\01-setup-wsl.ps1" }
if (-not $SkipProvision) { & "$PSScriptRoot\02-provision.ps1" }
if (-not $SkipLaunchers) { & "$PSScriptRoot\03-launchers.ps1" }

$cfg = Read-DotEnv (Join-Path $repo 'config\dotfiles.env')
Write-Step "Instalacion completada"
Write-Host "  1) Abre una terminal NUEVA (para que tome el PATH)." -ForegroundColor Green
Write-Host "  2) Ejecuta:  opencode        (abre el TUI dentro de Debian)" -ForegroundColor Green
Write-Host "  3) En el navegador:  http(s)://$($cfg['OPENCODE_DOMAIN'])" -ForegroundColor Green
Write-Host ""
Read-Host "Pulsa Enter para cerrar esta ventana"
