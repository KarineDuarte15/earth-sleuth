import { Button } from "@/components/ui/button";

import { useState } from "react";
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import type { Lang, SceneAnalysis } from "@/types/sleuth";

interface Props {
  scene: SceneAnalysis;
  lang: Lang;
  color?: string;
}

export default function TrendChart({ scene, lang, color = "var(--brand)" }: Props) {
  const [view, setView] = useState<"anomaly" | "raw">("anomaly");
  const hasTrend = scene.statistics.slope_per_decade !== null;
  const unit = scene.unit;
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const data = scene.series.map((p) => ({
    date: p.date,
    value: p.value,
    anomaly: p.anomaly,
    trend: p.trend_line,
    band: p.ci_low_line !== null && p.ci_high_line !== null
      ? [Math.min(p.ci_low_line, p.ci_high_line), Math.max(p.ci_low_line, p.ci_high_line)] : null,
  }));

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap gap-3 text-[var(--muted)]">
          <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: color }} /> {view === "anomaly" ? t("anomalia mensal", "monthly anomaly") : t("valor mensal", "monthly value")}</span>
          {view === "anomaly" && hasTrend && <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-foreground" /> {t("tendência de Sen", "Sen's trend")}</span>}
          {view === "anomaly" && hasTrend && <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm" style={{ background: `color-mix(in oklab, ${color} 25%, transparent)` }} /> IC 95%</span>}
        </div>
        <div role="tablist" className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--night)] p-0.5">
          {(["anomaly", "raw"] as const).map((v) => (
            <Button variant="plain" size="content" key={v} role="tab" aria-selected={view === v} type="button" onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 font-medium ${view === v ? "bg-[var(--panel-2)] text-foreground" : "text-[var(--muted)]"}`}>
              {v === "anomaly" ? t("Anomalias", "Anomalies") : t("Valores", "Values")}
            </Button>
          ))}
        </div>
      </div>
      <div className="h-[230px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" minTickGap={44} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" width={50} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
              labelStyle={{ color: "var(--ink)" }}
              formatter={(val: unknown, name: string) => {
                if (Array.isArray(val)) return [`${val[0]} a ${val[1]} ${unit}`, name];
                return [val === null || val === undefined ? "sem dado" : `${val} ${unit}`, name];
              }}
            />
            {view === "anomaly" ? (
              <>
                <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 4" />
                {hasTrend && <Area type="linear" dataKey="band" name="IC 95%" stroke="none" fill={color} fillOpacity={0.25} isAnimationActive={false} />}
                <Line type="monotone" dataKey="anomaly" name={t("Anomalia", "Anomaly")} stroke={color} strokeWidth={1.1} strokeOpacity={0.85} dot={false} connectNulls={false} />
                {hasTrend && <Line type="linear" dataKey="trend" name={t("Tendência", "Trend")} stroke="var(--ink)" strokeWidth={2.5} dot={false} animationDuration={1400} />}
              </>
            ) : (
              <Line type="monotone" dataKey="value" name={t("Valor", "Value")} stroke={color} strokeWidth={1.4} dot={false} connectNulls={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
