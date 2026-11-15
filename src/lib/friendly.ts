// Plain-language layer over the NASA POWER variables and the statistics engine output.
// The engine stays the single source of truth; this file only turns its numbers into sentences.
import type { Lang, SceneAnalysis } from "@/types/sleuth";

export interface FriendlyClue {
  id: string;
  emoji: string;
  question: { pt: string; en: string };
  short: { pt: string; en: string };
  what: { pt: string; en: string };
  up: { pt: string; en: string };
  down: { pt: string; en: string };
  flat: { pt: string; en: string };
  /** Turn an engine slope per decade into a human-sized number and unit. */
  human: (slopePerDecade: number, lang: Lang) => { value: number; unit: string };
}

const deg = (s: number) => ({ value: s, unit: "°C" });

export const FRIENDLY: Record<string, FriendlyClue> = {
  T2M_MIN: {
    id: "T2M_MIN", emoji: "🌙",
    question: { pt: "As noites estão mais quentes?", en: "Are nights getting warmer?" },
    short: { pt: "Noites", en: "Nights" },
    what: { pt: "A temperatura mais baixa de cada dia, que costuma acontecer de madrugada.", en: "The lowest temperature of each day, usually reached before dawn." },
    up: { pt: "As noites estão ficando mais quentes", en: "Nights are getting warmer" },
    down: { pt: "As noites estão ficando mais frias", en: "Nights are getting cooler" },
    flat: { pt: "A temperatura das noites quase não mudou", en: "Night temperatures barely changed" },
    human: (s) => deg(s),
  },
  T2M_MAX: {
    id: "T2M_MAX", emoji: "☀️",
    question: { pt: "Os dias estão mais quentes?", en: "Are days getting hotter?" },
    short: { pt: "Dias", en: "Days" },
    what: { pt: "A temperatura mais alta de cada dia, normalmente no meio da tarde.", en: "The highest temperature of each day, usually mid-afternoon." },
    up: { pt: "Os dias estão ficando mais quentes", en: "Days are getting hotter" },
    down: { pt: "Os dias estão ficando mais frescos", en: "Days are getting cooler" },
    flat: { pt: "A temperatura dos dias quase não mudou", en: "Daytime temperatures barely changed" },
    human: (s) => deg(s),
  },
  T2M: {
    id: "T2M", emoji: "🌡️",
    question: { pt: "Está esquentando no geral?", en: "Is it getting warmer overall?" },
    short: { pt: "Temperatura", en: "Temperature" },
    what: { pt: "A temperatura média do ar, a 2 metros do chão, somando dia e noite.", en: "The average air temperature 2 m above the ground, day and night together." },
    up: { pt: "Está esquentando", en: "It is getting warmer" },
    down: { pt: "Está esfriando", en: "It is getting cooler" },
    flat: { pt: "A temperatura média quase não mudou", en: "The average temperature barely changed" },
    human: (s) => deg(s),
  },
  PRECTOTCORR: {
    id: "PRECTOTCORR", emoji: "🌧️",
    question: { pt: "Está chovendo mais ou menos?", en: "Is it raining more or less?" },
    short: { pt: "Chuva", en: "Rain" },
    what: { pt: "Quanta chuva cai, em média, por dia. Multiplicamos por 365 para mostrar o total do ano.", en: "How much rain falls on an average day. We multiply by 365 to show the yearly total." },
    up: { pt: "Está chovendo mais", en: "It is getting rainier" },
    down: { pt: "Está chovendo menos", en: "It is getting less rain" },
    flat: { pt: "A chuva quase não mudou", en: "Rainfall barely changed" },
    human: (s, lang) => ({ value: s * 365, unit: lang === "pt" ? "mm/ano" : "mm/year" }),
  },
  GWETROOT: {
    id: "GWETROOT", emoji: "🌱",
    question: { pt: "O solo está secando?", en: "Is the soil drying out?" },
    short: { pt: "Umidade do solo", en: "Soil moisture" },
    what: { pt: "Quanta água há no solo onde ficam as raízes, de 0 (seco) a 100% (encharcado).", en: "How much water sits in the soil where roots live, from 0 (dry) to 100% (soaked)." },
    up: { pt: "O solo está ficando mais úmido", en: "The soil is getting wetter" },
    down: { pt: "O solo está secando", en: "The soil is drying out" },
    flat: { pt: "A umidade do solo quase não mudou", en: "Soil moisture barely changed" },
    human: (s, lang) => ({ value: s * 100, unit: lang === "pt" ? "pontos percentuais" : "percentage points" }),
  },
  EVPTRNS: {
    id: "EVPTRNS", emoji: "💨",
    question: { pt: "Está evaporando mais água?", en: "Is more water evaporating?" },
    short: { pt: "Evaporação", en: "Evaporation" },
    what: { pt: "A energia gasta para a água sair do solo e das plantas para o ar (evapotranspiração).", en: "The energy used to move water from soil and plants into the air (evapotranspiration)." },
    up: { pt: "Está evaporando mais água", en: "More water is evaporating" },
    down: { pt: "Está evaporando menos água", en: "Less water is evaporating" },
    flat: { pt: "A evaporação quase não mudou", en: "Evaporation barely changed" },
    human: (s) => ({ value: s, unit: "MJ/m²/day" }),
  },
};

export const friendlyOf = (id: string) => FRIENDLY[id];

const UNIT_EN: Record<string, string> = { "mm/dia": "mm/day", "fração 0–1": "fraction 0 to 1", "fração 0-1": "fraction 0 to 1" };
export const unitFor = (unit: string, lang: Lang) => (lang === "en" ? UNIT_EN[unit] ?? unit : unit);

export function fmtNum(v: number, lang: Lang, digits = 2) {
  const abs = Math.abs(v);
  const d = abs >= 100 ? 0 : abs >= 10 ? 1 : digits;
  const s = v.toFixed(d);
  return lang === "pt" ? s.replace(".", ",") : s;
}
export const signed = (v: number, lang: Lang, digits = 2) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtNum(Math.abs(v), lang, digits)}`;

/** "1 in N" phrasing of a p-value, rounded to friendly numbers. */
export function chanceSentence(p: number | null, lang: Lang) {
  if (p === null) return lang === "pt" ? "Não deu para calcular a chance." : "The chance could not be computed.";
  if (p < 0.0001) return lang === "pt" ? "menos de 1 em 10.000" : "less than 1 in 10,000";
  const n = 1 / p;
  const nice = n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : n >= 10 ? Math.round(n) : Math.max(1, Math.round(n * 10) / 10);
  const txt = lang === "pt" ? nice.toLocaleString("pt-BR") : nice.toLocaleString("en-US");
  return lang === "pt" ? `cerca de 1 em ${txt}` : `about 1 in ${txt}`;
}

export interface PlainVerdict {
  headline: string;
  perDecade: string;
  total: string | null;
  years: number;
  chance: string;
  significant: boolean;
  insufficient: boolean;
}

export function plainVerdict(id: string, scene: SceneAnalysis, lang: Lang): PlainVerdict {
  const f = FRIENDLY[id];
  const st = scene.statistics;
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const years = Math.max(1, scene.quality.span_years);
  const place = scene.geography.region_name.split("/")[0].trim();
  if (scene.status === "DADOS_INSUFICIENTES" || st.slope_per_decade === null) {
    return { headline: t(`Ainda não dá para dizer nada sobre ${place}`, `Not enough evidence yet for ${place}`), perDecade: "", total: null, years,
      chance: "", significant: false, insufficient: true };
  }
  const significant = scene.status === "TENDENCIA_REAL";
  const h = f ? f.human(st.slope_per_decade, lang) : { value: st.slope_per_decade, unit: unitFor(scene.unit, lang) };
  const tiny = Math.abs(h.value) < 0.005;
  const dir = tiny ? "flat" : st.slope_per_decade > 0 ? "up" : "down";
  const base = f ? f[dir][lang] : t("Houve mudança", "There was a change");
  const headline = significant
    ? t(`${base} em ${place}`, `${base} in ${place}`)
    : t(`${place}: nenhuma tendência clara (ainda)`, `${place}: no clear trend (yet)`);
  const perDecade = `${signed(h.value, lang)} ${h.unit} ${t("por década", "per decade")}`;
  const totalV = (h.value * years) / 10;
  const total = tiny ? null : `${signed(totalV, lang)} ${h.unit} ${t(`em ${years} anos`, `over ${years} years`)}`;
  return { headline, perDecade, total, years, chance: chanceSentence(st.p_value, lang), significant, insufficient: false };
}

/** Plain-language reading of a two-place comparison, built from the engine's own verdicts. */
export function plainComparison(id: string, a: SceneAnalysis, b: SceneAnalysis, lang: Lang) {
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const f = FRIENDLY[id];
  const name = (s: SceneAnalysis) => s.geography.region_name.split("/")[0].trim();
  const dir = (s: SceneAnalysis) => {
    const v = s.statistics.slope_per_decade;
    if (v === null || v === 0) return t("quase parado", "nearly flat");
    const up = v > 0;
    return f ? (up ? f.up[lang] : f.down[lang]).toLowerCase() : up ? t("subindo", "rising") : t("caindo", "falling");
  };
  const sa = a.statistics.slope_per_decade ?? 0, sb = b.statistics.slope_per_decade ?? 0;
  const opposite = sa * sb < 0;
  const bothReal = a.status === "TENDENCIA_REAL" && b.status === "TENDENCIA_REAL";
  if (opposite && bothReal) return t(`Tendências opostas confirmadas! Em ${name(a)}: ${dir(a)}. Em ${name(b)}: ${dir(b)}. A mesma pista vai para lados diferentes em cada lugar.`,
    `Opposite trends confirmed! In ${name(a)}: ${dir(a)}. In ${name(b)}: ${dir(b)}. The same clue moves in different directions in each place.`);
  if (opposite) return t(`As estimativas apontam para lados opostos (${name(a)}: ${dir(a)}; ${name(b)}: ${dir(b)}), mas pelo menos uma pode ser ruído. Ainda não dá para afirmar tendências opostas.`,
    `The estimates point in opposite directions (${name(a)}: ${dir(a)}; ${name(b)}: ${dir(b)}), but at least one could be noise. We can't claim opposite trends yet.`);
  return t(`Os dois lugares apontam para o mesmo lado: ${dir(a)}.`, `Both places point the same way: ${dir(a)}.`);
}
