"""
Catálogo fechado de pistas (enum). Nenhum parâmetro fora daqui chega à API NASA POWER.

- `unit_fallback` só é usado se a resposta da API não trouxer a unidade. A unidade
  exibida no laudo vem, sempre que possível, de `parameters.<ID>.units` da própria
  resposta NASA POWER (evita unidade inventada — RN04).
- `communities`: ordem de tentativa. A API aceita AG, RE e SB; se um parâmetro não
  existir na primeira comunidade, o cliente tenta a próxima.
"""
from typing import TypedDict


class ClueSpec(TypedDict):
    parameter_id: str
    label_pt: str
    label_en: str
    simple_def_pt: str
    simple_def_en: str
    unit_fallback: str
    data_type_pt: str
    data_type_en: str
    source_mission: str
    communities: list[str]
    spatial_resolution: str
    lat_step: float
    lon_step: float
    min_year: int
    sdg_targets: list[str]


_MERRA = dict(
    source_mission="NASA POWER / GMAO MERRA-2",
    data_type_pt="Reanálise (modelo com assimilação de dados), não medição de estação",
    data_type_en="Reanalysis (data-assimilating model), not a station measurement",
    communities=["AG", "SB", "RE"],
    spatial_resolution="0,5° × 0,625° (~55 km)",
    lat_step=0.5,
    lon_step=0.625,
    min_year=1981,
)

CLUE_CATALOG: dict[str, ClueSpec] = {
    "T2M": {
        "parameter_id": "T2M",
        "label_pt": "Temperatura média do ar (2 m)",
        "label_en": "Mean air temperature at 2 m",
        "simple_def_pt": "Média mensal da temperatura do ar a 2 metros da superfície.",
        "simple_def_en": "Monthly mean air temperature 2 m above the surface.",
        "unit_fallback": "°C",
        "sdg_targets": ["13.1", "13.3", "4.7"],
        **_MERRA,
    },
    "T2M_MIN": {
        "parameter_id": "T2M_MIN",
        "label_pt": "Temperatura mínima (calor noturno)",
        "label_en": "Minimum air temperature (night heat)",
        "simple_def_pt": "Média mensal das mínimas diárias a 2 m — indica se as noites esquentaram.",
        "simple_def_en": "Monthly mean of daily minimum temperature at 2 m.",
        "unit_fallback": "°C",
        "sdg_targets": ["13.1", "11.b", "4.7"],
        **_MERRA,
    },
    "T2M_MAX": {
        "parameter_id": "T2M_MAX",
        "label_pt": "Temperatura máxima diurna",
        "label_en": "Maximum daytime temperature",
        "simple_def_pt": "Média mensal das máximas diárias (não é o recorde de um único dia).",
        "simple_def_en": "Monthly mean of daily maxima (not a single-day record).",
        "unit_fallback": "°C",
        "sdg_targets": ["13.1", "11.b", "4.7"],
        **_MERRA,
    },
    "PRECTOTCORR": {
        "parameter_id": "PRECTOTCORR",
        "label_pt": "Precipitação corrigida (chuva)",
        "label_en": "Bias-corrected precipitation",
        "simple_def_pt": "Taxa média diária de chuva no mês (é média, não total mensal).",
        "simple_def_en": "Monthly mean daily precipitation rate (a mean, not a monthly total).",
        "unit_fallback": "mm/dia",
        "sdg_targets": ["6.4", "13.1", "11.b", "15.3"],
        **_MERRA,
    },
    "GWETROOT": {
        "parameter_id": "GWETROOT",
        "label_pt": "Umidade do solo na zona das raízes",
        "label_en": "Root-zone soil wetness",
        "simple_def_pt": "Fração de saturação do solo até ~1 m (0 = seco, 1 = saturado).",
        "simple_def_en": "Root-zone soil saturation fraction (0 = dry, 1 = saturated).",
        "unit_fallback": "fração 0–1",
        "sdg_targets": ["6.4", "15.3", "13.1"],
        **_MERRA,
    },
    "EVPTRNS": {
        "parameter_id": "EVPTRNS",
        "label_pt": "Evapotranspiração (fluxo de energia)",
        "label_en": "Evapotranspiration energy flux",
        "simple_def_pt": "Energia usada para evaporar e transpirar água na superfície.",
        "simple_def_en": "Surface energy used to evaporate and transpire water.",
        "unit_fallback": "unid. da API",
        "sdg_targets": ["6.4", "15.3", "13.3"],
        **_MERRA,
    },
    "IMERG_PRECTOT": {
        "parameter_id": "IMERG_PRECTOT",
        "label_pt": "Precipitação por satélite (GPM IMERG)",
        "label_en": "Satellite precipitation (GPM IMERG)",
        "simple_def_pt": "Estimativa de chuva por constelação de satélites GPM (desde 2001).",
        "simple_def_en": "Precipitation estimate from the GPM satellite constellation (since 2001).",
        "unit_fallback": "unid. da API",
        "data_type_pt": "Estimativa de satélite, não medição de pluviômetro",
        "data_type_en": "Satellite estimate, not a rain-gauge measurement",
        "source_mission": "NASA POWER / GPM IMERG",
        "communities": ["SB", "AG", "RE"],
        "spatial_resolution": "0,1° × 0,1° (~10 km)",
        "lat_step": 0.1,
        "lon_step": 0.1,
        "min_year": 2001,
        "sdg_targets": ["6.4", "13.1", "11.b"],
    },
}
