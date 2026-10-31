---
description: Audit a repository or module with evidence-based, ranked findings
---

Audita este alcance: $ARGUMENTS

Procedimiento puntual de solo lectura. No edites archivos, no crees commits y no
cambies el modo de Ponytail. Si no se indica alcance, audita el repositorio actual.
El nivel lite no limita la profundidad del análisis.

1. Lee las reglas del proyecto, README, manifiestos, configuración de despliegue,
   puntos de entrada y pruebas. Determina el uso y la carga esperados a partir de
   evidencia; declara los supuestos que no puedas confirmar.
2. Traza los flujos principales de extremo a extremo. Prioriza entrada de datos,
   autenticación, persistencia, dinero, trabajos en segundo plano y estado compartido.
   En repositorios grandes, profundiza en las áreas de mayor riesgo y declara las
   áreas no revisadas. Acota búsquedas y respeta las exclusiones del proyecto.
3. Busca errores, vulnerabilidades, pérdida de datos, carreras, crecimiento sin
   límite, pruebas ausentes en lógica riesgosa, cuellos de botella y complejidad
   innecesaria. Evalúa la escala real, no necesidades futuras imaginadas.
4. Cada hallazgo requiere un escenario reproducible o una cadena causal demostrada
   con código. Comprueba consumidores y referencias dinámicas antes de proponer
   eliminaciones. No reportes preferencias de estilo ni límites deliberados que
   todavía satisfacen los requisitos. Propón arreglos mínimos y reutilizables.
5. Ejecuta solo comprobaciones pertinentes que no alteren datos o archivos del usuario.

Entrega en español: qué hace el proyecto, alcance y supuestos; hasta 20 hallazgos
numerados y ordenados por gravedad, con archivo y línea, evidencia, impacto y
arreglo propuesto; conclusión y áreas o verificaciones pendientes. Diferencia
problemas confirmados de incertidumbres. Si no encuentras problemas, dilo sin
presentar la auditoría como garantía de ausencia de errores.
