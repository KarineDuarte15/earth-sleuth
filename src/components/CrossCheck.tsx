"use client";

import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Lang, SceneAnalysis } from "@/types/sleuth";

type Result =
  | { available: false; reason: string }
  | {
      available: true; source: string; credits: string; unit: string; sign_only: boolean;
      verdict: "agree" | "magnitude" | "sign_only" | "diverge" | "both_noise"; summary: string;
      slope_per_decade: number; ci95_low: number; ci95_high: number;
    };

const TONE = {
  agree: "border-emerald-300 bg-emerald-50 text-emerald-950",
  sign_only: "border-emerald-300 bg-emerald-50 text-emerald-950",
  both_noise: "border-slate-300 bg-slate-50 text-slate-800",
  magnitude: "border-amber-300 bg-amber-50 text-amber-950",
  diverge: "border-red-300 bg-red-50 text-red-950",
} as const;

const fmt = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(3)}`;

export default function CrossCheck({ parameterId, scene, lang }: { parameterId: string; scene: SceneAnalysis; lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const st = scene.statistics;
  if (scene.status === "DADOS_INSUFICIENTES" || st.slope_per_decade === null || st.ci95_low === null || st.ci95_high === null) return null;

  const run = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/cross-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parameter_id: parameterId, lang,
          scene: { region_name: scene.geography.region_name, latitude: scene.geography.latitude, longitude: scene.geography.longitude },
          start_year: Number(scene.period.start_date.slice(0, 4)),
          end_year: Number(scene.period.end_date.slice(0, 4)),
          nasa: { status: scene.status, slope_per_decade: st.slope_per_decade, ci95_low: st.ci95_low, ci95_high: st.ci95_high },
        }),
      });
      const body = await r.json().catch(() => ({}));
      setRes(r.ok ? body : { available: false, reason: typeof body.detail === "string" ? body.detail : `HTTP ${r.status}` });
    } catch {
      setRes({ available: false, reason: t("2ª fonte indisponível.", "Second source unavailable.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 text-sm">
      {!res && (
        <button type="button" onClick={run} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
          {busy ? t("Consultando 2ª fonte…", "Checking second source…") : t("Validar com 2ª fonte", "Validate with 2nd source")}
        </button>
      )}
      {res && !res.available && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">{res.reason}</p>}
      {res && res.available && (
        <div className={`space-y-1 rounded-lg border px-3 py-2 ${TONE[res.verdict]}`} role="status">
          <p className="font-semibold">
            {res.source}: {fmt(res.slope_per_decade)} {res.unit}/{t("déc", "dec")} [{fmt(res.ci95_low)}; {fmt(res.ci95_high)}]
          </p>
          <p>{res.summary}</p>
          <p className="text-xs opacity-70">{res.credits}</p>
        </div>
      )}
    </div>
  );
}
