# Documentos, diapositivas y diagramas

El perfil incluye tres skills locales, cargadas solo cuando encajan con la tarea:

| Skill | Fuente | Salidas y revisión |
| --- | --- | --- |
| `document-files` | Markdown y referencia DOCX generada o suministrada | DOCX/PDF; comprobación del paquete, texto y páginas renderizadas |
| `presentation-slides` | Generador CommonJS con PptxGenJS 4.0.1 | PPTX con texto/gráficos editables, notas y PDF; revisión de cada slide |
| `diagram-design` | Imagen generada o DOT editable | GPT Image 2 para explicar arquitectura; Graphviz para diagramas editables o si falla la generación o su revisión |

Las instrucciones, plantillas y helpers nuevos son locales. No se redistribuyen
las skills documentales propietarias de Anthropic. `frontend-design` conserva su
licencia Apache-2.0 y su ámbito web.

## Activación y uso

Despliega con el instalador descrito en [la guía Arch](../arch/README.md); requiere
también `graphviz`, `fontconfig` y `noto-fonts`. El instalador valida y respalda el
perfil antes de reemplazarlo. Usa `--no-start` para desplegar sin reiniciar.

Ejemplos de peticiones:

- «Crea un informe Word y PDF con estos datos; conserva la fuente Markdown y
  revisa todas las páginas». Puedes indicar `@document-files` explícitamente.
- «Prepara 6 diapositivas editables para dirección; incluye fuentes y notas y
  revisa los renders». Puedes indicar `@presentation-slides`.
- «Genera un diagrama para presentar la arquitectura de este servicio» usa el
  modelo de imágenes preferido (`openai/gpt-image-2`); se revisan textos y flechas.
- «Representa este flujo de autenticación, con límites de confianza, en SVG y
  entrega el DOT». Puedes indicar `@diagram-design`.

En la TUI, `session.image_preview` permite ampliar las miniaturas con un clic.
El agente presenta la imagen final si es la respuesta, o las variantes si compara
diseños. La TUI también puede mostrar adjuntos o lecturas de verificación: el
ajuste nativo no filtra por intención.

Las skills autorizadas aparecen en el siguiente contexto actualizado de OpenCode;
puedes usar `/reload` para forzar la recarga. La documentación de V2 no exige
reiniciar el servicio por cambiar únicamente las skills o sus permisos.

## Decisiones de calidad

- Diseño previo breve: audiencia, propósito, estructura, fuentes y sistema visual.
- Referencia documental generada desde Pandoc: A4, márgenes de 20 mm, fuentes Noto,
  jerarquía de estilos, espaciado de tablas y número de página. Un template aprobado
  por el usuario prevalece sobre estos valores.
- Gráficos y texto nativos en PowerPoint; las capturas no sustituyen una slide
  editable. Las fuentes deben existir también en el equipo del destinatario.
- Diagrama basado en hechos: la semántica se contrasta con código/documentación;
  Graphviz resuelve la distribución, no la veracidad de las conexiones.
- Toda creación o rediseño material termina con imágenes inspeccionadas. Si hay
  defectos, se corrige la fuente y se renderiza en un directorio nuevo.

El checker de Office comprueba ZIP, XML, relaciones internas y límites simples de
figuras PPTX. No es un validador XSD completo ni detecta desbordamientos de texto,
solapamientos o todas las particularidades de Word/PowerPoint. La revisión visual
con LibreOffice sigue siendo necesaria y no demuestra fidelidad idéntica en Office.
Los helpers no editan arbitrariamente documentos de terceros ni preservan por
contrato macros, revisiones, formularios avanzados o firmas.

## Comprobación reproducible

```sh
node arch/check.mjs
TMPDIR=/tmp/opencode python -I arch/check-install.py
bash arch/check-documents.sh
TMPDIR=/tmp/opencode python -I arch/check-visuals.py --output /tmp/opencode/revision-visual-nueva
```

El último comando guarda un documento, una presentación con tres slides y un
diagrama, además de sus renders. Inspecciona `document-review/page-*.png`,
`slide-review/page-*.png` y `diagram.png`. Los datos del ejemplo son sintéticos;
no son mediciones de productividad ni de calidad de modelos.

## Comparación controlada con Claude Code

Este protocolo separa la elección del modelo de las diferencias entre agentes.
No basta comparar dos resultados con distintos modelos o solo su apariencia.

1. Selecciona en `/models` un modelo Claude realmente disponible en OpenCode y
   el mismo modelo/revisión en Claude Code. Registra versiones de ambos agentes,
   esfuerzo de razonamiento, límite de gasto/tiempo y acceso a herramientas.
2. Usa directorios y sesiones nuevos para cada ejecución, el mismo encargo y los
   mismos materiales. No proporciones a un agente el resultado del otro.
3. Primera ronda: perfiles habituales. Segunda ronda: mismas instrucciones locales
   de estas tres skills, fuentes Noto y versiones de generadores/renderizadores.
   No desactives validaciones para igualar tiempos. Anota las diferencias que no
   puedas controlar, especialmente servicios de Artifacts/Slides/Design.
4. Ejecuta tres repeticiones por agente y ronda. Guarda fuentes, resultados,
   renders, tiempo, coste y número de correcciones. No incluyas credenciales.
5. Oculta el nombre del agente antes de puntuar: exactitud y cobertura 40%,
   legibilidad 30%, consistencia visual 15%, editabilidad/reproducibilidad 15%.
   Registra por separado defectos graves: datos inventados, omisiones, texto
   cortado, archivos que no abren o fuentes ausentes.

### Encargo común

> Para el comité de operaciones de una empresa ficticia, produce un informe de
> dos páginas en DOCX/PDF, una presentación de cinco slides en PPTX/PDF y un
> diagrama SVG/PNG del proceso. Entrega también las fuentes editables. Usa español,
> fuentes Noto y un diseño sobrio, sin logotipo. Revisa visualmente cada página y
> slide. Los siguientes datos son sintéticos y deben identificarse como tales:
>
> Periodo A: 1.000 pedidos, 40 incidencias, 48 horas de resolución media.
> Periodo B: 1.200 pedidos, 36 incidencias, 30 horas de resolución media.
> Objetivo próximo: menos del 3% de incidencias. No inventes costes, ingresos ni
> causas. Calcula tasas y cambios, distinguiendo porcentaje y puntos porcentuales.
> Proceso: cliente envía pedido; API valida; si falla devuelve error; si pasa,
> guarda el pedido y publica un evento en la cola; un trabajador procesa el evento
> y solicita el envío al almacén; si el almacén rechaza, pasa a revisión manual.
> Diferencia pasos síncronos y asíncronos. Termina con las decisiones que faltan
> y qué datos permitirían tomarlas.

Control factual: incidencias 4% → 3%, descenso de 1 punto porcentual y 25% relativo;
pedidos +20%; incidencias absolutas −10%; tiempo medio −37,5%. El objetivo «menos
del 3%» todavía no se ha alcanzado. No puede deducirse causalidad ni ahorro económico.

Estado inicial: comparación de modelos pendiente. En la preparación de este cambio
el catálogo de OpenCode no ofreció modelos Claude; no se alteran proveedores ni
se inventan credenciales para ejecutar la prueba.
