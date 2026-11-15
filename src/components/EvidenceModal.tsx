import { Button } from "@/components/ui/button";

import { useEffect } from "react";
import { X, Download, ShieldCheck } from "lucide-react";
import type { ClueRun, Lang, SceneAnalysis } from "@/types/sleuth";

interface Props {
  run: ClueRun;
  scene: SceneAnalysis;
  lang: Lang;
  onClose: () => void;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EvidenceModal({ run, scene, lang, onClose }: Props) {
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const slug = `earth-sleuth_${run.variable.parameter_id}_${scene.geography.region_name.split("/")[0].trim().replace(/\W+/g, "_")}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const csv = () => {
    const head = "date,year,month,value,anomaly,trend_line,ci_low_line,ci_high_line";
    const rows = scene.series.map((r) =>
      [r.date, r.year, r.month, r.value, r.anomaly, r.trend_line, r.ci_low_line, r.ci_high_line].map((v) => v ?? "").join(",")
    );
    download(`${slug}.csv`, [head, ...rows].join("\n"), "text/csv;charset=utf-8");
  };
  const json = () => download(`${slug}.json`, JSON.stringify({ variable: run.variable, scene }, null, 2), "application/json");
  const p = scene.provenance;
  const st = scene.statistics;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div><span className="font-semibold text-foreground">{k}:</span> {v ?? "—"}</div>
  );

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-foreground/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="ev-title"
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" aria-hidden /> {t("Fonte e método", "Source and method")}
            </p>
            <h3 id="ev-title" className="mt-1 text-lg font-bold text-foreground">
              {run.variable.parameter_id} em {scene.geography.region_name}
            </h3>
          </div>
          <Button variant="plain" size="content" type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" aria-label={t("Fechar", "Close")}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-4 space-y-3 text-xs text-muted-foreground">
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-secondary p-3.5 sm:grid-cols-2">
            <Row k={t("Fonte", "Source")} v={p.source_mission} />
            <Row k={t("Tipo de dado", "Data type")} v={p.data_type} />
            <Row k={t("Nome oficial", "Official name")} v={p.longname} />
            <Row k={t("Unidade (API)", "Unit (API)")} v={p.units_raw ?? scene.unit} />
            <Row k={t("Origem desta execução", "Data path")} v={{ live: t("API ao vivo", "Live API"), cache: t("Cópia salva", "Saved copy"), fallback_cache: t("Cópia salva (API falhou)", "Saved copy (API failed)") }[p.data_mode]} />
            <Row k={t("Extraído em", "Extracted at")} v={p.extracted_at} />
            <Row k={t("Escala espacial", "Spatial scale")} v={scene.geography.spatial_resolution} />
            <Row k={t("Meses válidos", "Valid months")} v={`${scene.quality.n_valid}/${scene.quality.n_total} (${scene.quality.percent_ausente}% ${t("ausentes", "missing")})`} />
            <Row k={t("Teste", "Test")} v={st.methodology} />
            <Row k={t("Dependência serial", "Serial dependence")} v={st.autocorrelation_method} />
            <Row k="Kendall τ / Z" v={st.tau !== null ? `${st.tau} / ${st.z}` : null} />
            <Row k={t("Versão da API / app", "API / app version")} v={`${p.dataset_version ?? "—"} / ${p.app_version}`} />
          </div>

          <div className="rounded-xl border border-primary bg-sky-50 p-3.5 text-primary">
            <p className="mb-1 font-semibold">{t("Limites desta análise", "Limits of this analysis")}</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>{t("Mann-Kendall detecta tendência monotônica; não prova a causa (por exemplo, não mostra que o El Niño causou a mudança).", "Mann-Kendall detects a monotonic trend; it does not prove the cause.")}</li>
              <li>{t("Reanálise e estimativa de satélite não são medição de estação ou pluviômetro de rua.", "Reanalysis and satellite estimates are not station or rain-gauge measurements.")}</li>
              <li>{t("O p-valor é a probabilidade de um resultado tão extremo se não houvesse tendência — não é a “chance de ser ruído”.", "The p-value is the probability of a result this extreme if there were no trend — not the “chance of noise”.")}</li>
              <li>{t("Sem significância não quer dizer sem mudança: séries curtas têm pouco poder estatístico.", "No significance does not mean no change: short series have low statistical power.")}</li>
              <li>{t("Com várias pistas ou regiões testadas juntas, olhe também o q-valor (FDR de Benjamini-Hochberg).", "With several clues or regions tested together, also check the q-value (Benjamini-Hochberg FDR).")}</li>
            </ul>
          </div>

          <div>
            <p className="mb-1 font-semibold text-foreground">{t("Consulta de origem", "Source request")}</p>
            <code className="block break-all rounded-lg bg-secondary p-2.5 text-[11px] text-primary">{p.request_url}</code>
          </div>
          <p className="text-[11px] text-muted-foreground">{p.credits}</p>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="plain" size="content" type="button" onClick={csv} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-secondary">
            <Download className="h-4 w-4" aria-hidden /> {t("Baixar CSV", "Download CSV")}
          </Button>
          <Button variant="plain" size="content" type="button" onClick={json} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Download className="h-4 w-4" aria-hidden /> {t("Baixar JSON do laudo", "Download report JSON")}
          </Button>
        </div>
      </div>
    </div>
  );
}
