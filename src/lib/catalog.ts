import type { ClueSpec, ScenePoint } from "@/types/sleuth";

// Espelho do catálogo do back-end (api/_lib/catalog.py). A unidade final vem da API NASA.
const MERRA = {
  source_mission: "NASA POWER / MERRA-2",
  data_type_pt: "Reanálise",
  data_type_en: "Reanalysis",
  spatial_resolution: "0,5° × 0,625° (~55 km)",
  lat_step: 0.5,
  lon_step: 0.625,
  min_year: 1981,
};

export const FRONTEND_CLUES: ClueSpec[] = [
  {
    parameter_id: "T2M",
    label_pt: "Temperatura média do ar",
    label_en: "Mean air temperature",
    simple_def_pt: "Média mensal da temperatura do ar a 2 m da superfície.",
    simple_def_en: "Monthly mean air temperature 2 m above the surface.",
    unit_hint: "°C",
    sdg_targets: ["13.1", "13.3", "4.7"],
    ...MERRA,
  },
  {
    parameter_id: "T2M_MIN",
    label_pt: "Temperatura mínima (noites)",
    label_en: "Minimum temperature (nights)",
    simple_def_pt: "Média mensal das mínimas diárias: as noites esquentaram?",
    simple_def_en: "Monthly mean of daily minima: are nights warming?",
    unit_hint: "°C",
    sdg_targets: ["13.1", "11.b", "4.7"],
    ...MERRA,
  },
  {
    parameter_id: "T2M_MAX",
    label_pt: "Temperatura máxima (dias)",
    label_en: "Maximum temperature (days)",
    simple_def_pt: "Média mensal das máximas diárias, não o recorde de um dia.",
    simple_def_en: "Monthly mean of daily maxima, not a single-day record.",
    unit_hint: "°C",
    sdg_targets: ["13.1", "11.b", "4.7"],
    ...MERRA,
  },
  {
    parameter_id: "PRECTOTCORR",
    label_pt: "Chuva (precipitação corrigida)",
    label_en: "Rain (bias-corrected precipitation)",
    simple_def_pt: "Média diária de chuva no mês. É média, não total do mês.",
    simple_def_en: "Mean daily rain in the month. A mean, not a monthly total.",
    unit_hint: "mm/dia",
    sdg_targets: ["6.4", "13.1", "11.b", "15.3"],
    ...MERRA,
  },
  {
    parameter_id: "GWETROOT",
    label_pt: "Umidade do solo nas raízes",
    label_en: "Root-zone soil wetness",
    simple_def_pt: "Quanto o solo até ~1 m está saturado (0 = seco, 1 = encharcado).",
    simple_def_en: "How saturated the soil is down to ~1 m (0 = dry, 1 = soaked).",
    unit_hint: "fração 0–1",
    sdg_targets: ["6.4", "15.3", "13.1"],
    ...MERRA,
  },
  {
    parameter_id: "EVPTRNS",
    label_pt: "Evapotranspiração",
    label_en: "Evapotranspiration",
    simple_def_pt: "Energia usada para evaporar e transpirar água na superfície.",
    simple_def_en: "Surface energy used to evaporate and transpire water.",
    unit_hint: "unid. da API",
    sdg_targets: ["6.4", "15.3", "13.3"],
    ...MERRA,
  },
];

export const clueById = (id: string) => FRONTEND_CLUES.find((c) => c.parameter_id === id);

export interface PresetCase {
  id: string;
  title_pt: string;
  title_en: string;
  question_pt: string;
  question_en: string;
  clues: string[];
  twoScenes: boolean;
  sceneA: ScenePoint;
  sceneB?: ScenePoint;
  ods: string;
}

export const QUIXERAMOBIM: ScenePoint = {
  region_name: "Quixeramobim / Sertão Central (CE)",
  latitude: -5.198,
  longitude: -39.295,
};
export const PELOTAS: ScenePoint = {
  region_name: "Pelotas / Costa Sul (RS)",
  latitude: -31.765,
  longitude: -52.337,
};

export const PRESET_CASES: PresetCase[] = [
  {
    id: "a",
    title_pt: "Caso A · Noites mais quentes",
    title_en: "Case A · Warmer nights",
    question_pt: "As noites no Sertão Central do Ceará estão ficando mais quentes desde 1981?",
    question_en: "Are nights in Central Ceará getting warmer since 1981?",
    clues: ["T2M_MIN"],
    twoScenes: false,
    sceneA: QUIXERAMOBIM,
    ods: "ODS 13 e 4",
  },
  {
    id: "b",
    title_pt: "Caso B · A terra está mais seca?",
    title_en: "Case B · Is the land drier?",
    question_pt: "A terra está ficando mais seca no Semiárido do Ceará?",
    question_en: "Is the land getting drier in Ceará's semi-arid region?",
    clues: ["PRECTOTCORR", "GWETROOT", "EVPTRNS"],
    twoScenes: false,
    sceneA: QUIXERAMOBIM,
    ods: "ODS 6 e 15",
  },
  {
    id: "c",
    title_pt: "Caso C · Duas Cenas",
    title_en: "Case C · Two Scenes",
    question_pt: "A chuva muda em direções diferentes no Semiárido do Ceará e no Sul do Brasil?",
    question_en: "Does rain change in different directions in semi-arid Ceará and Southern Brazil?",
    clues: ["PRECTOTCORR"],
    twoScenes: true,
    sceneA: QUIXERAMOBIM,
    sceneB: PELOTAS,
    ods: "ODS 13 e 6",
  },
];

export const REGION_SHORTCUTS: ScenePoint[] = [
  QUIXERAMOBIM,
  { region_name: "Fortaleza (CE)", latitude: -3.7319, longitude: -38.5267 },
  { region_name: "Petrolina / Vale do São Francisco (PE)", latitude: -9.3891, longitude: -40.5027 },
  { region_name: "Manaus / Amazônia Central (AM)", latitude: -3.119, longitude: -60.0217 },
  { region_name: "Foz do Iguaçu / Oeste do Paraná (PR)", latitude: -25.5469, longitude: -54.5882 },
  PELOTAS,
];
