import { CheckCircle2, Moon } from "lucide-react";
import type { Lang } from "@/types/sleuth";

// Yearly mean of the monthly minimum temperature (T2M_MIN, °C) in Quixeramobim, Ceará, 1981 to 2025,
// computed from the NASA POWER series saved in src/data/demo_cases.json. The headline numbers are the
// app's own result for this case (Seasonal Mann-Kendall + Sen's slope on monthly anomalies).
const YEARS_START = 1981;
const NIGHTS = [
  20.13, 20.23, 20.64, 19.82, 18.94, 19.07, 20.31, 20.05, 19.59, 20.17, 19.75, 19.95, 20.5, 19.88, 19.85,
  19.93, 19.82, 21.27, 20.05, 19.75, 20.14, 20.17, 20.55, 19.93, 20.23, 19.69, 20.04, 19.85, 19.86, 20.69,
  19.85, 20.89, 20.67, 20.73, 20.68, 21.09, 20.48, 20.17, 20.65, 20.79, 20.91, 20.16, 20.7, 21.23, 21.02,
];
const SLOPE_PER_YEAR = 0.0222;

const W = 520, H = 220, PAD = { l: 10, r: 10, t: 18, b: 26 };
const yMin = 18.7, yMax = 21.5;
const x = (i: number) => PAD.l + (i / (NIGHTS.length - 1)) * (W - PAD.l - PAD.r);
const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
const mean = NIGHTS.reduce((a, b) => a + b, 0) / NIGHTS.length;
const mid = (NIGHTS.length - 1) / 2;
const trendAt = (i: number) => mean + SLOPE_PER_YEAR * (i - mid);

const line = NIGHTS.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
const area = `${line} L${x(NIGHTS.length - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z`;

export default function HeroPreview({ lang }: { lang: Lang }) {
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(60%_60%_at_60%_40%,var(--glow),transparent_70%)]" />

      <figure className="surface float relative overflow-hidden rounded-3xl p-5 sm:p-6">
        <figcaption className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
              <Moon className="h-3.5 w-3.5" aria-hidden /> {t("Dossiê de exemplo", "Example case file")}
            </p>
            <p className="mt-1.5 font-serif text-lg font-bold text-foreground sm:text-xl">{t("As noites estão esquentando?", "Are nights getting warmer?")}</p>
            <p className="text-sm text-[var(--muted)]">Quixeramobim, Ceará · 1981 {t("a", "to")} 2025</p>
          </div>
          <span className="stamp-late inline-flex shrink-0 items-center gap-1.5 rounded-md border-[3px] border-double border-[var(--success)] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--success)] sm:text-xs">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {t("Tendência real", "Real trend")}
          </span>
        </figcaption>

        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img"
          aria-label={t("Média anual das temperaturas mínimas em Quixeramobim de 1981 a 2025, com linha de tendência subindo.",
            "Yearly mean minimum temperature in Quixeramobim from 1981 to 2025, with a rising trend line.")}>
          <defs>
            <linearGradient id="hp-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="hp-trend" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--brand-2)" />
              <stop offset="100%" stopColor="var(--orange)" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)}
              stroke="var(--line)" strokeDasharray="3 6" />
          ))}
          <path d={area} fill="url(#hp-area)" className="fade-up delay-4" />
          <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
            className="draw" style={{ ["--len" as string]: 1400 }} />
          <line x1={x(0)} y1={y(trendAt(0))} x2={x(NIGHTS.length - 1)} y2={y(trendAt(NIGHTS.length - 1))}
            stroke="url(#hp-trend)" strokeWidth="4" strokeLinecap="round" className="draw draw-late" style={{ ["--len" as string]: 540 }} />
          <circle cx={x(NIGHTS.length - 1)} cy={y(trendAt(NIGHTS.length - 1))} r="6" fill="var(--orange)" className="pop-late" />
          {[0, 19, 29, 44].map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === 44 ? "end" : "middle"}
              className="fill-[var(--muted)] font-mono text-[11px]">{YEARS_START + i}</text>
          ))}
        </svg>

        <dl className="mt-3 grid grid-cols-3 gap-2">
          {[
            { k: t("Por década", "Per decade"), v: "+0.22 °C", c: "text-[var(--orange)]" },
            { k: t("Significância", "Significance"), v: "p < 0.0001", c: "text-foreground" },
            { k: t("Meses analisados", "Months analysed"), v: "540", c: "text-foreground" },
          ].map((s, i) => (
            <div key={s.k} className={`fade-up rounded-xl border border-[var(--line)] bg-[var(--panel-2)]/60 px-3 py-2 delay-${i + 2}`}>
              <dt className="text-[11px] text-[var(--muted)]">{s.k}</dt>
              <dd className={`whitespace-nowrap font-serif text-[15px] font-bold tabular-nums sm:text-lg ${s.c}`}>{s.v}</dd>
            </div>
          ))}
        </dl>
      </figure>

      <div className="float-slow absolute -bottom-5 -right-3 hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs shadow-lg sm:block">
        <span className="font-semibold text-foreground">NASA POWER</span>
        <span className="block text-[var(--muted)]">MERRA-2 · T2M_MIN</span>
      </div>
    </div>
  );
}
