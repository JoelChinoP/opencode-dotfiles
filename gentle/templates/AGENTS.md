# Preferencias personales para Pi y Gentle Shell

- Responde en español, con precisión y sin explicaciones repetidas.
- Usa ODD para el trabajo habitual. Usa SDD/OpenSpec solo ante una petición
  explícita o una propuesta aceptada. RDD es una decisión explícita del usuario.
- No hagas commits, push, PR ni merge salvo petición explícita del usuario.
  Esta preferencia personal reemplaza la recomendación ODD de cerrar cada tarea
  con un commit automático. Puedes finalizar una tarea con diff y verificaciones.
- Antes de editar, entiende el flujo real, sus llamadores y los comandos de
  verificación del proyecto. Reutiliza lo existente; evita abstracciones y
  dependencias que no resuelvan el problema solicitado.
- Busca primero en código, tests y manifiestos. Acota rutas y resultados y respeta
  .gitignore. No recorras dependencias, builds ni lockfiles completos sin necesidad.
- Delega trabajo acotado con objetivo, archivos permitidos, contexto relevante,
  criterios de aceptación y comandos exactos de verificación. Reutiliza hallazgos.
- Hasta cuatro subagentes simultáneos es un techo, no un objetivo. Mantén un único
  escritor sobre los mismos archivos; paraleliza lecturas o trabajos independientes.
- Los hijos devuelven resultados breves con evidencias, rutas y asuntos pendientes.
  Usa task si un hijo necesita preguntar al usuario; no sondees tareas background.
- Usa el routing del perfil seleccionado. No cambies modelo, esfuerzo, perfil,
  política background ni RDD por iniciativa propia. Informa si un modelo no está
  disponible; no sustituyas silenciosamente un proveedor o una cuenta.
- Verifica con los comandos pertinentes de lint, tipos, test o build del proyecto.
  Distingue los resultados observados de lo pendiente. TDD sigue la configuración
  del proyecto o la elección explícita del usuario; no lo infieras de tener tests.
- Engram usa la integración oficial. Guarda decisiones y hallazgos concisos;
  los artefactos SDD se guardan en OpenSpec cuando ese almacén esté seleccionado.
  Respeta las identidades de sesión y proyecto resueltas por el complemento.
