"use client";

import { CheckCircle2, AlertTriangle, HelpCircle, FileSearch, CloudOff } from "lucide-react";
import { ClueRun, Lang, SceneAnalysis } from "@/types/sleuth";

const STAMP = {
  TENDENCIA_REAL: {
    box: "bg-emerald-50 border-emerald-300 text-emerald-950",
    stamp: "border-emerald-700 text-emerald-800",
    pt: "Tendência real", en: "Significant trend", Icon: CheckCircle2,
  },
  PODE_SER_RUIDO: {
    box: "bg-amber-50 border-amber-300 text-amber-950",
    stamp: "border-amber-700 text-amber-800",
    pt: "Pode ser ruído", en: "Could be noise", Icon: AlertTriangle,
  },
  DADOS_INSUFICIENTES: {
    box: "bg-slate-100 border-slate-300 text-slate-800",
    stamp: "border-slate-600 text-slate-700",
    pt: "Dados insuficientes", en: "Insufficient data", Icon: HelpCircle,
  },
} as const;

const fmt = (x: number | null | undefined, d = 3) =>
  x === null || x === undefined ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(d)}`;
const fmtP = (p: number | null | undefined) =>
  p === null || p === undefined ? "—" : p < 0.0001 ? "< 0.0001" : `= ${p.toFixed(4)}`;

interface Props {
  run: ClueRun;
  scene: SceneAnalysis;
  label?: string;
  lang: Lang;
  onOpenEvidence: (scene: SceneAnalysis) => void;
}

export default function VerdictStamp({ run, scene, label, lang, onOpenEvidence }: Props) {
  const { status, statistics: st, quality, geography, provenance, unit } = scene;
  const cfg = STAMP[status];
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const cell = "rounded-lg border border-black/5 bg-white/80 p-2.5";

  return (
    <div className={`rounded-xl border p-4 ${cfg.box}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {label && <p className="text-xs font-semibold opacity-75">{label}</p>}
          <h4 className="text-base font-bold">{geography.region_name}</h4>
          <p className="text-xs opacity-80">
            {geography.latitude.toFixed(3)}°, {geography.longitude.toFixed(3)}° · {geography.spatial_resolution}
          </p>
        </div>
        <div className={`-rotate-2 flex items-center gap-1.5 rounded-md border-[3px] border-double bg-white/70 px-3 py-1.5 text-sm font-extrabold ${cfg.stamp}`}>
          <cfg.Icon className="h-4 w-4" aria-hidden />
          {t(cfg.pt, cfg.en)}
        </div>
      </div>

      {provenance.fallback_triggered && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t(
            `A API da NASA não respondeu; usamos a cópia salva de ${provenance.extracted_at?.slice(0, 10) ?? "data desconhecida"}${provenance.cached_location ? ` (${provenance.cached_location})` : ""}.`,
            `NASA API did not respond; using the saved copy from ${provenance.extracted_at?.slice(0, 10) ?? "unknown date"}.`
          )}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={cell}>
          <dt className="text-[11px] font-semibold text-slate-500">{t("O que muda?", "What?")}</dt>
          <dd className="mt-0.5 text-xs font-bold text-slate-900">{run.variable.parameter_id}</dd>
          <dd className="text-[11px] text-slate-600">{unit}</dd>
        </div>
        <div className={cell}>
          <dt className="text-[11px] font-semibold text-slate-500">{t("Onde e quando?", "Where and when?")}</dt>
          <dd className="mt-0.5 truncate text-xs font-bold text-slate-900">{geography.region_name.split("/")[0]}</dd>
          <dd className="text-[11px] text-slate-600">{quality.span_years} {t("anos", "years")}</dd>
        </div>
        <div className={cell}>
          <dt className="text-[11px] font-semibold text-slate-500">{t("Quanto por década?", "How much per decade?")}</dt>
          <dd className="mt-0.5 text-xs font-bold text-slate-900">{fmt(st.slope_per_decade)} {st.slope_per_decade !== null ? unit : ""}</dd>
          <dd className="text-[11px] text-slate-600">
            {st.ci95_low !== null ? `IC 95%: ${fmt(st.ci95_low)} a ${fmt(st.ci95_high)}` : t("não calculado", "not computed")}
          </dd>
        </div>
        <div className={cell}>
          <dt className="text-[11px] font-semibold text-slate-500">{t("É significativo?", "Significant?")}</dt>
          <dd className="mt-0.5 text-xs font-bold text-slate-900">p {fmtP(st.p_value)}</dd>
          <dd className="text-[11px] text-slate-600">
            {st.q_value_fdr != null ? `q (FDR) ${fmtP(st.q_value_fdr)}` : `${t("lacunas", "gaps")}: ${quality.percent_ausente}%`}
          </dd>
        </div>
      </dl>

      <p className="mt-3 rounded-lg border border-black/5 bg-white/75 p-3 text-sm leading-relaxed">{scene.narrative}</p>
      {st.robustness_note && <p className="mt-2 text-xs opacity-85">{st.robustness_note}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="opacity-75">
          {st.variance_inflation !== null
            ? t(
                `Autocorrelação lag-1: ${st.autocorrelation_lag1 ?? "—"} · variância do teste × ${st.variance_inflation}`,
                `Lag-1 autocorrelation: ${st.autocorrelation_lag1 ?? "—"} · test variance × ${st.variance_inflation}`
              )
            : t("Teste não executado (regra de qualidade).", "Test not run (quality rule).")}
        </span>
        <button
          type="button"
          onClick={() => onOpenEvidence(scene)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#12284a] px-3 py-1.5 font-semibold text-white hover:bg-[#1c3a66]"
        >
          <FileSearch className="h-3.5 w-3.5" aria-hidden />
          {t("Ver evidências", "View evidence")}
        </button>
      </div>
    </div>
  );
}
