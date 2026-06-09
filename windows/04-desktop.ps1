#requires -Version 5.1
# 04-desktop.ps1 - Instala la APP DE ESCRITORIO de OpenCode en Windows (via Scoop)
# y la apunta al servidor 'opencode serve' que corre en WSL (localhost:OPENCODE_SERVE_PORT).
# No requiere Administrador (Scoop es por usuario).
. "$PSScriptRoot\common.ps1"

$repo      = Get-RepoRoot
$cfg       = Read-DotEnv (Join-Path $repo 'config\dotfiles.env')
$servePort = $cfg['OPENCODE_SERVE_PORT']

Write-Step "4/4 - App de escritorio de OpenCode"

# Scoop NO debe instalarse como Administrador. Si se elevo, abortamos con guia.
if (Test-Admin) {
    Write-Note "Estas como Administrador y Scoop no debe instalarse asi."
    Write-Note "Abre una terminal NORMAL (sin admin) y ejecuta:"
    Write-Note "  powershell -ExecutionPolicy Bypass -File .\windows\04-desktop.ps1"
    throw "Aborta: ejecuta 04-desktop.ps1 sin privilegios de Administrador."
}

# --- Scoop (gestor de paquetes por usuario) ---
if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
    Write-Step "Instalando Scoop (gestor de paquetes de usuario)"
    # Scoop pide ExecutionPolicy RemoteSigned para CurrentUser. Pero si lanzaste
    # con '-ExecutionPolicy Bypass', el scope Process (mas prioritario) invalida
    # ese cambio y Set-ExecutionPolicy lanza un error de override. Como la policy
    # efectiva ya permite ejecutar, el error es inocuo: lo tragamos y seguimos.
    try { Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force -ErrorAction Stop }
    catch { Write-Note "ExecutionPolicy no modificada (ya corres con una mas permisiva); se continua." }
    Invoke-RestMethod -Uri 'https://get.scoop.sh' | Invoke-Expression
} else {
    Write-Ok "Scoop ya esta instalado"
}

# --- Bucket 'extras' (contiene opencode-desktop) ---
$buckets = (scoop bucket list) | Out-String
if ($buckets -notmatch 'extras') {
    scoop bucket add extras
    Write-Ok "Bucket 'extras' anadido"
}

# --- App de escritorio ---
Write-Step "Instalando opencode-desktop"
scoop install extras/opencode-desktop

# --- Apuntar la app al servidor de WSL via opencode.jsonc ---
# Metodo oficial: una seccion "server" en %USERPROFILE%\.config\opencode\opencode.jsonc
$cfgDir  = Join-Path $env:USERPROFILE '.config\opencode'
$cfgFile = Join-Path $cfgDir 'opencode.jsonc'
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null

$jsonc = @"
{
  // Generado por opencode-dotfiles: la app de escritorio se conecta al
  // servidor 'opencode serve' que corre en WSL (Debian).
  // Con networkingMode=mirrored, 127.0.0.1 de Windows == 127.0.0.1 de WSL.
  "`$schema": "https://opencode.ai/config.json",
  "server": {
    "hostname": "127.0.0.1",
    "port": $servePort
  }
}
"@

if (Test-Path -LiteralPath $cfgFile) {
    $bak = "$cfgFile.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item -LiteralPath $cfgFile -Destination $bak -Force
    Write-Note "Ya existia opencode.jsonc; respaldado en $bak"
    Write-Note "NO se sobrescribio tu config. Anade manualmente esta seccion si falta:"
    Write-Host  '      "server": { "hostname": "127.0.0.1", "port": ' -NoNewline
    Write-Host  "$servePort }"
} else {
    Set-Content -LiteralPath $cfgFile -Value $jsonc -Encoding UTF8
    Write-Ok "Config creada: $cfgFile  (server -> 127.0.0.1:$servePort)"
}

# --- Aviso importante sobre OPENCODE_PORT ---
$envPort = [Environment]::GetEnvironmentVariable('OPENCODE_PORT', 'User')
if ($envPort) {
    Write-Note "Tienes OPENCODE_PORT=$envPort en tu entorno de Windows. Esto puede"
    Write-Note "hacer que la app levante su PROPIO server local y no conecte a WSL."
    Write-Note "Si la app falla, borra esa variable: setx OPENCODE_PORT """""
}

# --- Validacion: el API de WSL responde en localhost:servePort? ---
Write-Step "Validando conexion con el servidor (localhost:$servePort)"
$ok = $false
try {
    $c = New-Object Net.Sockets.TcpClient
    $iar = $c.BeginConnect('127.0.0.1', [int]$servePort, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(2000)) { $c.EndConnect($iar); $ok = $true }
    $c.Close()
} catch { $ok = $false }

if ($ok) {
    Write-Ok "El servidor responde en 127.0.0.1:$servePort. La app deberia conectar."
} else {
    Write-Note "No respondio aun. Arranca WSL (ejecuta 'oc' una vez) para que systemd"
    Write-Note "levante 'opencode-serve', y luego abre la app de escritorio."
}

Write-Step "App de escritorio lista"
Write-Host "  Abrela desde el menu Inicio (OpenCode). Si pide servidor, usa:" -ForegroundColor Green
Write-Host "    http://localhost:$servePort" -ForegroundColor Green
Write-Host "  Tambien puedes configurarlo in-app: Home -> nombre del servidor -> Server picker." -ForegroundColor Green
