---
description: Review a change for correctness, risk and unnecessary complexity
---

Revisa los cambios indicados: $ARGUMENTS

Procedimiento puntual de solo lectura. No edites archivos, no crees commits y no
cambies el modo de Ponytail. El nivel lite permite una revisión exhaustiva.

1. Si no se indica alcance, revisa los cambios sin confirmar. Si no hay cambios,
   indícalo y pide un commit, rama o archivos; no amplíes el alcance por tu cuenta.
2. Lee las reglas del proyecto, el diff y el flujo relacionado: llamadores,
   funciones llamadas, contratos y pruebas. Comprueba los consumidores afectados
   cuando cambien firmas, valores devueltos o comportamiento.
3. Prioriza errores funcionales, seguridad, pérdida de datos, concurrencia a la
   escala real del proyecto, pruebas de lógica riesgosa, rendimiento y complejidad
   innecesaria. No confundas preferencias de estilo con defectos.
4. Confirma cada hallazgo con un caso concreto y evidencia en el código. Revisa
   referencias antes de declarar código sin uso. Respeta límites deliberados
   documentados mientras la carga esperada no los exceda. Descarta sospechas sin
   fundamento; identifica claramente lo que no pudiste comprobar.
5. Propón el arreglo mínimo correcto, reutilizando lo existente. Ejecuta solo
   comprobaciones pertinentes que no alteren datos o archivos del usuario.

Entrega en español: resumen breve del cambio y hallazgos numerados por gravedad,
con archivo y línea, escenario que falla, impacto y corrección propuesta. Separa
problemas bloqueantes de mejoras opcionales. Termina con un veredicto y las
verificaciones realizadas o pendientes. Si no hay hallazgos, dilo sin inventarlos.
