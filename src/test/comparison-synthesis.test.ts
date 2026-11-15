import { describe, expect, it } from "vitest";
import { synthesisInput, synthesisOutput } from "@/lib/comparison-synthesis";

const scene = {
  geography: { region_name: "Quixeramobim", latitude: -5.198, longitude: -39.295, spatial_resolution: "0.5 x 0.625" },
  unit: "°C", status: "PODE_SER_RUIDO",
  quality: { n_total: 192, n_valid: 192, percent_ausente: 0, passes_quality_gate: true, alert: null },
  period: { start_date: "2010-01", end_date: "2025-12", frequency: "monthly", baseline_climatology: "2010-2025" },
  statistics: { methodology: "Seasonal Mann-Kendall", seasonal_adjustment: "monthly anomalies", autocorrelation_method: "variance correction", slope_per_decade: 0.28, ci95_low: -0.1, ci95_high: 0.5, p_value: 0.1, q_value_fdr: 0.2, direction: "increasing", robustness_note: "not significant" },
  provenance: { dataset_id: "MERRA2", source_mission: "NASA POWER / MERRA-2", dataset_version: null, request_url: "https://power.larc.nasa.gov/api/temporal/monthly/point", extracted_at: null, data_mode: "live", fallback_triggered: false, fallback_reason: null, cached_location: null, credits: "NASA POWER" },
  series: [{ date: "2010-01", value: 0, anomaly: null, trend_line: null }],
};
const input = () => ({ question: "Quais padrões diferem entre A e B?", lang: "pt", evidence: { case_id: "test", n_tests: 2, runs: [{ variable: { parameter_id: "T2M_MIN", label_pt: "Noites", label_en: "Nights" }, scene_a: scene, scene_b: { ...scene, geography: { ...scene.geography, region_name: "Fortaleza" } }, comparison: null, errors: [] }] } });

describe("Comparison AI evidence", () => {
  it("preserves both locations, statistical caveats, monthly zeros/nulls and actual NASA provenance", () => {
    const parsed = synthesisInput.parse(input());
    expect(parsed.evidence.runs[0].scene_a?.statistics.slope_per_decade).toBe(0.28);
    expect(parsed.evidence.runs[0].scene_a?.status).toBe("PODE_SER_RUIDO");
    expect(parsed.evidence.runs[0].scene_b?.geography.region_name).toBe("Fortaleza");
    expect(parsed.evidence.runs[0].scene_a?.series[0]).toEqual({ date: "2010-01", value: 0, anomaly: null, trend_line: null });
    expect(parsed.evidence.runs[0].scene_a?.provenance.request_url).toBe(scene.provenance.request_url);
  });
  it("rejects evidence without an actual A/B pair", () => {
    expect(synthesisInput.safeParse({ ...input(), evidence: { ...input().evidence, runs: [{ ...input().evidence.runs[0], scene_b: null }] } }).success).toBe(false);
  });
  it("requires patterns, caveats and next steps from the model", () => {
    expect(synthesisOutput.safeParse({ summary: "Result", patterns: ["A increases"], caveats: [], next_steps: ["Check local stations"] }).success).toBe(false);
    expect(synthesisOutput.safeParse({ summary: "Result", patterns: ["A increases"], caveats: ["Not significant"], next_steps: ["Check local stations"] }).success).toBe(true);
  });
});