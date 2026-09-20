# opencode-dotfiles-v2

Perfil limpio de **OpenCode V2 para Arch Linux**, con Engram, Ponytail y la
statusline como plugins locales. Versiones de referencia: OpenCode 2.0.8 y
Engram 2.0.0.

| Integración | Estado |
| --- | --- |
| Context7 MCP remoto | Activado; documentación solo cuando hace falta |
| Engram MCP local | Activado; memoria crítica y contexto limitado |
| CodeGraph MCP remoto | Desactivado por defecto |
| Engram local V2 | Política crítica y guía de compactación |
| Ponytail local V2 | Reglas por turno en `lite`; `/ponytail` cambia el modo |
| subagent-statusline.v2 local | Pie y barra lateral de la TUI |
| Herdr | Integración oficial opcional: `herdr integration install opencode` |
| Skills documentales y diseño | `document-files` local y `frontend-design` fijada |
| Navegador | Skill y `@playwright/cli@0.1.21` fijados; Chromium del sistema |
| Gobernanza de skills | Catálogo permitido y mantenimiento manual no autoinvocable |

## Instalar

Lee [arch/README.md](arch/README.md) antes de ejecutar:

```sh
bash arch/install.sh
```

El instalador **reemplaza el perfil global**, con respaldo completo del anterior
y de la base Engram. No es un merge: modelos/proveedores personalizados, reglas,
skills y plugins previos quedan en el respaldo. Las credenciales y sesiones que
OpenCode guarda en su directorio de datos se conservan. `service.json` conserva sus
ajustes, fijando la escucha en `127.0.0.1`. El perfil se valida antes de reemplazar
el anterior. No ejecuta `sudo` ni instala paquetes con pacman por ti.

Para desplegar sin reiniciar el servicio: `bash arch/install.sh --no-start`.
En esta preparación solo se instaló en un entorno temporal aislado.

Tras instalar, abre una terminal Bash/Zsh nueva: `oc` abre OpenCode y
`oc-last` retoma la última sesión; `oc --session ses_ID` abre una concreta.
Por SSH, con el mismo usuario y HOME/XDG, se usan los mismos comandos en el
directorio del proyecto. V2 ya descubre/inicia un servicio separado de la terminal.

## Permisos y contexto

- Confirmaciones TUI en `prompt`; shell pide autorización salvo inspecciones Git
  acotadas. Los comandos de test/build se autorizan por proyecto.
- Solo se anuncian las skills integradas permitidas y las tres administradas;
  otras copias globales o de compatibilidad quedan ocultas hasta autorizarlas.
- Se prioriza código fuente; leer dependencias y artefactos requiere confirmación.
  La búsqueda se acota por instrucciones, no mediante `watcher.ignore`.
- Engram: sin captura de prompts, búsquedas de hasta 5 recuerdos y contexto de 8 KiB.
- Títulos: `agents.title.model` usa `opencode/big-pickle`, gratuito y disponible
  desde octubre de 2025. El catálogo lo admite, pero la prueba real con V2.0.8
  recibe HTTP 403 de Zen; véase [verificación](docs/verificacion.md).
- Astra, Sol, Terra y Luna compactan aproximadamente a 350k (`input: 370000`,
  buffer de 20k). Se conservan 30k recientes. Detalles y fuentes en el
  [análisis de contexto y consumo](docs/contraste-dotfiles.md#3-modelos-y-compactación).

## Archivos

- `AGENTS.md`: reglas del proyecto y criterio de simplicidad para este repositorio.
- `templates/`: configuración portable, reglas, plugins locales y cuatro skills
  administradas. `skills-lock.json` fija procedencia, runtime y licencia;
  `tools/playwright-cli/` contiene el lock npm exacto.
- `arch/install.sh`: requisitos, Engram oficial verificado, respaldo, despliegue
  y export de `PONYTAIL_DEFAULT_MODE=lite`, más atajos en Bash/Zsh.
- `arch/verify.sh`: comprobaciones locales; `--live` comprueba el servicio y MCPs.
- `arch/check.mjs`: pruebas de los plugins, sin modelos ni red externa.
- `arch/check-install.py`: instalación y atajos en HOME/XDG aislados, con binarios simulados.
- `arch/check-documents.sh`: smoke DOCX/PDF con las herramientas nativas.
- [docs/contraste-dotfiles.md](docs/contraste-dotfiles.md): comparación con el repositorio
  anterior, propuesta de permisos y pendientes priorizados.
- [docs/hallazgos.md](docs/hallazgos.md): correcciones al informe y decisiones.
- [docs/fuentes.md](docs/fuentes.md): documentación primaria, versiones y licencias.
- [docs/verificacion.md](docs/verificacion.md): evidencia y límites de lo probado.
- `docs/oc-search-config.md`: informe original, conservado como contexto histórico.

Windows queda pendiente: su guía inicial aún no despliega el perfil completo de
plugins. La instalación soportada en esta revisión es la de Arch.
