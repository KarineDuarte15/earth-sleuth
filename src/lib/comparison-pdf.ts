import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import font from "@/assets/report-unicode.ttf.asset.json";
import { canExportComparison, comparisonRows } from "./comparison-report";
import type { InvestigationResponse, Lang, SceneAnalysis } from "@/types/sleuth";

export async function createComparisonPdf(result: InvestigationResponse, lang: Lang): Promise<Blob> {
  if (!canExportComparison(result)) throw new Error("A comparação precisa de resultados para as cenas A e B.");
  const response = await fetch(font.url);
  if (!response.ok) throw new Error("Não foi possível carregar a fonte do relatório.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("report.ttf", btoa(binary)); doc.addFont("report.ttf", "Report", "normal"); doc.setFont("Report");
  const t = (pt: string, en: string) => lang === "pt" ? pt : en;
  const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext("2d");
  const color = (token: string): [number, number, number] => {
    if (!ctx) return [0, 0, 0];
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim(); ctx.fillRect(0, 0, 1, 1);
    const c = ctx.getImageData(0, 0, 1, 1).data; return [c[0], c[1], c[2]];
  };
  const ink = color("--deep-blue"), blue = color("--electric-blue"), white = color("--brand-white");
  const val = (n: number | null | undefined) => n == null ? "n/a" : String(n);
  let y = 22;
  function line(text: string, size = 10) {
    doc.setFontSize(size); doc.setTextColor(...ink);
    const lines: string[] = doc.splitTextToSize(text, 180);
    const height = lines.length * (size * .45 + 1) + 2;
    if (height < 253 && y + height > 275) { doc.addPage(); y = 22; }
    for (const row of lines) { if (y > 275) { doc.addPage(); y = 22; } doc.text(row, 15, y); y += size * .45 + 1; }
    y += 2;
  }
  function table(head: string[], body: string[][]) {
    autoTable(doc, { startY: y, head: [head], body, margin: { top: 20, bottom: 18, left: 15, right: 15 },
      styles: { font: "Report", fontStyle: "normal", fontSize: 8, cellPadding: 2, overflow: "linebreak", textColor: ink },
      headStyles: { fontStyle: "normal", fillColor: blue, textColor: white }, rowPageBreak: "avoid",
      didDrawPage: data => { y = data.cursor?.y ?? y; },
    }); y += 8;
  }
  line("Earth Sleuth", 22);
  line(t("Relatório de comparação · Cenas A e B", "Comparison report · Scenes A and B"), 15);
  line(result.question, 12);
  line(`${t("Investigação", "Investigation")}: ${result.case_id}`);
  line(`${t("Exportado em", "Exported at")}: ${new Date().toISOString()}`);
  line(t("Relatório dos resultados examinados. Alterações posteriores na ficha não modificam este relatório.", "Report of the examined results. Later changes to the investigation form do not modify this report."));
  for (const [runIndex, run] of result.runs.entries()) {
    if (runIndex > 0) { doc.addPage(); y = 22; }
    line(`${run.variable.parameter_id} · ${lang === "pt" ? run.variable.label_pt : run.variable.label_en}`, 14);
    if (run.comparison) line(lang === "pt" ? run.comparison.summary_pt : run.comparison.summary_en);
    for (const error of run.errors) line(`${t("Alerta", "Warning")}: ${error}`);
    const scenes: [string, SceneAnalysis | null][] = [["A", run.scene_a], ["B", run.scene_b]];
    for (const [label, s] of scenes) {
      if (!s) { line(`${t("Cena", "Scene")} ${label}: ${t("resultado indisponível", "result unavailable")}`); continue; }
      line(`${t("Cena", "Scene")} ${label} · ${s.geography.region_name}`, 12);
      line(`${s.geography.latitude}, ${s.geography.longitude} · ${s.geography.spatial_resolution}`);
      line(`${s.period.start_date} a/to ${s.period.end_date} · ${s.period.frequency} · ${s.unit}`);
      line(s.narrative);
      table([t("Indicador", "Metric"), t("Resultado", "Result")], [
        [t("Veredito", "Verdict"), s.status], [t("Inclinação por década", "Slope per decade"), `${val(s.statistics.slope_per_decade)} ${s.unit}`],
        ["IC 95% / CI 95%", `${val(s.statistics.ci95_low)} a/to ${val(s.statistics.ci95_high)}`], ["p", val(s.statistics.p_value)],
        ["q (FDR)", val(s.statistics.q_value_fdr)], ["Tau", val(s.statistics.tau)], ["Z", val(s.statistics.z)],
        [t("Dados válidos / total", "Valid / total observations"), `${s.quality.n_valid} / ${s.quality.n_total}`],
        [t("Ausentes (%)", "Missing (%)"), val(s.quality.percent_ausente)],
      ]);
      line(`${t("Método", "Method")}: ${s.statistics.methodology}; ${s.statistics.seasonal_adjustment}; ${s.statistics.autocorrelation_method}`);
      line(`${t("Climatologia de referência", "Baseline climatology")}: ${s.period.baseline_climatology}`);
      line(s.statistics.robustness_note);
      if (s.quality.alert) line(s.quality.alert);
      const p = s.provenance;
      line(t("Fonte NASA e rastreabilidade", "NASA source and provenance"), 11);
      line(`${p.source_mission} · ${p.dataset_id} · ${p.longname ?? "n/a"}`);
      line(`${t("Versão", "Version")}: ${p.dataset_version ?? "n/a"}; ${t("Unidade original", "Original unit")}: ${p.units_raw ?? "n/a"}`);
      line(`${t("Modo dos dados", "Data mode")}: ${p.data_mode}; ${t("Extraído em", "Extracted at")}: ${p.extracted_at ?? "n/a"}`);
      if (p.cached_location) line(`${t("Local da cópia salva", "Cached location")}: ${p.cached_location}`);
      if (p.fallback_triggered) line(`${t("Uso da reserva", "Fallback")}: ${p.fallback_reason ?? "n/a"}`);
      line(`${t("Consulta NASA", "NASA request")}: ${p.request_url ?? t("URL não registrada na cópia salva", "URL not recorded in cached data")}`, 8);
      line(p.credits, 8);
    }
    if (run.scene_a || run.scene_b) {
      doc.addPage(); y = 22;
      line(`${run.variable.parameter_id} · ${t("Dados mensais completos", "Complete monthly data")}`, 14);
      line(t("Valores ausentes são indicados por n/a. As séries são alinhadas pela data, não pela posição.", "Missing values are shown as n/a. Series are aligned by date, not position."));
      table([t("Data", "Date"), "A", "B", t("Anomalia A", "Anomaly A"), t("Anomalia B", "Anomaly B"), t("Tendência A", "Trend A"), t("Tendência B", "Trend B")],
        comparisonRows(run.scene_a?.series ?? [], run.scene_b?.series ?? []).map(r => [r.date, val(r.a?.value), val(r.b?.value), val(r.a?.anomaly), val(r.b?.anomaly), val(r.a?.trend_line), val(r.b?.trend_line)]));
    }
  }
  doc.addPage(); y = 22;
  line(t("Referências e limitações", "References and limitations"), 16);
  line("NASA POWER: https://power.larc.nasa.gov/");
  const sources = result.runs.flatMap(r => [r.scene_a, r.scene_b]).filter((s): s is SceneAnalysis => !!s).map(s => s.provenance.source_mission).join(" ");
  if (/MERRA/i.test(sources)) line("GMAO MERRA-2: https://gmao.gsfc.nasa.gov/gmao-products/merra-2/");
  if (/IMERG|GPM/i.test(sources)) line("GPM IMERG: https://gpm.nasa.gov/data/imerg");
  line(t("Uma tendência descreve o passado e não é previsão climática nem prova de causa. Dados em grade não representam medições em uma rua específica. Projeto independente, sem endosso da NASA.", "A trend describes the past and is not a climate forecast or proof of causation. Gridded data do not represent measurements on a specific street. Independent project, not endorsed by NASA."));
  for (let i = 1; i <= doc.getNumberOfPages(); i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...ink); doc.text(`Earth Sleuth · ${i} / ${doc.getNumberOfPages()}`, 15, 289); }
  doc.setProperties({ title: "Earth Sleuth: A/B", subject: result.question, author: "Earth Sleuth" });
  return doc.output("blob");
}