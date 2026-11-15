/**
 * Da pergunta livre à ficha: tenta o LLM (/api/interpret); se ele não responder, usa as palavras-chave.
 * O LLM só escolhe entre as pistas do catálogo; quem decide o carimbo continua sendo o motor estatístico.
 */
import { clueById } from "@/lib/catalog";
import { resolvePlaces } from "@/lib/geocode";
import { interpretQuestion, parsePeriod } from "@/lib/interpreter";
import type { Lang, ScenePoint } from "@/types/sleuth";

export interface Plan {
  clues: string[];   // vazio = manter as atuais
  places: ScenePoint[];
  twoScenes: boolean;
  start: number;
  end: number;
  run: boolean;      // false = falta algo: abrir "Ajustar" e perguntar só o que faltou
  note: string;
}

const LLM_TIMEOUT_MS = 14000; // Groq (6 s) + Gemini (6 s) no pior caso

/** O que perguntar ao usuário quando o local não foi achado; "" se está tudo certo. */
function missingWhere(places: ScenePoint[], wantTwo: boolean, lang: Lang): string {
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  if (!places[0]) return t("Onde? Não achei o local na frase: clique no mapa ou escolha um atalho e depois execute.", "Where? I could not find the place in the question: click the map or pick a shortcut, then run.");
  if (wantTwo && !places[1]) return t("Onde fica a segunda região? Clique no mapa ou escolha um atalho e depois execute.", "Where is the second region? Click the map or pick a shortcut, then run.");
  return "";
}

async function fromLlm(question: string, lang: Lang): Promise<Plan | null> {
  try {
    const r = await fetch("/api/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    const b = await r.json();
    if (!r.ok || b.fallback) return null;
    const clues: string[] = (b.parameter_ids as string[]).filter((id) => clueById(id));
    const places: ScenePoint[] = b.places;
    const where = missingWhere(places, !!b.two_scenes, lang);
    const run = b.supported && clues.length > 0 && !where;
    return {
      clues, places, twoScenes: !!b.two_scenes, start: b.start_year, end: b.end_year, run,
      note: [b.needs, b.supported ? where : ""].filter(Boolean).join(" "),
    };
  } catch {
    return null; // sem rede, timeout ou resposta inválida
  }
}

async function fromKeywords(question: string, lang: Lang): Promise<Plan> {
  const i = interpretQuestion(question);
  const { start, end } = parsePeriod(question);
  const places = await resolvePlaces(question, i.twoScenes);
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const missing = missingWhere(places, i.twoScenes, lang) || (!i.confident
    ? t("Não reconheci o tema com segurança: escolha as pistas e depois execute.", "Topic not recognised with confidence: pick the clues, then run.")
    : "");
  return {
    clues: i.clues, places, twoScenes: i.twoScenes, start, end, run: !missing,
    note: missing || (lang === "pt" ? i.rationale_pt : i.rationale_en),
  };
}

export async function planFromQuestion(question: string, lang: Lang): Promise<Plan> {
  const llm = await fromLlm(question, lang);
  if (llm) return llm;
  const plan = await fromKeywords(question, lang);
  const aviso = lang === "pt"
    ? "Interpretação simples (a IA não respondeu agora): confira período e pistas em “Ajustar”."
    : "Simple interpretation (the AI did not answer): check period and clues in “Adjust”.";
  return { ...plan, note: `${aviso} ${plan.note}` };
}
