import type { InvestigationResponse, SeriesPoint } from "@/types/sleuth";

export function canExportComparison(result: InvestigationResponse) {
  return result.runs.some(r => r.scene_a && r.scene_b);
}
export function comparisonRows(a: SeriesPoint[], b: SeriesPoint[]) {
  const left = new Map(a.map(p => [p.date, p]));
  const right = new Map(b.map(p => [p.date, p]));
  return [...new Set([...left.keys(), ...right.keys()])].sort().map(date => ({ date, a: left.get(date), b: right.get(date) }));
}