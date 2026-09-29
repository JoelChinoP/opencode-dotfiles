# Modelos, razonamiento y rendimiento

## Objetivo de cada perfil

- **`daily`**: perfil inicial. Sol coordina e implementa; Luna explora con
  `medium`. Diseño y revisión usan Sol `xhigh`.
- **`performance`**: Astra coordina y evalúa; Sol **`xhigh`** implementa, como se
  eligió expresamente. Luna explora con `high`. Prima la capacidad en puntos
  importantes sin usar Astra para toda edición.
- **`deep`**: Astra también implementa, coordina con `xhigh` y reserva `max`
  para especificación, diseño, verificación y revisión. Sol explora con `high`.

Estos perfiles son decisiones iniciales, no benchmarks. Más razonamiento no
garantiza mejores resultados para toda tarea y puede aumentar latencia y cuota.

## Matriz completa por grupo

Todos los modelos pertenecen a **`openai-codex`**. Sol, Luna y Astra corresponden
a `gpt-6-sol`, `gpt-6-luna` y `gpt-6-astra`.

| Roles | Daily | Performance | Deep |
| --- | --- | --- | --- |
| `orchestrator` | Sol high | Astra high | Astra xhigh |
| `gentle-ai-explore` | Luna medium | Luna high | Sol high |
| `sdd-explore`, `sdd-onboard`, `sdd-research` | Luna medium | Luna high | Sol high |
| `sdd-init` | Luna medium | Luna high | Luna high |
| `sdd-status`, `sdd-archive` | Luna medium | Luna medium | Luna medium |
| `sdd-proposal` | Sol high | Astra high | Astra xhigh |
| `sdd-tasks` | Sol high | Sol high | Astra high |
| `gentle-ai-worker`, `sdd-apply`, `sdd-remediate`, `jd-fix-agent` | Sol high | Sol xhigh | Astra high |
| `sdd-spec`, `sdd-design` | Sol xhigh | Astra xhigh | Astra max |
| `gentle-ai-verify`, `sdd-verify` | Sol xhigh | Astra xhigh | Astra max |
| `review-readability`, `review-reliability`, `review-resilience`, `review-risk` | Sol xhigh | Astra xhigh | Astra max |
| `review-refuter`, `review-validator`, `jd-judge-a`, `jd-judge-b` | Sol xhigh | Astra xhigh | Astra max |

Estado y archivo se mantienen en Luna `medium`, incluso en `deep`: son roles
administrativos, no exploración compleja. Separar estos roles evita elevar todo
el flujo a `max`. Los roles SDD y RDD configurados permanecen disponibles para
cuando actives esos flujos; el catálogo no los lanza por sí mismo.

Las asignaciones fuente están en
[`../templates/profiles.json`](../templates/profiles.json). No se editan los
prompts de agentes del paquete: Gentle materializa su routing a través de su
configuración oficial.

## Tres archivos con responsabilidades diferentes

1. `~/.gentle-shell/gentle-ai/profiles.json`: catálogo de snapshots nombrados.
2. `~/.gentle-shell/gentle-ai/models.json`: asignaciones activas de roles,
   incluidas `review-refuter` y `review-validator`, que también lee Gentle AI.
3. `~/.gentle-shell/agent/subagents.json`: routing y límites de Gentle Agents.

El orquestador se configura mediante `defaultProvider`, `defaultModel` y
`defaultThinkingLevel` en `agent/settings.json`. La clave `orchestrator` aparece
en los snapshots, pero no se copia como un subagente a `subagents.json`.

El instalador siembra los tres caminos antes del primer arranque para que el
perfil inicial no dependa de una reconciliación posterior. Después, los comandos
`/gentle:models` y `/gentle:profiles` son los propietarios de esos ajustes.

La plantilla no establece `modelThinkingLevels`: un esfuerzo guardado por modelo
puede competir con el esfuerzo del orquestador de un perfil. Mantener el esfuerzo
en cada rol hace explícito qué selecciona `daily`, `performance` o `deep`.

## Cambiar y guardar

```text
/gentle:profiles
```

- Enter: aplicar perfil.
- `s`: guardar el routing actual en el perfil seleccionado.
- `p`: fijar un perfil para el clon/repositorio.
- `P`: declarar un perfil compartido en el repositorio.

Un pin de repositorio gobierna **los hijos**, no cambia automáticamente el
orquestador. Dentro de un repositorio fijado, Enter cambia ese pin en lugar de
reescribir el routing global. Para comprobar la selección efectiva, mira el
modelo/esfuerzo del orquestador y de cada hijo.

Para editar roles, usa `/gentle:models`; `u` guarda y actualiza el perfil
correspondiente. No confundas los perfiles de modelos con los perfiles visuales.

En 3.7.0 puede existir un lanzamiento de retraso al reconciliar hijos tras un
cambio de perfil. También puede haber overrides de proyecto y frontmatter de
agentes. La configuración global no demuestra por sí sola el routing efectivo.

`gsh-last` restaura el modelo registrado en la conversación. No fuerza `daily`
al reanudar una sesión que trabajaba con otro modelo.

## Contexto y transporte

El catálogo Pi consultado publica **272.000 tokens** para estos modelos Codex.
La configuración inicial reserva 32.768 y conserva aproximadamente 20.000 tokens
recientes al compactar. Su umbral es:

```text
contextTokens > 272000 - 32768
contextTokens > 239232
```

La ventana puede cambiar si actualizas el catálogo. No se altera artificialmente
`contextWindow` y no se portan los 350k del antiguo perfil OpenCode.

La reserva de 32.768 es una elección local prudente; Pi usa 16.384 por defecto.
No es un límite de salida ni garantiza que una petición de razonamiento `max`
pueda emplear siempre el máximo de salida anunciado por el proveedor.

`transport: auto` permite al runtime seleccionar WebSocket con reutilización de
contexto y gestionar su recuperación a SSE. No se añade un gateway intermedio.

`cacheWarming: streaming` conserva el valor predeterminado de Pi. En la versión
contrastada no se declara una duración de caché OpenAI que habilite el calentado
automático. `idle` no se presenta como una mejora demostrada para Codex, aunque
Gentle tenga soporte para ese modo en proveedores elegibles.

`hideThinkingBlock` oculta la presentación del razonamiento; no ahorra sus tokens.
Los IDs `-fast#high` del antiguo perfil no se convierten en IDs Pi. El esfuerzo
viaja separado del modelo; prioridad del servicio y razonamiento son ajustes
distintos.

## Concurrencia y verificación

El límite inicial es **4 hijos por orquestador de Gentle Agents**. Un cambio con
dependencias puede requerir solo un hijo. Mantener cuatro ocupados artificialmente
desperdicia contexto, cuota y trabajo de conciliación.

- Lecturas independientes pueden ejecutarse a la vez.
- Un solo escritor sobre los mismos archivos.
- Verificar tras estabilizar el cambio relevante, no mientras otro agente lo
  está alterando.
- Pasar a cada hijo solo el contexto y las evidencias que necesita.
- Usar contexto fresco para revisión; esto no sustituye tests y análisis estático.

El uso de la misma familia de modelos para implementación y revisión no aporta
diversidad entre proveedores. El beneficio aquí es separar contexto, rol y
evidencia, sin afirmar independencia estadística entre juicios del modelo.

Si necesitas bajar la concurrencia, ajusta `max_concurrency` en
`~/.gentle-shell/agent/subagents.json` y abre una sesión nueva. Un
`.pi/subagents.json` de proyecto puede imponer otro valor; no existe un límite
global del sistema implementado por estos archivos.

## Cómo ajustar sin adivinar

Compara tareas de dificultad parecida y registra fuera del prompt masivo:

1. Tiempo hasta una solución verificada.
2. Errores o correcciones posteriores a la primera implementación.
3. Consumo de cuota observado en `/gentle:usage`.
4. Tamaño de contexto y número de delegaciones.

Si la exploración omite relaciones relevantes, sube ese rol antes de subir todo
el perfil. Si hay esperas por cuota o mucho trabajo duplicado, prueba menos hijos.
Si `max` no reduce correcciones frente a `xhigh`, conserva `xhigh` para ese rol.
Las tarifas estimadas que muestre la interfaz no equivalen necesariamente al
cargo o a la fórmula de cuota de tu suscripción ChatGPT.

El techo inicial responde a las elecciones acordadas. Se modifica a partir de
evidencia del trabajo real, no por los 16 hilos del procesador.
