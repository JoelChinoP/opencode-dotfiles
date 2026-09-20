# Windows

Con OpenCode V2 instalado, desde la raíz de este repositorio en PowerShell:

```powershell
$configDir = Join-Path $HOME ".config/opencode"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
Copy-Item "templates/opencode.jsonc" (Join-Path $configDir "opencode.jsonc") -Confirm
```

La ruta predeterminada es `%USERPROFILE%\.config\opencode\opencode.jsonc`.
Si defines `XDG_CONFIG_HOME`, usa `$configDir = Join-Path $env:XDG_CONFIG_HOME "opencode"`
como primera línea.

Si ya usas `opencode.json` o `opencode.jsonc`, integra los ajustes que necesites
en ese archivo en lugar de copiar la plantilla. Ejecuta `opencode` desde tu
proyecto para empezar.
