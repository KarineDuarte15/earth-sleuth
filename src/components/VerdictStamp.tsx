import { Button } from "@/components/ui/button";

import { CheckCircle2, AlertTriangle, HelpCircle, FileSearch, CloudOff } from "lucide-react";
import type { ClueRun, Lang, SceneAnalysis } from "@/types/sleuth";
import CountUp from "./CountUp";

const STAMP = {
  TENDENCIA_REAL: { color: "var(--success)", pt: "Tendência real", en: "Real trend", Icon: CheckCircle2,
    hint_pt: "A mudança é consistente demais para ser só acaso.", hint_en: "The change is too consistent to be chance alone." },
  PODE_SER_RUIDO: { color: "var(--warning)", pt: "Pode ser ruído", en: "Could be noise", Icon: AlertTriangle,
    hint_pt: "Há variação, mas não dá para separá-la do sobe-e-desce natural.", hint_en: "There is variation, but it can't be told apart from natural ups and downs." },
  DADOS_INSUFICIENTES: { color: "var(--muted)", pt: "Dados insuficientes", en: "Insufficient data", Icon: HelpCircle,
    hint_pt: "Série curta ou com lacunas demais para um veredito.", hint_en: "Series too short or too gappy for a verdict." },
} as const;

const fmtP = (p: number | null | undefined) => (p === null || p === undefined ? "n/a" : p < 0.0001 ? "< 0.0001" : `= ${p.toFixed(4)}`);

interface Props {
  run: ClueRun;
  scene: SceneAnalysis;
  label?: string;
  accent: string;
  lang: Lang;
  onOpenEvidence: (scene: SceneAnalysis) => void;
  compact?: boolean;
}

export default function VerdictStamp({ run, scene, label, accent, lang, onOpenEvidence, compact = false }: Props) {
  const { status, statistics: st, quality, geography, provenance, unit } = scene;
  const cfg = STAMP[status];
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const tile = "rounded-xl border border-[var(--line)] bg-[var(--night)] p-3";
  const dirWord = st.direction === "increasing" ? t("subindo", "rising") : st.direction === "decreasing" ? t("caindo", "falling") : t("estável", "flat");

  return (
    <div className="rounded-2xl border bg-[var(--panel)] p-4" style={{ borderColor: `color-mix(in oklab, ${accent} 40%, transparent)` }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {label && <p className="text-xs font-bold" style={{ color: accent }}>{label}</p>}
          <h4 className="text-lg font-bold text-foreground">{geography.region_name}</h4>
          <p className="text-xs text-[var(--muted)]">
            {geography.latitude.toFixed(2)}°, {geography.longitude.toFixed(2)}° · {geography.spatial_resolution} · {scene.period.start_date.slice(0, 4)}–{scene.period.end_date.slice(0, 4)}
          </p>
        </div>
        <div key={`${status}-${st.slope_per_decade}`} className="stamp-in flex items-center gap-2 rounded-md border-[3px] border-double px-4 py-2 text-base font-extrabold uppercase tracking-wide"
          style={{ color: cfg.color, borderColor: cfg.color, background: `color-mix(in oklab, ${cfg.color} 8%, transparent)` }}>
          <cfg.Icon className="h-5 w-5" aria-hidden />
          {t(cfg.pt, cfg.en)}
        </div>
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">{t(cfg.hint_pt, cfg.hint_en)}</p>

      {provenance.fallback_triggered && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-scene-b/40 bg-scene-b/10 px-3 py-2 text-xs text-scene-b">
          <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t(`A API da NASA não respondeu; usamos a cópia salva de ${provenance.extracted_at?.slice(0, 10) ?? "data desconhecida"}.`,
            `NASA API did not respond; using the saved copy from ${provenance.extracted_at?.slice(0, 10) ?? "unknown date"}.`)}
        </p>
      )}

      <dl className={`mt-4 grid grid-cols-2 gap-2 ${compact ? "" : "lg:grid-cols-4"}`}>
        <div className={tile}>
          <dt className="text-[11px] text-[var(--muted)]">{t("O que muda?", "What changes?")}</dt>
          <dd className="mt-1 font-semibold text-foreground">{run.variable.parameter_id}</dd>
          <dd className="text-xs text-[var(--muted)]">{unit}</dd>
        </div>
        <div className={tile}>
          <dt className="text-[11px] text-[var(--muted)]">{t("Para onde?", "Which way?")}</dt>
          <dd className="mt-1 font-semibold text-foreground">{st.slope_per_decade !== null ? dirWord : "n/a"}</dd>
          <dd className="text-xs text-[var(--muted)]">{quality.span_years} {t("anos analisados", "years analysed")}</dd>
        </div>
        <div className={tile}>
          <dt className="text-[11px] text-[var(--muted)]">{t("Quanto por década?", "How much per decade?")}</dt>
          <dd className="mt-1 text-2xl font-bold leading-none" style={{ color: accent }}>
            {st.slope_per_decade !== null ? <CountUp value={st.slope_per_decade} /> : "n/a"}
          </dd>
          <dd className="mt-1 text-xs text-[var(--muted)]">
            {st.ci95_low !== null ? `${unit} · ${t("IC 95%", "95% CI")} ${st.ci95_low} ${t("a", "to")} ${st.ci95_high}` : t("não calculado", "not computed")}
          </dd>
        </div>
        <div className={tile}>
          <dt className="text-[11px] text-[var(--muted)]">{t("É significativo?", "Significant?")}</dt>
          <dd className="mt-1 font-semibold text-foreground">p {fmtP(st.p_value)}</dd>
          <dd className="text-xs text-[var(--muted)]">
            {st.q_value_fdr != null ? `q (FDR) ${fmtP(st.q_value_fdr)}` : `${quality.percent_ausente}% ${t("meses sem dado", "months missing")}`}
          </dd>
        </div>
      </dl>

      <p className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--night)] p-3 text-sm leading-relaxed text-[var(--ink)]">{scene.narrative}</p>
      {st.robustness_note && <p className="mt-2 text-xs text-[var(--muted)]">{st.robustness_note}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>
          {st.variance_inflation !== null
            ? t(`Autocorrelação lag-1 ${st.autocorrelation_lag1 ?? "n/a"} · variância do teste × ${st.variance_inflation}`,
              `Lag-1 autocorrelation ${st.autocorrelation_lag1 ?? "n/a"} · test variance × ${st.variance_inflation}`)
            : t("Teste não executado (regra de qualidade).", "Test not run (quality rule).")}
        </span>
        <Button variant="plain" size="content" type="button" onClick={() => onOpenEvidence(scene)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-1.5 font-semibold text-foreground hover:border-primary">
          <FileSearch className="h-3.5 w-3.5" aria-hidden /> {t("Ver evidências", "View evidence")}
        </Button>
      </div>
    </div>
  );
}
