#requires -Version 5.1
<#
  install.ps1 - Orquesta TODA la instalacion de opencode-dotfiles en Windows.
  Ejecuta en orden:
    01-setup-wsl.ps1   WSL2 + Debian + .wslconfig + systemd + hosts   [requiere Admin]
    02-provision.ps1   paquetes, opencode, git, proxy y servicio (dentro de Debian)
    03-launchers.ps1   atajos 'opencode' y 'oc' en el PATH de Windows

  Uso (terminal normal; se auto-eleva a Administrador con UAC):
    powershell -ExecutionPolicy Bypass -File .\windows\install.ps1

  04-desktop.ps1     instala la app de escritorio (Scoop) y la apunta a WSL

  Flags para reejecutar pasos sueltos:
    -SkipWslSetup  -SkipProvision  -SkipLaunchers  -SkipDesktop
#>
param(
    [switch]$SkipWslSetup,
    [switch]$SkipProvision,
    [switch]$SkipLaunchers,
    [switch]$SkipDesktop
)
. "$PSScriptRoot\common.ps1"

$repo = Get-RepoRoot
Write-Host "opencode-dotfiles - instalacion" -ForegroundColor Magenta
Write-Host "Repositorio: $repo"

# El paso 1 (instalar WSL / editar el hosts) requiere Administrador, pero los
# pasos 2-4 deben ir SIN privilegios (Scoop no debe instalarse como admin).
# Por eso se eleva UNICAMENTE el paso 1, en su propia ventana, y se espera.
if (-not $SkipWslSetup) {
    if (Test-Admin) {
        & "$PSScriptRoot\01-setup-wsl.ps1"
    } else {
        Write-Note "El paso 1 requiere Administrador: se abrira una ventana elevada (UAC)."
        $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSScriptRoot\01-setup-wsl.ps1`"")
        if ($p.ExitCode -ne 0) {
            throw "El paso 1 fallo (codigo $($p.ExitCode)). Revisa la ventana elevada y reintenta."
        }
    }
}

if (-not $SkipProvision) { & "$PSScriptRoot\02-provision.ps1" }
if (-not $SkipLaunchers) { & "$PSScriptRoot\03-launchers.ps1" }

# La app de escritorio es opcional: se pregunta (a menos que se use -SkipDesktop).
if (-not $SkipDesktop) {
    $d = Read-Host "`nInstalar la APP DE ESCRITORIO de OpenCode (Scoop)? [S/n]"
    if ($d -notmatch '^[Nn]') { & "$PSScriptRoot\04-desktop.ps1" }
    else { Write-Note "App de escritorio omitida." }
}

$cfg = Read-DotEnv (Join-Path $repo 'config\dotfiles.env')
Write-Step "Instalacion completada"
Write-Host "  1) Abre una terminal NUEVA (para que tome el PATH)." -ForegroundColor Green
Write-Host "  2) Ejecuta:  opencode        (abre el TUI dentro de Debian)" -ForegroundColor Green
Write-Host "  3) Navegador:  http(s)://$($cfg['OPENCODE_DOMAIN'])" -ForegroundColor Green
Write-Host "  4) App de escritorio:  conecta a http://localhost:$($cfg['OPENCODE_SERVE_PORT'])" -ForegroundColor Green
Write-Host ""
Read-Host "Pulsa Enter para cerrar esta ventana"
