export type Lang = "pt" | "en";
export type DataMode = "auto" | "cache" | "live";
export type VerdictStatus = "TENDENCIA_REAL" | "PODE_SER_RUIDO" | "DADOS_INSUFICIENTES";

export interface ClueSpec {
  parameter_id: string;
  label_pt: string;
  label_en: string;
  simple_def_pt: string;
  simple_def_en: string;
  unit_hint: string;
  source_mission: string;
  data_type_pt: string;
  spatial_resolution: string;
  lat_step: number;
  lon_step: number;
  min_year: number;
  sdg_targets: string[];
}

export interface ScenePoint {
  region_name: string;
  latitude: number;
  longitude: number;
}

export interface SeriesPoint {
  date: string;
  year: number;
  month: number;
  value: number | null;
  anomaly: number | null;
  trend_line: number | null;
  ci_low_line: number | null;
  ci_high_line: number | null;
}

export interface SceneAnalysis {
  geography: ScenePoint & { spatial_resolution: string; lat_step: number; lon_step: number };
  provenance: {
    dataset_id: string;
    longname: string | null;
    units_raw: string | null;
    source_mission: string;
    data_type: string;
    dataset_version: string | null;
    request_url: string | null;
    extracted_at: string | null;
    data_mode: "live" | "cache" | "fallback_cache";
    fallback_triggered: boolean;
    fallback_reason: string | null;
    cached_location: string | null;
    app_version: string;
    credits: string;
  };
  unit: string;
  status: VerdictStatus;
  quality: {
    n_total: number;
    n_valid: number;
    percent_ausente: number;
    span_years: number;
    passes_quality_gate: boolean;
    alert: string | null;
  };
  period: { start_date: string; end_date: string; frequency: string; baseline_climatology: string };
  statistics: {
    methodology: string;
    seasonal_adjustment: string;
    autocorrelation_method: string;
    autocorrelation_lag1: number | null;
    variance_inflation: number | null;
    slope_per_decade: number | null;
    ci95_low: number | null;
    ci95_high: number | null;
    p_value: number | null;
    q_value_fdr?: number | null;
    tau: number | null;
    z: number | null;
    direction: "increasing" | "decreasing" | "flat" | "insufficient";
    robustness_note: string;
  };
  narrative: string;
  series: SeriesPoint[];
}

export interface ClueRun {
  variable: {
    parameter_id: string;
    label_pt: string;
    label_en: string;
    simple_def_pt: string;
    simple_def_en: string;
    source_mission: string;
    sdg_targets: string[];
  };
  scene_a: SceneAnalysis | null;
  scene_b: SceneAnalysis | null;
  comparison: {
    same_variable_and_period: boolean;
    opposite_directions: boolean;
    both_significant: boolean;
    confirmed_opposite_trends: boolean;
    summary_pt: string;
    summary_en: string;
  } | null;
  errors: string[];
}

export interface InvestigationResponse {
  case_id: string;
  question: string;
  n_tests: number;
  runs: ClueRun[];
}
