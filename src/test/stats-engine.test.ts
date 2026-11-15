import { describe, expect, it } from "vitest";
import { analyzeMonthlySeries, benjaminiHochberg } from "@/lib/engine/stats";
import ref from "./fixtures/python-engine-reference.json";

// Fixture produced by the original Python engine (api/_lib/stats_engine.py) on synthetic series.
describe("statistics engine matches the original Python engine", () => {
  for (const c of ref as any[]) {
    it(c.name, () => {
      const res = analyzeMonthlySeries(c.records, c.unit, "pt");
      const e = c.expected;
      expect(res.status).toBe(e.status);
      expect(res.narrative).toBe(e.narrative);
      for (const k of ["slope_per_decade", "ci95_low", "ci95_high", "tau", "z", "variance_inflation", "autocorrelation_lag1"]) {
        const v = (res.statistics as any)[k], ev = e.statistics[k];
        if (ev === null) expect(v).toBeNull(); else expect(v).toBeCloseTo(ev, 3);
      }
      if (e.statistics.p_value !== null) expect(res.statistics.p_value!).toBeCloseTo(e.statistics.p_value, 5);
      expect(res.statistics.robustness_note).toBe(e.statistics.robustness_note);
      expect(res.series.slice(-3)).toEqual(e.series_tail);
    });
  }
  it("trend stamp requires p < 0.05 and CI not crossing zero", () => {
    const up = (ref as any[]).find((c) => c.name === "up");
    expect(analyzeMonthlySeries(up.records, "°C").status).toBe("TENDENCIA_REAL");
  });
  it("benjamini-hochberg q-values", () => {
    expect(benjaminiHochberg([0.01, 0.04, null, 0.03])).toEqual([0.03, 0.04, null, 0.04]);
  });
});
