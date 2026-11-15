import { z } from "zod";
import type { InvestigationResponse } from "@/types/sleuth";

const text = z.string().max(4000);
const number = z.number().finite().nullable();
const scene = z.object({
  geography: z.object({ region_name: text, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), spatial_resolution: text }),
  unit: text,
  status: z.enum(["TENDENCIA_REAL", "PODE_SER_RUIDO", "DADOS_INSUFICIENTES"]),
  quality: z.object({ n_total: z.number().int().nonnegative(), n_valid: z.number().int().nonnegative(), percent_ausente: z.number(), passes_quality_gate: z.boolean(), alert: text.nullable() }),
  period: z.object({ start_date: text, end_date: text, frequency: text, baseline_climatology: text }),
  statistics: z.object({ methodology: text, seasonal_adjustment: text, autocorrelation_method: text, slope_per_decade: number, ci95_low: number, ci95_high: number, p_value: number, q_value_fdr: number.optional(), direction: z.enum(["increasing", "decreasing", "flat", "insufficient"]), robustness_note: text }),
  provenance: z.object({ dataset_id: text, source_mission: text, dataset_version: text.nullable(), request_url: text.nullable(), extracted_at: text.nullable(), data_mode: z.enum(["live", "cache", "fallback_cache"]), fallback_triggered: z.boolean(), fallback_reason: text.nullable(), cached_location: text.nullable(), credits: text }),
  series: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}$/), value: number, anomaly: number, trend_line: number })).max(600),
});
export const synthesisInput = z.object({
  question: z.string().trim().min(3).max(2000),
  lang: z.enum(["pt", "en"]),
  evidence: z.object({
    case_id: z.string().max(200),
    n_tests: z.number().int().nonnegative(),
    runs: z.array(z.object({
      variable: z.object({ parameter_id: text, label_pt: text, label_en: text }),
      scene_a: scene.nullable(), scene_b: scene.nullable(),
      comparison: z.object({ same_variable_and_period: z.boolean(), opposite_directions: z.boolean(), both_significant: z.boolean(), confirmed_opposite_trends: z.boolean(), summary_pt: text, summary_en: text }).nullable(),
      errors: z.array(text).max(20),
    })).min(1).max(7).refine(runs => runs.some(r => r.scene_a && r.scene_b), "A/B evidence is required"),
  }),
});
export const synthesisOutput = z.object({
  summary: z.string().min(1).max(6000),
  patterns: z.array(z.string().min(1).max(3000)).min(1).max(8),
  caveats: z.array(z.string().min(1).max(3000)).min(1).max(8),
  next_steps: z.array(z.string().min(1).max(3000)).min(1).max(8),
});
export type ComparisonSynthesis = z.infer<typeof synthesisOutput>;
export function prepareSynthesis(result: InvestigationResponse, question: string, lang: "pt" | "en") {
  return synthesisInput.parse({ question, lang, evidence: result });
}