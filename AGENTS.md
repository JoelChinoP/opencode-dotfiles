# Reglas del repositorio

- Responde en español; mantén los cambios pequeños y necesarios.
- Este repositorio configura OpenCode V2 para Arch Linux y Windows.
- Guarda las plantillas compartidas en `templates/` y lo específico de cada
  sistema en `arch/` o `windows/`.
- Reutiliza lo existente y las herramientas nativas antes de añadir dependencias.
- Usa la documentación de V2: https://opencode.ai/v2/docs/config.
- Mantén las plantillas sin credenciales ni rutas personales y verifica los cambios.

## Simplicidad (Ponytail local)

Este repositorio mantiene una adaptación local de Ponytail en
`templates/plugins/ponytail/` porque el entrypoint upstream 4.10.0 usa hooks V1
que OpenCode V2 no ejecuta. Al editar este repositorio:

- Antes de editar, entiende el flujo y sus llamadores; corrige la causa raíz.
- Implementa solo lo solicitado: reutiliza código, biblioteca estándar y funciones
  nativas antes de añadir dependencias, abstracciones o infraestructura futura.
- Prefiere el cambio más pequeño que funcione, sin sacrificar validación, manejo
  de errores, seguridad ni accesibilidad. Verifica los cambios relevantes.
- Mantén Engram, Ponytail y la statusline como adaptaciones locales verificadas.
  Herdr se instala por su mecanismo oficial, sin duplicar su archivo administrado.
- El nivel inicial de Ponytail es `lite` (`PONYTAIL_DEFAULT_MODE` o la opción del
  plugin); `/ponytail` sin argumento usa `full`.
