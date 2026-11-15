/** Investigation orchestration (port of api/index.py /api/analyze). Server-only. */
import { CLUE_CATALOG } from "./catalog";
import { fetchScene, prettyUnit, type Fetched } from "./nasa";
import { analyzeMonthlySeries, benjaminiHochberg } from "./stats";

export const APP_VERSION = "1.1.0";
const CREDITS = "These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program.";

export interface SceneInput { region_name: string; latitude: number; longitude: number }
export interface AnalyzeRequest {
  question: string; parameter_ids: string[]; start_year: number; end_year: number;
  mode: "auto" | "cache" | "live"; lang: "pt" | "en"; scene_a: SceneInput; scene_b: SceneInput | null;
}

export class ValidationError extends Error {}

const num = (v: unknown, lo: number, hi: number, name: string) => {
  const n = Number(v);
  if (typeof v !== "number" && typeof v !== "string") throw new ValidationError(`${name}: valor inválido`);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new ValidationError(`${name}: deve estar entre ${lo} e ${hi}`);
  return n;
};
const scene = (s: unknown, name: string): SceneInput => {
  if (!s || typeof s !== "object") throw new ValidationError(`${name}: obrigatório`);
  const o = s as Record<string, unknown>;
  const rn = typeof o.region_name === "string" ? o.region_name : "";
  if (rn.length < 1 || rn.length > 120) throw new ValidationError(`${name}.region_name: 1–120 caracteres`);
  return { region_name: rn, latitude: num(o.latitude, -90, 90, `${name}.latitude`), longitude: num(o.longitude, -180, 180, `${name}.longitude`) };
};

export function parseAnalyzeRequest(raw: unknown): AnalyzeRequest {
  const o = (raw ?? {}) as Record<string, unknown>;
  const question = o.question === undefined ? "Investigação climática local" : String(o.question);
  if (question.length > 400) throw new ValidationError("question: máximo 400 caracteres");
  const ids = o.parameter_ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 7 || !ids.every((x) => typeof x === "string"))
    throw new ValidationError("parameter_ids: 1 a 7 pistas");
  const mode = (o.mode ?? "auto") as AnalyzeRequest["mode"];
  if (!["auto", "cache", "live"].includes(mode)) throw new ValidationError("mode inválido");
  const lang = (o.lang ?? "pt") as AnalyzeRequest["lang"];
  if (!["pt", "en"].includes(lang)) throw new ValidationError("lang inválido");
  return {
    question, parameter_ids: ids as string[],
    start_year: o.start_year === undefined ? 1981 : Math.trunc(num(o.start_year, 1981, 2025, "start_year")),
    end_year: o.end_year === undefined ? 2025 : Math.trunc(num(o.end_year, 1981, 2025, "end_year")),
    mode, lang, scene_a: scene(o.scene_a, "scene_a"), scene_b: o.scene_b == null ? null : scene(o.scene_b, "scene_b"),
  };
}

function sceneResult(s: SceneInput, pid: string, f: Fetched, lang: "pt" | "en") {
  const spec = CLUE_CATALOG[pid];
  const unit = prettyUnit(f.units_raw, spec.unit_fallback);
  const analysis = analyzeMonthlySeries(f.records, unit, lang);
  return {
    geography: { ...s, spatial_resolution: spec.spatial_resolution, lat_step: spec.lat_step, lon_step: spec.lon_step },
    provenance: {
      dataset_id: pid, longname: f.longname ?? null, units_raw: f.units_raw ?? null, source_mission: spec.source_mission,
      data_type: lang === "pt" ? spec.data_type_pt : spec.data_type_en, dataset_version: f.dataset_version ?? null,
      request_url: f.request_url ?? null, extracted_at: f.extracted_at ?? null, data_mode: f.data_mode!,
      fallback_triggered: f.fallback_triggered ?? false, fallback_reason: f.fallback_reason ?? null,
      cached_location: f.cached_location ?? null, app_version: APP_VERSION, credits: CREDITS,
    },
    unit, ...analysis,
  };
}
type SceneOut = ReturnType<typeof sceneResult> & { statistics: { q_value_fdr?: number | null } };

export async function runAnalysis(req: AnalyzeRequest) {
  const unknown = req.parameter_ids.filter((p) => !CLUE_CATALOG[p]);
  if (unknown.length) throw new ValidationError(`Pista fora do catálogo: ${unknown.join(", ")}`);
  if (req.end_year < req.start_year) throw new ValidationError("O ano final precisa ser maior ou igual ao inicial.");
  const pids = [...new Set(req.parameter_ids)];
  const scenes = [req.scene_a, ...(req.scene_b ? [req.scene_b] : [])];
  const fetchedAll = await Promise.all(scenes.map((s) => fetchScene(pids, s.latitude, s.longitude, req.start_year, req.end_year, req.mode)));

  const runs = pids.map((pid) => {
    const spec = CLUE_CATALOG[pid];
    const run = {
      variable: { parameter_id: pid, label_pt: spec.label_pt, label_en: spec.label_en, simple_def_pt: spec.simple_def_pt, simple_def_en: spec.simple_def_en, source_mission: spec.source_mission, sdg_targets: spec.sdg_targets },
      scene_a: null as SceneOut | null, scene_b: null as SceneOut | null,
      comparison: null as null | Record<string, unknown>, errors: [] as string[],
    };
    (["scene_a", "scene_b"] as const).forEach((key, i) => {
      if (!scenes[i]) return;
      const f = fetchedAll[i][pid];
      if ("error" in f) { run.errors.push(`${scenes[i].region_name}: ${f.error}`); return; }
      try { run[key] = sceneResult(scenes[i], pid, f, req.lang); }
      catch (e) { run.errors.push(`${scenes[i].region_name}: ${e instanceof Error ? e.message : e}`); }
    });
    const a = run.scene_a, b = run.scene_b;
    if (a && b) {
      const da = a.statistics.direction, db = b.statistics.direction;
      const sigA = a.status === "TENDENCIA_REAL", sigB = b.status === "TENDENCIA_REAL";
      const opposite = (da === "increasing" && db === "decreasing") || (da === "decreasing" && db === "increasing");
      const same = a.period.start_date === b.period.start_date && a.period.end_date === b.period.end_date;
      let pt: string, en: string;
      if (opposite && sigA && sigB) { pt = "Sinais opostos, e os dois são estatisticamente significativos."; en = "Opposite signs, and both are statistically significant."; }
      else if (opposite) { pt = "As estimativas têm sinais opostos, mas ao menos uma não é significativa: não dá para afirmar tendências opostas."; en = "Estimates have opposite signs, but at least one is not significant: opposite trends cannot be claimed."; }
      else { pt = "As duas regiões não apresentam sinais opostos para esta pista e período."; en = "The two regions do not show opposite signs for this clue and period."; }
      run.comparison = { same_variable_and_period: same, opposite_directions: opposite, both_significant: sigA && sigB, confirmed_opposite_trends: opposite && sigA && sigB, summary_pt: pt, summary_en: en };
    }
    return run;
  });

  const tests = runs.flatMap((r) => (["scene_a", "scene_b"] as const).filter((k) => r[k]).map((k) => r[k]!));
  const q = benjaminiHochberg(tests.map((t) => t.statistics.p_value));
  tests.forEach((t, i) => { t.statistics.q_value_fdr = tests.length > 1 ? q[i] : null; });

  return { case_id: crypto.randomUUID().replace(/-/g, "").slice(0, 8), question: req.question, request: req, n_tests: tests.length, runs };
}

export const healthPayload = () => ({ status: "ok", version: APP_VERSION, engine: "Seasonal Mann-Kendall + Hirsch-Slack + Sen sazonal" });
export const catalogPayload = () => ({ clues: Object.values(CLUE_CATALOG) });
