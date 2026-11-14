/**
 * Tradutor determinístico de perguntas (sem IA, enum fechado).
 * Só sugere pistas do catálogo; a pessoa confirma ou edita a ficha antes de rodar.
 */
export interface InterpretedIntent {
  clues: string[];
  rationale_pt: string;
  rationale_en: string;
  twoScenes: boolean;
  confident: boolean;
}

const has = (q: string, re: RegExp) => re.test(q);

export function interpretQuestion(raw: string): InterpretedIntent {
  const q = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const compare = has(q, /\b(compar\w*|opost\w*|duas regioes|versus|vs\.?|diferente\w*|opposite|compare)\b/);
  const dry = has(q, /\b(sec[oa]s?|secando|seca|umidade|aridez|drier|dry|drought|soil|moisture)\b/);
  const night = has(q, /\b(noite\w*|noturn\w*|minima\w*|night\w*|minimum)\b/);
  const day = has(q, /\b(maxima\w*|diurn\w*|daytime|maximum)\b/);
  const heat = has(q, /\b(quente\w*|calor|temperatura\w*|aquec\w*|warm\w*|hot|heat|temperature)\b/);
  const sat = has(q, /\b(satelite|imerg|gpm)\b/);
  const rain = has(q, /\b(chuv\w*|chove\w*|precipit\w*|rain\w*|precip\w*)\b/);

  const base = (clues: string[], pt: string, en: string): InterpretedIntent => ({
    clues,
    rationale_pt: pt,
    rationale_en: en,
    twoScenes: compare,
    confident: true,
  });

  let intent: InterpretedIntent;
  if (dry) {
    intent = base(
      ["PRECTOTCORR", "GWETROOT", "EVPTRNS"],
      "“Mais seco” não cabe numa variável só: abri um dossiê com chuva, umidade do solo e evapotranspiração. Cada pista é testada separadamente.",
      "“Drier” needs more than one variable: opened a dossier with rain, soil wetness and evapotranspiration, each tested separately."
    );
  } else if (night) {
    intent = base(["T2M_MIN"], "Noites mais quentes → média das temperaturas mínimas (T2M_MIN).", "Warmer nights → mean daily minimum temperature (T2M_MIN).");
  } else if (day) {
    intent = base(["T2M_MAX"], "Dias mais quentes → média das máximas diárias (T2M_MAX).", "Hotter days → mean daily maximum temperature (T2M_MAX).");
  } else if (sat) {
    intent = base(["IMERG_PRECTOT"], "Chuva por satélite → GPM IMERG (desde 2001, ~10 km).", "Satellite rain → GPM IMERG (since 2001, ~10 km).");
  } else if (rain) {
    intent = base(["PRECTOTCORR"], "Chuva → precipitação corrigida MERRA-2 (PRECTOTCORR, desde 1981).", "Rain → MERRA-2 bias-corrected precipitation (PRECTOTCORR, since 1981).");
  } else if (heat) {
    intent = base(["T2M", "T2M_MIN"], "Calor → temperatura média (T2M) e mínima noturna (T2M_MIN).", "Heat → mean (T2M) and nighttime minimum (T2M_MIN) temperature.");
  } else {
    return {
      clues: ["T2M"],
      rationale_pt: "Não reconheci o tema com segurança. Deixei a temperatura média marcada — escolha as pistas na ficha.",
      rationale_en: "Topic not recognised with confidence. Mean temperature is preselected — pick clues in the case file.",
      twoScenes: compare,
      confident: false,
    };
  }
  if (compare) {
    intent.rationale_pt += " Pergunta comparativa: ativei Duas Cenas (mesma pista e período nas duas regiões).";
    intent.rationale_en += " Comparative question: Two Scenes enabled (same clue and period in both regions).";
  }
  return intent;
}
