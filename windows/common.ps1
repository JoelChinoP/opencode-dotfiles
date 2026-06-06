# common.ps1 - utilidades compartidas por los scripts de opencode-dotfiles.
# Se importa con:  . "$PSScriptRoot\common.ps1"

$ErrorActionPreference = 'Stop'

# Hace que wsl.exe emita UTF-8 (por defecto emite UTF-16LE y rompe el parseo).
$env:WSL_UTF8 = '1'

function Get-RepoRoot {
    # La carpeta padre de \windows es la raiz del repo.
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Read-DotEnv {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "No se encontro el archivo de configuracion: $Path"
    }
    $cfg = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $t = $line.Trim()
        if ($t -eq '' -or $t.StartsWith('#')) { continue }
        $i = $t.IndexOf('=')
        if ($i -lt 1) { continue }
        $cfg[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim()
    }
    return $cfg
}

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr = New-Object Security.Principal.WindowsPrincipal($id)
    return $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-Admin {
    if (-not (Test-Admin)) {
        throw "Este paso requiere PowerShell como Administrador. Abre PowerShell como administrador y reejecutalo."
    }
}

function ConvertTo-WslPath {
    param([string]$WinPath, [string]$Distro)
    # Convierte D:\a\b -> /mnt/d/a/b. Intenta usar wslpath dentro de la distro;
    # si la distro aun no existe, hace la conversion a mano.
    $p = ''
    try { $p = (wsl -d $Distro wslpath -a "$WinPath") } catch { $p = '' }
    if ([string]::IsNullOrWhiteSpace($p)) {
        $drive = $WinPath.Substring(0, 1).ToLower()
        $rest  = ($WinPath.Substring(2) -replace '\\', '/')
        $p = "/mnt/$drive$rest"
    }
    return $p.Trim()
}

function Test-WslDistro {
    param([string]$Distro)
    $list = (wsl -l -q) -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    return ($list -contains $Distro)
}

function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "    [ok] $m" -ForegroundColor Green }
function Write-Note { param($m) Write-Host "    [!]  $m" -ForegroundColor Yellow }
