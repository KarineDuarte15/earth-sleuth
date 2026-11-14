"use client";

import { useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from "recharts";
import { Lang, SceneAnalysis } from "@/types/sleuth";

interface Props {
  scene: SceneAnalysis;
  lang: Lang;
  color?: string;
}

export default function TrendChart({ scene, lang, color = "#1a9bc7" }: Props) {
  const [view, setView] = useState<"anomaly" | "raw">("anomaly");
  const hasTrend = scene.statistics.slope_per_decade !== null;
  const unit = scene.unit;
  const data = scene.series.map((p) => ({
    date: p.date,
    value: p.value,
    anomaly: p.anomaly,
    trend: p.trend_line,
    band:
      p.ci_low_line !== null && p.ci_high_line !== null
        ? [Math.min(p.ci_low_line, p.ci_high_line), Math.max(p.ci_low_line, p.ci_high_line)]
        : null,
  }));
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {scene.period.start_date} a {scene.period.end_date} · {t("climatologia de referência", "baseline")} {scene.period.baseline_climatology}
        </p>
        <div role="tablist" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
          {(["anomaly", "raw"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 font-medium ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            >
              {v === "anomaly" ? t("Anomalias e tendência", "Anomalies and trend") : t("Valores originais", "Raw values")}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis tick={{ fontSize: 11 }} width={56}
              label={{ value: unit, angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#64748b" } }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(val: unknown, name: string) => {
                if (Array.isArray(val)) return [`${val[0]} a ${val[1]} ${unit}`, name];
                return [val === null || val === undefined ? "sem dado" : `${val} ${unit}`, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {view === "anomaly" ? (
              <>
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                {hasTrend && (
                  <Area type="linear" dataKey="band" name={t("Faixa do IC 95%", "95% CI band")} stroke="none" fill={color} fillOpacity={0.15} />
                )}
                <Line type="monotone" dataKey="anomaly" name={t("Anomalia mensal", "Monthly anomaly")} stroke={color} strokeWidth={1.2} dot={false} connectNulls={false} />
                {hasTrend && (
                  <Line type="linear" dataKey="trend" name={t("Tendência de Sen", "Sen's slope")} stroke="#12284a" strokeWidth={2.2} dot={false} />
                )}
              </>
            ) : (
              <Line type="monotone" dataKey="value" name={t("Valor mensal", "Monthly value")} stroke={color} strokeWidth={1.5} dot={false} connectNulls={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
