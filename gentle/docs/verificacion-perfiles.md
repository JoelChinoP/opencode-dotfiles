# Pruebas reales de perfiles — 29 de septiembre de 2026

## Resultado

`daily`, `performance` y `deep` completaron correctamente una tarea de exploración,
corrección y verificación con Codex autenticado. Los registros de los nueve hijos
confirmaron el modelo y esfuerzo esperados, sin errores de proveedor ni de
extensiones. No se encontró un fallo que requiriera cambiar los perfiles.

Se mantienen las versiones de la [verificación inicial](verificacion.md):
Pi 0.87.1, Gentle Shell / AI 3.7.0 y Engram 2.2.1.

## Método

- Se ejecutaron el checker instalado y los 14 tests aislados del instalador.
- El comando **`gsh --mode rpc --no-session` instalado** se arrancó tres veces en
  un repositorio temporal. Se consultaron doctor, estado, modelos disponibles,
  background, animaciones y RDD.
- Para cambiar perfiles y editar la tarea se utilizó una copia temporal de la
  configuración instalada y el SDK del mismo runtime. Paquetes y autenticación
  apuntaban a la instalación existente; sesiones y memoria de prueba tenían
  directorios independientes.
- La selección automatizada invocó el manejador real de `/gentle:profiles`,
  proporcionando la acción del panel mediante el contexto UI del SDK. Se comprobó
  el orquestador vivo y se lanzaron los hijos mediante `subagent_run` real. No se
  sustituyeron el proveedor, los modelos ni el runner de hijos por dobles.
- Cada perfil recibió la misma función de fusión de intervalos cerrados, con dos
  defectos: no fusionar extremos iguales y acortar un intervalo contenedor al
  absorber uno anidado. Se restableció el código defectuoso antes de cada perfil.
  Un único hijo escritor podía editar `intervals.py`; otro hijo verificaba después.
- Los cinco casos comprobaban entrada vacía, extremos compartidos, anidamiento,
  intervalos separados y conservación de la entrada. El harness volvió a ejecutar
  `python3 -B -m unittest -v` después de cada flujo.
- Se contrastaron modelo, esfuerzo y finalización en los registros del runner y
  en los mensajes persistidos de cada hijo, no en su respuesta de texto.

## Resultados por perfil

| Perfil | Explorar | Implementar | Verificar | Total de los tres hijos | Resultado |
| --- | --- | --- | --- | --- | --- |
| `daily` | Luna medium · 16,8 s | Sol high · 24,4 s | Sol xhigh · 17,2 s | **58,4 s** | 5/5 |
| `performance` | Luna high · 19,4 s | Sol xhigh · 23,0 s | Astra xhigh · 14,5 s | **56,9 s** | 5/5 |
| `deep` | Sol high · 9,9 s | Astra high · 26,6 s | Astra max · 33,1 s | **69,6 s** | 5/5 |

Los cambios de perfil tardaron entre **57 y 123 ms**. El primer hijo después de
cada cambio ya utilizó el routing esperado, sin reiniciar la sesión del SDK.

Los tres orquestadores también respondieron correctamente una petición breve sin
herramientas: Sol high en 5,7 s, Astra high en 3,5 s y Astra xhigh en 3,2 s.
Estas peticiones de conexión no están incluidas en los totales de la tabla.

| Perfil | Entrada sin caché de los hijos | Entrada desde caché | Salida | Pico RSS observado del harness y descendientes |
| --- | --- | --- | --- | --- |
| `daily` | 28.879 | 29.696 | 1.100 | 608 MiB |
| `performance` | 27.613 | 27.520 | 1.260 | 409 MiB |
| `deep` | 19.729 | 40.960 | 1.039 | 439 MiB |

Son sumas de los campos de uso reportados por Pi a lo largo de todos los turnos,
no medidas de cuota facturada. El RSS se muestreó cada 500 ms; no equivale a una
medición exhaustiva de memoria física privada.

**Alcance de la comparación:** una muestra pequeña por perfil, ejecución
secuencial y caché disponible. No permite ordenar los modelos por velocidad
general ni demostrar un óptimo global. Astra `max` tardó más en esta verificación
simple, pero ese dato no justifica reducir el esfuerzo reservado para trabajo
complejo en `deep`. Las siete combinaciones distintas de modelo/esfuerzo utilizadas
por los perfiles tuvieron llamadas reales satisfactorias. Los 26 roles por perfil
pasaron la validación estática; no se ejecutaron los flujos opcionales SDD/RDD.

## Arranque, carga y concurrencia

- Arranques reales de `gsh`: **2,144 / 2,138 / 2,141 s** hasta la respuesta RPC.
  Sol high efectivo, stderr vacío y salida ordenada con código 0 en los tres.
- Cargador SDK: **17 extensiones**, sin errores ni colisiones de recursos.
- Doctor: activos de delegación/revisión vigentes, routing válido y herramientas
  Engram disponibles. OpenSpec ausente es coherente con una prueba ODD.
- Background habilitado; RDD deshabilitado por elección global.
- Flujo completo de background: el orquestador llamó a `subagent_run`, recibió la
  notificación automática del hijo y presentó sus hallazgos en **22,4 s**, sin
  consultar periódicamente el estado ni duplicar la tarea.
- Cinco lecturas delegadas simultáneamente: todas correctas en **16,1 s**.
  El máximo observado fue **4 hijos**; el quinto esperó **6,36 s** en cola.
  Pico RSS del harness y descendientes: **1.112 MiB**. Se conserva el límite 4.

## Interfaz

La configuración instalada utilizaba el tema `Gentleman-Sexy` y animaciones
`quality`, personalizaciones respecto a los valores iniciales del repositorio.

Se compararon ambos modos de animación en pseudoterminal de 160 × 45, con la misma
copia de configuración, cinco segundos de arranque y ocho segundos de reposo:

| Animaciones | CPU media de un núcleo | RSS al final | Bytes de terminal durante el reposo |
| --- | --- | --- | --- |
| `quality` | 0,50 % | 278 MiB | 965 |
| `performance` | 0,37 % | 277 MiB | 0 |

Ambas sesiones terminaron con código 0. El consumo observado es bajo en ambos
modos; se conserva `quality`. Esta prueba cubre reposo y arranque, no una sesión
larga con streaming y varios paneles animados.

## Estado final y evidencias

El perfil instalado sigue en **`daily`**, Sol high y concurrencia 4. Los perfiles
mantienen sus asignaciones originales; no se modifican esfuerzos, límites de
contexto, transporte ni preferencias visuales a partir de diferencias pequeñas
de esta muestra.

Las evidencias y los scripts de diagnóstico de esta ejecución se guardan fuera del
repositorio, bajo:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/gentle/verification/2026-09-29-profiles
```

Incluyen resultados de arranque RPC, perfiles, conversaciones de diagnóstico con
respuestas reales de Codex, concurrencia, background y terminal. No incluyen
credenciales ni una copia de la base de memoria habitual.
