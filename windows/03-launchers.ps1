#requires -Version 5.1
# 03-launchers.ps1 - Crea atajos en el PATH de Windows para no escribir "wsl" siempre:
#   opencode  -> abre el TUI de OpenCode dentro de Debian (y al salir vuelve a Windows)
#   oc        -> ejecuta cualquier comando dentro de Debian (o abre una shell)
. "$PSScriptRoot\common.ps1"

$repo    = Get-RepoRoot
$cfg     = Read-DotEnv (Join-Path $repo 'config\dotfiles.env')
$distro  = $cfg['WSL_DISTRO']
$workdir = $cfg['OPENCODE_WORKDIR']

Write-Step "3/3 - Instalando atajos en el PATH de Windows"

$binDir = Join-Path $env:USERPROFILE '.opencode-dotfiles\bin'
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

# opencode.cmd : lanza opencode (TUI) en Debian, dentro de ~/<workdir>.
# `wsl ... -- opencode` ejecuta y, al cerrar opencode, REGRESA a Windows (no deja
# colgada la sesion de WSL). %* reenvia cualquier argumento extra.
$opencodeCmd = @"
@echo off
REM opencode-dotfiles: abre OpenCode dentro de $distro y vuelve a Windows al salir.
wsl -d $distro --cd ~/$workdir -- opencode %*
"@
Set-Content -LiteralPath (Join-Path $binDir 'opencode.cmd') -Value $opencodeCmd -Encoding ASCII

# oc.cmd : ejecuta cualquier comando dentro de Debian y vuelve a Windows.
#   oc                -> abre una shell de Debian ('exit' regresa a Windows)
#   oc git status     -> corre el comando y regresa
$ocCmd = @"
@echo off
REM opencode-dotfiles: ejecuta un comando en $distro (o abre shell si no hay args).
if "%~1"=="" (
    wsl -d $distro --cd ~/$workdir
) else (
    wsl -d $distro --cd ~/$workdir -- %*
)
"@
Set-Content -LiteralPath (Join-Path $binDir 'oc.cmd') -Value $ocCmd -Encoding ASCII

Write-Ok "Atajos creados en $binDir (opencode.cmd, oc.cmd)"

# Agrega $binDir al PATH de USUARIO (no requiere admin; persistente).
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ([string]::IsNullOrEmpty($userPath)) {
    [Environment]::SetEnvironmentVariable('Path', $binDir, 'User')
    Write-Ok "PATH de usuario creado con: $binDir"
} elseif ($userPath.Split(';') -notcontains $binDir) {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$binDir", 'User')
    Write-Ok "Anadido al PATH de usuario: $binDir"
} else {
    Write-Ok "El PATH de usuario ya contenia: $binDir"
}
Write-Note "Abre una terminal NUEVA para que el PATH actualizado tenga efecto."
