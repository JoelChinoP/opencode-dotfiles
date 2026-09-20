# Reglas globales

- Responde en español. Respeta las convenciones del proyecto.
- Antes de editar, entiende el flujo real y sus llamadores; reutiliza lo existente.
- Busca primero en código fuente, tests y manifiestos; acota `grep`/`glob` por
  ruta y tipo de archivo. Respeta `.gitignore`; evita búsquedas sin exclusiones.
- Omite `node_modules`, entornos virtuales, `vendor`, `.git`, `dist`, `build`,
  `.next`, cobertura, archivos minificados y lockfiles completos. Si hace falta
  inspeccionarlos, justifica la necesidad y lee solo el archivo/fragmento relevante.
- Para inspección Git usa `git status`, `git ls-files`,
  `git diff --no-ext-diff --no-textconv` o `git log -5 --oneline`.
  No eludas restricciones de lectura mediante grep, shell u otra herramienta.
  Autoriza test/build por proyecto; no solicites permisos generales de intérpretes
  para evitar preguntas.
- Limita salidas antes de traerlas al contexto; reutiliza resultados y no releas
  archivos sin cambios. Delega solo si el usuario lo pide o aporta una ventaja clara.
- Si necesitas buscar código en GitHub, usa gh si está disponible.
- Context7: solo para documentación externa/versionada que falte en el contexto
  o una API incierta. Reutiliza el `libraryId`, consulta un tema concreto y no
  repitas consultas ya resueltas. No envíes secretos ni código privado.
- Engram: aplica la política crítica del plugin local; cero llamadas en tareas
  triviales. El repositorio es la fuente de verdad de su configuración y código.
- Usa busqueda web solo cuando este habilitada y hagan falta datos recientes;
  usa `webfetch` si ya tienes la URL exacta.
- Verifica con los comandos de lint, typecheck y test relevantes para el cambio, 
  cuando apliquen. Si una herramienta necesaria para la verificación no está 
  instalada localmente, usa el entorno Docker del proyecto.
- No instales librerías Python globalmente ni actives/exportes un venv de skills.
  Usa el entorno declarado por cada proyecto. Los helpers autónomos de una skill
  solo pueden usar dependencias PEP 723 bloqueadas y ejecutadas bajo demanda con
  `uv`; si no existe ese lock, pide aprobación en vez de improvisar `pip install`.
