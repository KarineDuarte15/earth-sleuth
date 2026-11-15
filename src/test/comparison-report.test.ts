import { describe, expect, it } from "vitest";
import { canExportComparison, comparisonRows } from "@/lib/comparison-report";
import type { InvestigationResponse, SceneAnalysis, SeriesPoint } from "@/types/sleuth";

const point = (date: string, value: number | null): SeriesPoint => ({ date, value, year: 2025, month: 1, anomaly: null, trend_line: null, ci_low_line: null, ci_high_line: null });
describe("Comparison export", () => {
  it("aligns monthly A/B data by date and preserves zero and missing values", () => {
    const rows = comparisonRows([point("2025-02", null), point("2025-01", 0)], [point("2025-03", 12), point("2025-01", 9)]);
    expect(rows.map(r => r.date)).toEqual(["2025-01", "2025-02", "2025-03"]);
    expect(rows[0].a?.value).toBe(0); expect(rows[0].b?.value).toBe(9);
    expect(rows[1].a?.value).toBeNull(); expect(rows[1].b).toBeUndefined();
  });
  it("requires actual results for both scenes before export", () => {
    const result = { runs: [{ scene_a: {} as SceneAnalysis, scene_b: null }] } as InvestigationResponse;
    expect(canExportComparison(result)).toBe(false);
    result.runs[0].scene_b = {} as SceneAnalysis;
    expect(canExportComparison(result)).toBe(true);
  });
});