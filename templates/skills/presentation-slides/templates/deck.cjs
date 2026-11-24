// Edit this example in the task directory, then run: slides-node deck.cjs output.pptx
const { existsSync } = require("node:fs");
const pptxgen = require("pptxgenjs");

async function main() {
  const output = process.argv[2];
  if (!output || !output.endsWith(".pptx") || existsSync(output)) {
    throw new Error("Provide a new output.pptx path; existing files are preserved.");
  }
  const deck = new pptxgen();
  deck.layout = "LAYOUT_WIDE";
  deck.lang = "es-ES";
  deck.author = "";
  deck.subject = "Ejemplo de composición; datos sintéticos";
  deck.title = "Una entrega que se puede revisar";
  deck.theme = { headFontFace: "Noto Sans", bodyFontFace: "Noto Sans", lang: "es-ES" };
  const colors = { ink: "183A37", paper: "FFFFFF", accent: "087E8B", muted: "53636B", pale: "EAF3F3" };

  let slide = deck.addSlide();
  slide.background = { color: colors.ink };
  slide.addText("Una entrega que\nse puede revisar", {
    x: 0.7, y: 1.3, w: 8.7, h: 2.0, fontSize: 38, bold: true, color: colors.paper, margin: 0,
  });
  slide.addText("Contenido claro, formatos editables y comprobación visual.", {
    x: 0.7, y: 3.7, w: 8.8, h: 1.1, fontSize: 24, color: colors.paper, margin: 0,
  });
  slide.addText("Ejemplo de plantilla · sustituir contenido y diseño según el encargo", {
    x: 0.7, y: 6.2, w: 11.8, h: 0.5, fontSize: 12, color: "C8DEDC", margin: 0,
  });
  slide.addNotes("Ejemplo local. No representa resultados medidos ni una marca real.");

  slide = deck.addSlide();
  slide.addText("Cada paso deja una evidencia", {
    x: 0.7, y: 0.6, w: 11.9, h: 0.8, fontSize: 32, bold: true, color: colors.ink, margin: 0,
  });
  const stages = [
    ["Contenido", "Un mensaje principal y fuentes comprobables."],
    ["Construcción", "Texto, figuras y gráficos que se pueden editar."],
    ["Revisión", "Renderizar, mirar y corregir antes de entregar."],
  ];
  stages.forEach(([title, body], index) => {
    const x = 0.7 + index * 4.1;
    slide.addShape(deck.ShapeType.rect, {
      x, y: 2.05, w: 3.7, h: 3.55, line: { color: colors.pale }, fill: { color: colors.pale },
    });
    slide.addText(title, { x: x + 0.25, y: 2.4, w: 3.2, h: 0.6, fontSize: 24, bold: true, color: colors.ink, margin: 0 });
    slide.addText(body, { x: x + 0.25, y: 3.3, w: 3.15, h: 1.8, fontSize: 22, color: colors.ink, margin: 0 });
  });
  slide.addNotes("El recorrido es secuencial. Sustituir los pasos por el proceso real del encargo.");

  slide = deck.addSlide();
  slide.addText("El gráfico conserva sus datos editables", {
    x: 0.7, y: 0.6, w: 11.9, h: 0.8, fontSize: 32, bold: true, color: colors.ink, margin: 0,
  });
  slide.addChart(deck.ChartType.bar, [
    { name: "Minutos", labels: ["Preparación", "Generación", "Revisión"], values: [12, 8, 15] },
  ], {
    x: 0.8, y: 1.8, w: 8.0, h: 4.7, barDir: "col", catAxisLabelFontFace: "Noto Sans",
    catAxisLabelFontSize: 16, valAxisLabelFontFace: "Noto Sans", valAxisLabelFontSize: 14,
    valAxisMinVal: 0, valAxisMaxVal: 20, valAxisMajorUnit: 5,
    chartColors: [colors.accent], showLegend: false, showValue: true,
    dataLabelPosition: "outEnd", dataLabelColor: colors.ink, dataLabelFontFace: "Noto Sans", dataLabelFontSize: 16,
    catAxisLabelColor: colors.ink, valAxisLabelColor: colors.muted,
    valGridLine: { color: "DCE5E5", width: 1 }, showBorder: false,
  });
  slide.addText("Minutos por etapa\n\nDatos sintéticos para comprobar el formato. No son un benchmark.", {
    x: 9.3, y: 2.3, w: 3.2, h: 3.4, fontSize: 22, color: colors.ink, margin: 0,
  });
  slide.addNotes("Fuente: valores sintéticos incluidos en deck.cjs. Unidad: minutos. No usar como evidencia de rendimiento.");
  await deck.writeFile({ fileName: output });
  console.log(output);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
