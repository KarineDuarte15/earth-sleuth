/**
 * Acha o(s) local(is) citado(s) numa pergunta, sem IA:
 *  1. atalhos conhecidos (offline, instantâneo);
 *  2. busca de nome na geocodificação gratuita do Open-Meteo (sem chave). Se cair, devolve só o que o passo 1 achou.
 */
import { PELOTAS, QUIXERAMOBIM, REGION_SHORTCUTS } from "@/lib/catalog";
import type { ScenePoint } from "@/types/sleuth";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const ALIASES: [RegExp, ScenePoint][] = [
  ...REGION_SHORTCUTS.flatMap((p) =>
    p.region_name.replace(/\(.*?\)/g, "").split("/").map((a): [RegExp, ScenePoint] => [new RegExp(`\\b${norm(a.trim())}\\b`), p])),
  [/\b(semiarido|sertao)\b/, QUIXERAMOBIM],
  [/\bsul do brasil\b/, PELOTAS],
];

const PREPOSITIONS = new Set(["em", "no", "na", "nos", "nas", "de", "do", "da", "dos", "das", "in", "at", "for", "entre", "between", "over"]);
const CONJUNCTION = /\s+(?:com|e|versus|vs\.?|x|contra|and|with)\s+/i;
const MAX_LOOKUPS = 8;

async function lookup(name: string): Promise<ScenePoint | null> {
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt`);
    const hit = (await r.json()).results?.[0];
    if (!hit) return null;
    const label = hit.admin1 && hit.admin1 !== hit.name ? `${hit.name} (${hit.admin1})` : hit.name;
    return { region_name: label, latitude: hit.latitude, longitude: hit.longitude };
  } catch {
    return null;
  }
}

/** Prefixos da cauda, do mais longo ao mais curto ("Ceará está diminuindo" -> "Ceará está" -> "Ceará"). */
async function resolveTail(words: string[], budget: { left: number }): Promise<ScenePoint | null> {
  for (let n = Math.min(words.length, 4); n >= 1; n--) {
    const name = words.slice(0, n).join(" ");
    if (budget.left <= 0 || name.length < 3) continue;
    budget.left--;
    const p = await lookup(name);
    if (p) return p;
  }
  return null;
}

export async function resolvePlaces(raw: string, wantTwo: boolean): Promise<ScenePoint[]> {
  const q = norm(raw);
  const known = ALIASES.map(([re, p]) => ({ at: q.search(re), p }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((m) => m.p)
    .filter((p, i, all) => all.indexOf(p) === i);
  if (known.length >= (wantTwo ? 2 : 1)) return known.slice(0, wantTwo ? 2 : 1);

  const words = raw.replace(/[?!.,;]+/g, " ").split(/\s+/).filter(Boolean);
  const budget = { left: MAX_LOOKUPS };
  for (let i = words.length - 2; i >= 0; i--) { // último "em/no/de…" primeiro: o lugar costuma vir no fim
    if (!PREPOSITIONS.has(norm(words[i]))) continue;
    const tail = words.slice(i + 1).join(" ");
    const parts = wantTwo ? tail.split(CONJUNCTION).slice(0, 2) : [tail];
    const found: ScenePoint[] = [];
    for (const part of parts) {
      const p = await resolveTail(part.split(" "), budget);
      if (p) found.push(p);
    }
    if (found.length >= (wantTwo ? 2 : 1)) return found;
  }
  return known;
}
