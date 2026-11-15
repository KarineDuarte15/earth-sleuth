// Ported from api/_lib/catalog.py. Closed clue enum: nothing outside this list reaches NASA POWER.
export interface ServerClueSpec { parameter_id: string; label_pt: string; label_en: string; simple_def_pt: string; simple_def_en: string; unit_fallback: string; data_type_pt: string; data_type_en: string; source_mission: string; communities: string[]; spatial_resolution: string; lat_step: number; lon_step: number; min_year: number; sdg_targets: string[] }
export const CLUE_CATALOG: Record<string, ServerClueSpec> = {
  "T2M": {
    "parameter_id": "T2M",
    "label_pt": "Temperatura média do ar (2 m)",
    "label_en": "Mean air temperature at 2 m",
    "simple_def_pt": "Média mensal da temperatura do ar a 2 metros da superfície.",
    "simple_def_en": "Monthly mean air temperature 2 m above the surface.",
    "unit_fallback": "°C",
    "sdg_targets": [
      "13.1",
      "13.3",
      "4.7"
    ],
    "source_mission": "NASA POWER / GMAO MERRA-2",
    "data_type_pt": "Reanálise (modelo com assimilação de dados), não medição de estação",
    "data_type_en": "Reanalysis (data-assimilating model), not a station measurement",
    "communities": [
      "AG",
      "SB",
      "RE"
    ],
    "spatial_resolution": "0,5° × 0,625° (~55 km)",
    "lat_step": 0.5,
    "lon_step": 0.625,
    "min_year": 1981
  },
  "T2M_MIN": {
    "parameter_id": "T2M_MIN",
    "label_pt": "Temperatura mínima (calor noturno)",
    "label_en": "Minimum air temperature (night heat)",
    "simple_def_pt": "Média mensal das mínimas diárias a 2 m — indica se as noites esquentaram.",
    "simple_def_en": "Monthly mean of daily minimum temperature at 2 m.",
    "unit_fallback": "°C",
    "sdg_targets": [
      "13.1",
      "11.b",
      "4.7"
    ],
    "source_mission": "NASA POWER / GMAO MERRA-2",
    "data_type_pt": "Reanálise (modelo com assimilação de dados), não medição de estação",
    "data_type_en": "Reanalysis (data-assimilating model), not a station measurement",
    "communities": [
      "AG",
      "SB",
      "RE"
    ],
    "spatial_resolution": "0,5° × 0,625° (~55 km)",
    "lat_step": 0.5,
    "lon_step": 0.625,
    "min_year": 1981
  },
  "T2M_MAX": {
    "parameter_id": "T2M_MAX",
    "label_pt": "Temperatura máxima diurna",
    "label_en": "Maximum daytime temperature",
    "simple_def_pt": "Média mensal das máximas diárias (não é o recorde de um único dia).",
    "simple_def_en": "Monthly mean of daily maxima (not a single-day record).",
    "unit_fallback": "°C",
    "sdg_targets": [
      "13.1",
      "11.b",
      "4.7"
    ],
    "source_mission": "NASA POWER / GMAO MERRA-2",
    "data_type_pt": "Reanálise (modelo com assimilação de dados), não medição de estação",
    "data_type_en": "Reanalysis (data-assimilating model), not a station measurement",
    "communities": [
      "AG",
      "SB",
      "RE"
    ],
    "spatial_resolution": "0,5° × 0,625° (~55 km)",
    "lat_step": 0.5,
    "lon_step": 0.625,
    "min_year": 1981
  },
  "PRECTOTCORR": {
    "parameter_id": "PRECTOTCORR",
    "label_pt": "Precipitação corrigida (chuva)",
    "label_en": "Bias-corrected precipitation",
    "simple_def_pt": "Taxa média diária de chuva no mês (é média, não total mensal).",
    "simple_def_en": "Monthly mean daily precipitation rate (a mean, not a monthly total).",
    "unit_fallback": "mm/dia",
    "sdg_targets": [
      "6.4",
      "13.1",
      "11.b",
      "15.3"
    ],
    "source_mission": "NASA POWER / GMAO MERRA-2",
    "data_type_pt": "Reanálise (modelo com assimilação de dados), não medição de estação",
    "data_type_en": "Reanalysis (data-assimilating model), not a station measurement",
    "communities": [
      "AG",
      "SB",
      "RE"
    ],
    "spatial_resolution": "0,5° × 0,625° (~55 km)",
    "lat_step": 0.5,
    "lon_step": 0.625,
    "min_year": 1981
  },
  "GWETROOT": {
    "parameter_id": "GWETROOT",
    "label_pt": "Umidade do solo na zona das raízes",
    "label_en": "Root-zone soil wetness",
    "simple_def_pt": "Fração de saturação do solo até ~1 m (0 = seco, 1 = saturado).",
    "simple_def_en": "Root-zone soil saturation fraction (0 = dry, 1 = saturated).",
    "unit_fallback": "fração 0–1",
    "sdg_targets": [
      "6.4",
      "15.3",
      "13.1"
    ],
    "source_mission": "NASA POWER / GMAO MERRA-2",
    "data_type_pt": "Reanálise (modelo com assimilação de dados), não medição de estação",
    "data_type_en": "Reanalysis (data-assimilating model), not a station measurement",
    "communities": [
      "AG",
      "SB",
      "RE"
    ],
    "spatial_resolution": "0,5° × 0,625° (~55 km)",
    "lat_step": 0.5,
    "lon_step": 0.625,
    "min_year": 1981
  },
  "EVPTRNS": {
    "parameter_id": "EVPTRNS",
    "label_pt": "Evapotranspiração (fluxo de energia)",
    "label_en": "Evapotranspiration energy flux",
    "simple_def_pt": "Energia usada para evaporar e transpirar água na superfície.",
    "simple_def_en": "Surface energy used to evaporate and transpire water.",
    "unit_fallback": "unid. da API",
    "sdg_targets": [
      "6.4",
      "15.3",
      "13.3"
    ],
    "source_mission": "NASA POWER / GMAO MERRA-2",
    "data_type_pt": "Reanálise (modelo com assimilação de dados), não medição de estação",
    "data_type_en": "Reanalysis (data-assimilating model), not a station measurement",
    "communities": [
      "AG",
      "SB",
      "RE"
    ],
    "spatial_resolution": "0,5° × 0,625° (~55 km)",
    "lat_step": 0.5,
    "lon_step": 0.625,
    "min_year": 1981
  }
};
