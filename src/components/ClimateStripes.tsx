
import { useMemo, useState } from "react";
import type { Lang, SeriesPoint } from "@/types/sleuth";

export type StripePalette = "temp" | "water" | "energy";

const PALETTES: Record<StripePalette, { neg: [number, number, number]; pos: [number, number, number]; negPt: string; posPt: string }> = {
  temp: { neg: [33, 102, 172], pos: [178, 24, 43], negPt: "mais frio", posPt: "mais quente" },
  water: { neg: [140, 81, 10], pos: [1, 102, 94], negPt: "mais seco", posPt: "mais úmido" },
  energy: { neg: [94, 60, 153], pos: [230, 97, 1], negPt: "abaixo da média", posPt: "acima da média" },
};

function mix(c: [number, number, number], t: number) {
  const base = [236, 240, 245];
  const [r, g, b] = base.map((v, i) => Math.round(v + (c[i] - v) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

interface Props {
  series: SeriesPoint[];
  unit: string;
  palette: StripePalette;
  lang: Lang;
}

/** Faixas anuais: cada barra é a média do ano menos a média de todos os anos. */
export default function ClimateStripes({ series, unit, palette, lang }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const years = useMemo(() => {
    const by = new Map<number, number[]>();
    for (const p of series) {
      if (p.value === null) continue;
      if (!by.has(p.year)) by.set(p.year, []);
      by.get(p.year)!.push(p.value);
    }
    const means = [...by.entries()]
      .filter(([, v]) => v.length >= 10)
      .map(([year, v]) => ({ year, mean: v.reduce((a, b) => a + b, 0) / v.length }))
      .sort((a, b) => a.year - b.year);
    const overall = means.reduce((a, b) => a + b.mean, 0) / Math.max(means.length, 1);
    const out = means.map((m) => ({ year: m.year, anomaly: m.mean - overall }));
    const maxAbs = Math.max(...out.map((o) => Math.abs(o.anomaly)), 1e-9);
    return out.map((o) => ({ ...o, t: o.anomaly / maxAbs }));
  }, [series]);

  if (years.length < 2) return null;
  const pal = PALETTES[palette];
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const shown = active !== null ? years[active] : null;
  const fmt = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(Math.abs(x) < 0.1 ? 3 : 2)}`;

  return (
    <figure className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <figcaption className="font-semibold text-[var(--ink)]">{t("Cada faixa é um ano", "Each stripe is one year")}</figcaption>
        <span className="min-h-4 text-[var(--muted)]" aria-live="polite">
          {shown
            ? `${shown.year}: ${fmt(shown.anomaly)} ${unit} ${t("em relação à média do período", "vs. period mean")}`
            : t(`Passe o mouse ou toque numa faixa · ${pal.negPt} ↔ ${pal.posPt}`, "Hover or tap a stripe")}
        </span>
      </div>
      <div className="flex h-16 overflow-hidden rounded-md" role="list">
        {years.map((y, i) => (
          <button
            key={y.year}
            type="button"
            role="listitem"
            aria-label={`${y.year}: ${fmt(y.anomaly)} ${unit}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className="h-full flex-1 transition-transform hover:scale-y-110 focus:scale-y-110 focus:outline-none"
            style={{
              background: y.t >= 0 ? mix(pal.pos, y.t) : mix(pal.neg, -y.t),
              boxShadow: active === i ? "inset 0 0 0 2px #fff" : undefined,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
        <span>{years[0].year}</span>
        <span>{years[years.length - 1].year}</span>
      </div>
    </figure>
  );
}
