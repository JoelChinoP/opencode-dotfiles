# Procedencia

- Repositorio: https://github.com/microsoft/playwright-cli
- Commit: `74354ecc7a43da16d91a9bc54fa8db8283a3fcf5`
- Ruta: `skills/playwright-cli/`
- Paquete emparejado: `@playwright/cli@0.1.21`
- Licencia: Apache-2.0; véase `LICENSE`.

Adaptación local de OpenCode:

- Se retiró `allowed-tools`, un campo que OpenCode V2 no interpreta.
- Se sustituyó la instalación global mediante `@latest` por el runtime fijado
  que administra este repositorio.
- Se añadieron límites de seguridad para perfiles, secretos, orígenes,
  contenido de páginas y `run-code`.

Los comandos y referencias restantes proceden del commit indicado. Al
actualizar, revisar el diff completo, conservar estos límites y cambiar juntos
la skill, el paquete npm, el lockfile y `templates/skills-lock.json`.
