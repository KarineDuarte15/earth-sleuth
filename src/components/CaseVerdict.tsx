import { CheckCircle2, AlertTriangle, HelpCircle, ChevronDown, MapPin, Ruler, Sigma, Search } from "lucide-react";
import type { ClueRun, Lang, SceneAnalysis } from "@/types/sleuth";
import { friendlyOf, plainVerdict } from "@/lib/friendly";
import TrendChart from "./TrendChart";
import ClimateStripes, { type StripePalette } from "./ClimateStripes";
import VerdictStamp from "./VerdictStamp";

const PALETTE: Record<string, StripePalette> = {
  T2M: "temp", T2M_MIN: "temp", T2M_MAX: "temp", PRECTOTCORR: "water", GWETROOT: "water", EVPTRNS: "energy",
};

const STAMP = {
  TENDENCIA_REAL: { color: "var(--success)", pt: "Tendência real", en: "Real trend", Icon: CheckCircle2 },
  PODE_SER_RUIDO: { color: "var(--warning)", pt: "Pode ser ruído", en: "Could be noise", Icon: AlertTriangle },
  DADOS_INSUFICIENTES: { color: "var(--muted)", pt: "Poucos dados", en: "Not enough data", Icon: HelpCircle },
} as const;

interface Props {
  run: ClueRun;
  scene: SceneAnalysis;
  lang: Lang;
  accent: string;
  label?: string;
  onOpenEvidence: (scene: SceneAnalysis) => void;
  /** Side-by-side layout (two places): keep the answer cards in two columns. */
  compact?: boolean;
}

export default function CaseVerdict({ run, scene, lang, accent, label, onOpenEvidence, compact = false }: Props) {
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const id = run.variable.parameter_id;
  const f = friendlyOf(id);
  const v = plainVerdict(id, scene, lang);
  const cfg = STAMP[scene.status];

  const answers = [
    { I: Search, q: t("O que muda?", "What is changing?"), a: f ? f.short[lang] : t(run.variable.label_pt, run.variable.label_en), d: f?.what[lang] },
    { I: MapPin, q: t("Onde?", "Where?"), a: scene.geography.region_name.split("/")[0].trim(),
      d: t(`Um quadrado de ~55 km em volta de ${scene.geography.latitude.toFixed(2)}°, ${scene.geography.longitude.toFixed(2)}°.`, `A ~55 km square around ${scene.geography.latitude.toFixed(2)}°, ${scene.geography.longitude.toFixed(2)}°.`) },
    { I: Ruler, q: t("Quanto?", "How much?"), a: v.insufficient ? "n/a" : v.perDecade, d: v.total ? t(`No período todo: ${v.total}.`, `Over the whole period: ${v.total}.`) : t("Mudança pequena demais para medir.", "Too small a change to measure.") },
    { I: Sigma, q: t("É significativo?", "Is it significant?"), a: v.insufficient ? "n/a" : v.significant ? t("Sim", "Yes") : t("Não (ainda)", "Not (yet)"),
      d: v.insufficient ? "" : t(`Se nada estivesse mudando, um padrão assim apareceria por acaso ${v.chance} vezes.`, `If nothing were changing, a pattern like this would show up by chance ${v.chance} times.`) },
  ];

  return (
    <article className="reveal overflow-hidden rounded-3xl border bg-[var(--panel)]" style={{ borderColor: `color-mix(in oklab, ${cfg.color} 45%, var(--line))` }}>
      <div className="relative p-5 sm:p-7" style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${cfg.color} 12%, transparent), transparent 60%)` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {label && <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>{label}</p>}
            <p className="text-sm font-semibold text-[var(--muted)]">{f ? f.question[lang] : t(run.variable.label_pt, run.variable.label_en)}</p>
            <h3 className="mt-1 text-2xl font-bold leading-tight text-foreground sm:text-[28px]">{v.headline}</h3>
          </div>
          <span key={`${scene.status}-${scene.statistics.slope_per_decade}`} className="stamp-in inline-flex items-center gap-2 rounded-md border-[3px] border-double px-3.5 py-2 text-sm font-extrabold uppercase tracking-wider"
            style={{ color: cfg.color, borderColor: cfg.color, background: `color-mix(in oklab, ${cfg.color} 10%, transparent)` }}>
            <cfg.Icon className="h-5 w-5" aria-hidden /> {t(cfg.pt, cfg.en)}
          </span>
        </div>
        {!v.insufficient && !v.significant && (
          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
            {t("Os números sobem e descem demais para separar uma tendência do vai-e-vem natural. Isso também é uma descoberta: com mais anos de dados, a resposta pode aparecer.",
              "The numbers wiggle too much to tell a trend apart from natural ups and downs. That is still a finding: with more years of data, the answer may show up.")}
          </p>
        )}
        {v.insufficient && <p className="mt-3 text-sm text-[var(--muted)]">{scene.quality.alert ?? t("Série curta ou com falhas demais.", "Series too short or with too many gaps.")}</p>}

        <dl className={`mt-5 grid gap-3 sm:grid-cols-2 ${compact ? "" : "lg:grid-cols-4"}`}>
          {answers.map(({ I, q, a, d }) => (
            <div key={q} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)]/80 p-4 backdrop-blur">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"><I className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden />{q}</dt>
              <dd className="mt-1.5 font-serif text-lg font-bold leading-snug text-foreground">{a}</dd>
              {d && <dd className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{d}</dd>}
            </div>
          ))}
        </dl>
      </div>

      {!v.insufficient && (
        <div className="space-y-3 border-t border-[var(--line)] p-4 sm:p-6">
          <ClimateStripes series={scene.series} unit={scene.unit} palette={PALETTE[id] ?? "temp"} lang={lang} />
          <TrendChart scene={scene} lang={lang} color={accent} />
        </div>
      )}

      <details className="group border-t border-[var(--line)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-foreground hover:bg-[var(--panel-2)]/60 sm:px-7">
          <span>{t("Para os curiosos: a estatística completa", "For the curious: the full statistics")}</span>
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-4 pb-5 sm:px-6">
          <VerdictStamp run={run} scene={scene} accent={accent} lang={lang} onOpenEvidence={onOpenEvidence} />
        </div>
      </details>
    </article>
  );
}
