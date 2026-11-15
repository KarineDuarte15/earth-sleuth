// Address search and the AI comparison summary need a signed-in account (Supabase + Lovable gateway).
// Space Apps judges must reach the whole project without a login, so both stay off for the submission.
// Set to true to bring them back; their code is unchanged.
const ACCOUNT_FEATURES_ENABLED = false;

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, useNavigate } from "@tanstack/react-router";
import { analyzeInvestigation } from "@/lib/analyze.functions";
import {
  Thermometer, Moon, Sun, CloudRain, Sprout, Leaf, Search, Wand2, SplitSquareHorizontal, Share2, Check, AlertCircle,
  MapPin, ScanSearch, ArrowRight, ArrowDown, Sparkles, Database, Sigma, Play, Trees, Building2, Waves, Droplets, Wind,
  BookOpen, HelpCircle, CalendarRange, Settings2, type LucideIcon,
} from "lucide-react";
import { FRONTEND_CLUES, PRESET_CASES, REGION_SHORTCUTS, PELOTAS, clueById, type PresetCase } from "@/lib/catalog";
import { interpretQuestion } from "@/lib/interpreter";
import { friendlyOf, plainComparison, plainVerdict } from "@/lib/friendly";
import type { ClueRun, DataMode, InvestigationResponse, Lang, SceneAnalysis, ScenePoint } from "@/types/sleuth";
import EvidenceModal from "@/components/EvidenceModal";
import SdgPanel from "@/components/SdgPanel";
import PlaceSearch from "@/components/PlaceSearch";
import ComparisonExport from "@/components/ComparisonExport";
import ComparisonSynthesis from "@/components/ComparisonSynthesis";
import SiteHeader from "@/components/SiteHeader";
import HeroPreview from "@/components/HeroPreview";
import CaseVerdict from "@/components/CaseVerdict";
import SleuthGuide, { type GuideMood } from "@/components/SleuthGuide";

const MapSelectorLazy = lazy(() => import("@/components/MapSelector"));
const mapFallback = <div className="flex h-[340px] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] text-sm text-[var(--muted)]">Loading map…</div>;
function MapSelector(props: React.ComponentProps<typeof MapSelectorLazy>) {
  return (
    <ClientOnly fallback={mapFallback}>
      <Suspense fallback={mapFallback}><MapSelectorLazy {...props} /></Suspense>
    </ClientOnly>
  );
}

const FIRST_YEAR = 1981;
const LAST_YEAR = 2025;
const MIN_YEARS = 15;

const CLUE_ICON: Record<string, LucideIcon> = {
  T2M: Thermometer, T2M_MIN: Moon, T2M_MAX: Sun, PRECTOTCORR: CloudRain, GWETROOT: Sprout, EVPTRNS: Leaf,
};

// Each shortcut stands for a kind of landscape, as the challenge suggests (desert, rain forest, city...).
const PLACE_KIND: { match: string; Icon: LucideIcon; pt: string; en: string }[] = [
  { match: "Quixeramobim", Icon: Sun, pt: "Semiárido", en: "Semi-arid" },
  { match: "Fortaleza", Icon: Building2, pt: "Cidade litorânea", en: "Coastal city" },
  { match: "Petrolina", Icon: Waves, pt: "Vale de rio", en: "River valley" },
  { match: "Manaus", Icon: Trees, pt: "Floresta tropical", en: "Rain forest" },
  { match: "Foz", Icon: Droplets, pt: "Subtropical úmido", en: "Humid subtropical" },
  { match: "Pelotas", Icon: Wind, pt: "Litoral do Sul", en: "Southern coast" },
];
const kindOf = (name: string) => PLACE_KIND.find((k) => name.includes(k.match));
const shortName = (name: string) => name.split("/")[0].trim();

const PERIODS = [
  { id: "all", from: 1981, to: 2025, pt: "Tudo: 45 anos", en: "Everything: 45 years" },
  { id: "30", from: 1996, to: 2025, pt: "Últimos 30 anos", en: "Last 30 years" },
  { id: "20", from: 2006, to: 2025, pt: "Últimos 20 anos", en: "Last 20 years" },
] as const;

interface DemoLine { pt: string; en: string }
// What Sleuth says while playing each ready-made case.
const DEMO_SCRIPT: Record<string, { intro: DemoLine; clue: DemoLine; place: DemoLine; years: DemoLine }> = {
  a: {
    intro: { pt: "Vamos resolver juntos: as noites no Sertão do Ceará estão esquentando?", en: "Let's solve this together: are nights in Ceará's backlands getting warmer?" },
    clue: { pt: "Passo 1: a pista é a temperatura mínima de cada dia. É ela que conta como estão as noites.", en: "Step 1: the clue is each day's lowest temperature. That's what tells us about the nights." },
    place: { pt: "Passo 2: o lugar é Quixeramobim, no semiárido. Os dados da NASA cobrem um quadrado de uns 55 km.", en: "Step 2: the place is Quixeramobim, in the semi-arid. NASA's data covers a square of about 55 km." },
    years: { pt: "Passo 3: vamos olhar os 45 anos inteiros. Quanto mais anos, mais forte a evidência.", en: "Step 3: we look at all 45 years. More years means stronger evidence." },
  },
  b: {
    intro: { pt: "Caso difícil: a terra do semiárido está ficando mais seca?", en: "Tricky case: is the semi-arid land drying out?" },
    clue: { pt: "Passo 1: secura não é uma coisa só. Vou testar três pistas: chuva, umidade do solo e evaporação.", en: "Step 1: dryness isn't one thing. I'll test three clues: rain, soil moisture and evaporation." },
    place: { pt: "Passo 2: de novo Quixeramobim, no coração do semiárido.", en: "Step 2: Quixeramobim again, in the heart of the semi-arid." },
    years: { pt: "Passo 3: todos os 45 anos. Cada pista é testada separadamente.", en: "Step 3: all 45 years. Each clue is tested on its own." },
  },
  c: {
    intro: { pt: "Um mistério do desafio: a mesma pista pode subir num lugar e descer em outro?", en: "A mystery from the challenge: can the same clue rise in one place and fall in another?" },
    clue: { pt: "Passo 1: a pista é a chuva.", en: "Step 1: the clue is rain." },
    place: { pt: "Passo 2: duas cenas! Quixeramobim, no Nordeste, e Pelotas, no extremo Sul.", en: "Step 2: two scenes! Quixeramobim in the Northeast and Pelotas in the far South." },
    years: { pt: "Passo 3: 45 anos nos dois lugares, para comparar de igual para igual.", en: "Step 3: 45 years in both places, so it's a fair comparison." },
  },
};

const SECTIONS = ["topo", "casos", "q1", "q2", "q3", "veredito", "ods", "caderno", "mural"] as const;
type SectionId = (typeof SECTIONS)[number];

const SECTION_LINE: Record<SectionId, DemoLine> = {
  topo: { pt: "Oi! Eu sou o Sleuth, um detetive de dados. Vamos descobrir se o clima está mudando mesmo em algum lugar?", en: "Hi! I'm Sleuth, a data detective. Shall we find out if the climate is really changing somewhere?" },
  casos: { pt: "Escolha um caso e aperte Assistir. Eu preencho cada passo e explico tudo no caminho.", en: "Pick a case and press Watch. I'll fill in each step and explain it as we go." },
  q1: { pt: "Passo 1: qual é a sua pergunta? Cada cartão é uma variável climática da NASA, explicada em palavras simples.", en: "Step 1: what's your question? Each card is a NASA climate variable, in plain words." },
  q2: { pt: "Passo 2: onde investigar? Toque num lugar ou no mapa. Dica: compare dois lugares, a mesma pista pode subir num e descer no outro!", en: "Step 2: where should we look? Tap a place or the map. Tip: compare two places, the same clue can rise in one and fall in the other!" },
  q3: { pt: "Passo 3: quantos anos? Preciso de pelo menos 15 para dar um veredito. Mais anos, evidência mais forte.", en: "Step 3: how many years? I need at least 15 to give a verdict. More years, stronger evidence." },
  veredito: { pt: "O veredito aparece aqui depois que você apertar Examinar as evidências.", en: "Your verdict shows up here once you press Examine the evidence." },
  ods: { pt: "Por que isso importa: cada pista se liga a uma meta da ONU para o desenvolvimento sustentável.", en: "Why it matters: each clue links to a UN Sustainable Development Goal." },
  caderno: { pt: "Meu caderno de detetive: cada palavra difícil explicada em uma linha.", en: "My detective notebook: every tricky word explained in one line." },
  mural: { pt: "Casos resolvidos vão para o mural. Cada cartão é um link que reabre a investigação.", en: "Solved cases go on the board. Each card is a link that reopens the case." },
};

interface MuralCard {
  id: string; question: string; parameterId: string; regions: string;
  status: string; headline: string; shareUrl: string;
}

interface RunInput { clues: string[]; sceneA: ScenePoint; sceneB: ScenePoint | null; startYear: number; endYear: number; question: string }

function Question({ id, n, title, hint, children }: { id: string; n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} data-reveal className="surface relative scroll-mt-24 rounded-3xl p-5 sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] font-serif text-lg font-bold text-white shadow-[var(--button-shadow)]">{n}</span>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h2>
          {hint && <p className="mt-1 text-[15px] text-[var(--muted)]">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Fades sections in as they scroll into view; content stays visible if JS or the observer is unavailable. */
function useScrollReveal(deps: unknown[]) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-visible"); else io.observe(el);
    });
    document.documentElement.classList.add("js-reveal");
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function EarthSleuthsApp() {
  const [lang, setLang] = useState<Lang>("en");
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const L = (l: DemoLine) => l[lang];

  const [question, setQuestion] = useState("");
  const [note, setNote] = useState("");
  const [clues, setClues] = useState<string[]>(["T2M_MIN"]);
  const [startYear, setStartYear] = useState(FIRST_YEAR);
  const [endYear, setEndYear] = useState(LAST_YEAR);
  const [mode, setMode] = useState<DataMode>("auto");
  const [twoScenes, setTwoScenes] = useState(false);
  const [mapTarget, setMapTarget] = useState<"A" | "B">("A");
  const [sceneA, setSceneA] = useState<ScenePoint>(PRESET_CASES[0].sceneA);
  const [sceneB, setSceneB] = useState<ScenePoint>(PELOTAS);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigationResponse | null>(null);
  const [evidence, setEvidence] = useState<{ run: ClueRun; scene: SceneAnalysis } | null>(null);
  const [mural, setMural] = useState<MuralCard[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId>("topo");
  const [demo, setDemo] = useState<{ text: string; mood: GuideMood; caseId: string } | null>(null);
  const demoToken = useRef(0);
  const restored = useRef(false);
  useScrollReveal([result, mural.length]);

  // Restore a case file from a shared link (?clues=...&latA=...).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const num = (k: string) => (p.get(k) !== null ? Number(p.get(k)) : NaN);
    const ids = (p.get("clues") ?? "").split(",").filter((id) => clueById(id));
    if (ids.length) setClues(ids);
    if (p.get("q")) setQuestion(p.get("q")!);
    if (!isNaN(num("latA"))) setSceneA({ region_name: p.get("nameA") ?? "Scene A", latitude: num("latA"), longitude: num("lonA") });
    if (!isNaN(num("latB"))) { setSceneB({ region_name: p.get("nameB") ?? "Scene B", latitude: num("latB"), longitude: num("lonB") }); setTwoScenes(true); }
    const from = !isNaN(num("from")) ? num("from") : num("start");
    const to = !isNaN(num("to")) ? num("to") : num("end");
    if (!isNaN(from)) setStartYear(from);
    if (!isNaN(to)) setEndYear(to);
    if (p.get("lang") === "pt") setLang("pt");
    if (ids.length) setNote("restored");
    restored.current = true;
  }, []);

  const shareUrl = useMemo(() => {
    const p = new URLSearchParams({
      clues: clues.join(","), from: String(startYear), to: String(endYear),
      nameA: sceneA.region_name, latA: String(sceneA.latitude), lonA: String(sceneA.longitude),
    });
    if (question) p.set("q", question);
    if (twoScenes) { p.set("nameB", sceneB.region_name); p.set("latB", String(sceneB.latitude)); p.set("lonB", String(sceneB.longitude)); }
    return `?${p.toString()}`;
  }, [clues, startYear, endYear, sceneA, sceneB, twoScenes, question]);

  // The address bar follows the case file, so any state becomes a shareable link.
  // Go through the router with resetScroll off: a raw history.replaceState is picked up by
  // TanStack Router as a new navigation and jumps the page back to the top.
  const navigate = useNavigate();
  useEffect(() => {
    if (restored.current) void navigate({ href: shareUrl, replace: true, resetScroll: false });
  }, [shareUrl, navigate]);

  // Which part of the page is in the middle of the screen: Sleuth talks about it.
  useEffect(() => {
    const els = SECTIONS.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.isIntersecting && setSection(e.target.id as SectionId));
    }, { rootMargin: "-40% 0px -55% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [result]);

  const primary = useMemo(() => clueById(clues[0]) ?? FRONTEND_CLUES[0], [clues]);
  const latestStart = Math.max(...clues.map((id) => clueById(id)?.min_year ?? FIRST_YEAR), startYear);
  const nYears = endYear - latestStart + 1;

  const interpret = () => {
    if (!question.trim()) return;
    const i = interpretQuestion(question);
    setClues(i.clues);
    if (i.twoScenes) setTwoScenes(true);
    setNote(lang === "pt" ? i.rationale_pt : i.rationale_en);
  };

  const toggleClue = (id: string) => {
    setClues((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]));
  };

  const run = async (over?: Partial<RunInput>) => {
    const input: RunInput = {
      clues: over?.clues ?? clues, sceneA: over?.sceneA ?? sceneA,
      sceneB: over && "sceneB" in over ? over.sceneB ?? null : twoScenes ? sceneB : null,
      startYear: over?.startYear ?? startYear, endYear: over?.endYear ?? endYear,
      question: over?.question ?? question,
    };
    setLoading(true);
    setError(null);
    setTimeout(() => scrollToId("veredito"), 60);
    try {
      const body = await analyzeInvestigation({
        data: {
          question: input.question || t("Investigação livre", "Open investigation"),
          parameter_ids: input.clues, start_year: input.startYear, end_year: input.endYear, mode, lang,
          scene_a: input.sceneA, scene_b: input.sceneB,
        },
      });
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("O motor estatístico não respondeu.", "The statistics engine did not respond."));
    } finally {
      setLoading(false);
    }
  };

  const applyCase = (c: PresetCase) => {
    setQuestion(lang === "pt" ? c.question_pt : c.question_en);
    setClues(c.clues);
    setTwoScenes(c.twoScenes);
    setMapTarget("A");
    setSceneA(c.sceneA);
    if (c.sceneB) setSceneB(c.sceneB);
    setStartYear(FIRST_YEAR);
    setEndYear(LAST_YEAR);
  };

  const caseInput = (c: PresetCase): RunInput => ({
    clues: c.clues, sceneA: c.sceneA, sceneB: c.twoScenes ? c.sceneB ?? null : null,
    startYear: FIRST_YEAR, endYear: LAST_YEAR, question: lang === "pt" ? c.question_pt : c.question_en,
  });

  // Guided demo: Sleuth fills each step on screen and explains it, then runs the real analysis.
  const watchDemo = async (c: PresetCase) => {
    const token = ++demoToken.current;
    const script = DEMO_SCRIPT[c.id];
    const pause = (ms: number) => new Promise<void>((res, rej) => setTimeout(() => (token === demoToken.current ? res() : rej(new Error("cancelled"))), ms));
    const say = (l: DemoLine, mood: GuideMood = "talk") => setDemo({ text: L(l), mood, caseId: c.id });
    try {
      setResult(null);
      say(script.intro, "walk");
      scrollToId("q1");
      await pause(2600);
      setQuestion(lang === "pt" ? c.question_pt : c.question_en);
      setClues(c.clues);
      say(script.clue);
      await pause(4200);
      scrollToId("q2");
      setTwoScenes(c.twoScenes);
      setMapTarget("A");
      setSceneA(c.sceneA);
      if (c.sceneB) setSceneB(c.sceneB);
      say(script.place, "walk");
      await pause(4200);
      scrollToId("q3");
      setStartYear(FIRST_YEAR);
      setEndYear(LAST_YEAR);
      say(script.years);
      await pause(3600);
      setDemo(null);
      await run(caseInput(c));
    } catch {
      /* the visitor skipped or started another demo */
    }
  };

  const skipDemo = () => {
    const caseId = demo?.caseId;
    demoToken.current++;
    setDemo(null);
    const c = PRESET_CASES.find((p) => p.id === caseId);
    if (c) { applyCase(c); void run(caseInput(c)); }
  };

  const saveToMural = (r: ClueRun) => {
    if (!result || !r.scene_a) return;
    const url = `${window.location.origin}/${shareUrl}`;
    const id = `${result.case_id}-${r.variable.parameter_id}`;
    setMural((m) => [{
      id, question: result.question, parameterId: r.variable.parameter_id,
      regions: shortName(r.scene_a!.geography.region_name) + (r.scene_b ? ` × ${shortName(r.scene_b.geography.region_name)}` : ""),
      status: r.scene_a!.status, headline: plainVerdict(r.variable.parameter_id, r.scene_a!, lang).headline, shareUrl: url,
    }, ...m.filter((c) => c.id !== id)]);
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  };

  // What Sleuth says and does right now.
  const resultLine = useMemo(() => {
    if (!result) return null;
    const runs = result.runs.filter((r) => r.scene_a);
    if (!runs.length) return { text: t("Não consegui dados para esse caso. Tente outro lugar ou período.", "I couldn't get data for this case. Try another place or period."), real: false };
    const first = runs[0];
    if (first.comparison && first.scene_b) {
      return { text: plainComparison(first.variable.parameter_id, first.scene_a!, first.scene_b, lang), real: first.comparison.confirmed_opposite_trends };
    }
    const real = runs.filter((r) => r.scene_a!.status === "TENDENCIA_REAL");
    if (real.length) {
      const v = plainVerdict(real[0].variable.parameter_id, real[0].scene_a!, lang);
      return { text: t(`Caso resolvido! ${v.headline}: ${v.perDecade}. Um padrão assim por sorte: ${v.chance}.`, `Case closed! ${v.headline}: ${v.perDecade}. A pattern like this by luck: ${v.chance}.`), real: true };
    }
    return { text: t("Hmm, nenhuma tendência clara desta vez. Os dados sobem e descem demais. Isso também é pista: com mais anos, a resposta pode aparecer.", "Hmm, no clear trend this time. The data wiggles too much. That's still a clue: with more years, the answer may show up."), real: false };
  }, [result, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const [talking, setTalking] = useState(false);
  const guideText = demo ? demo.text
    : loading ? t("Investigando... estou buscando décadas de dados mensais da NASA e testando cada pista.", "Investigating... I'm pulling decades of monthly NASA data and testing each clue.")
    : resultLine && section === "veredito" ? resultLine.text
    : L(SECTION_LINE[section]);
  useEffect(() => {
    setTalking(true);
    const ms = Math.min(6000, Math.max(2200, guideText.length * 45));
    const id = setTimeout(() => setTalking(false), ms);
    return () => clearTimeout(id);
  }, [guideText]);
  const guideMood: GuideMood = demo ? demo.mood
    : loading ? "investigate"
    : resultLine?.real && section === "veredito" && talking ? "jump"
    : talking ? "talk" : "idle";

  const pct = (y: number) => ((y - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * 100;
  const activePeriod = PERIODS.find((p) => p.from === startYear && p.to === endYear)?.id ?? "custom";
  const noteText = note === "restored" ? t("Caso restaurado a partir de um link. Confira e examine.", "Case restored from a link. Check it, then examine.") : note;

  const glossary = [
    { k: t("Tendência", "Trend"), v: t("Uma subida ou descida que se mantém por muitos anos, não só um ano estranho.", "A rise or fall that keeps going for many years, not just one odd year.") },
    { k: t("Ruído", "Noise"), v: t("O sobe-e-desce natural de um ano para o outro, que pode enganar quem olha só um pedaço.", "The natural up-and-down from year to year, which can fool anyone looking at a short stretch.") },
    { k: t("Taxa de mudança", "Rate of change"), v: t("Quanto muda por década. Usamos a inclinação de Sen: a mediana de todas as inclinações entre pares de meses, que não se deixa levar por um ano extremo.", "How much it changes per decade. We use Sen's slope: the median of the slopes between every pair of months, so one extreme year can't drag it.") },
    { k: t("Significativo", "Significant"), v: t("Muito improvável de ser sorte. Chamamos de significativo quando o p-valor do teste de Mann-Kendall fica abaixo de 0,05.", "Very unlikely to be luck. We call it significant when the Mann-Kendall test gives a p-value below 0.05.") },
    { k: "p-value", v: t("A chance de ver uma tendência tão forte quanto essa se, na verdade, nada estivesse mudando.", "The chance of seeing a trend this strong if nothing were really changing.") },
    { k: t("Intervalo de confiança (95%)", "Confidence interval (95%)"), v: t("A faixa onde a taxa verdadeira provavelmente está. Se ela não cruza o zero, o sinal da mudança é confiável.", "The range where the true rate most likely sits. If it doesn't cross zero, the direction of change is reliable.") },
    { k: t("Anomalia", "Anomaly"), v: t("Quanto um mês ficou acima ou abaixo do normal daquele mês. Assim as estações do ano não enganam o teste (Mann-Kendall sazonal).", "How far a month was above or below that month's normal. This keeps the seasons from fooling the test (Seasonal Mann-Kendall).") },
    { k: t("Reanálise (MERRA-2)", "Reanalysis (MERRA-2)"), v: t("Um modelo da NASA que junta observações de satélites e estações e entrega um registro sem falhas desde 1980.", "A NASA model that blends satellite and station observations into a gap-free record since 1980.") },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader lang={lang} setLang={setLang} boardCount={mural.length} />

      {/* HERO */}
      <section id="topo" className="hero-bg">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-14 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-20 lg:pt-20">
          <div>
            <p className="fade-up inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)]/80 px-3 py-1.5 text-xs font-semibold text-[var(--muted)] shadow-sm backdrop-blur">
              <span className="pulse-dot h-2 w-2 rounded-full bg-[var(--success)]" aria-hidden />
              {t("Space Apps 2026 · Desafio Trend Detective", "Space Apps 2026 · Trend Detective challenge")}
            </p>
            <h1 className="fade-up delay-1 mt-5 text-[2.5rem] font-bold leading-[1.05] text-foreground sm:text-6xl lg:text-[3.9rem]">
              {t("O clima está ", "Is the climate ")}<span className="text-gradient">{t("mudando mesmo", "really changing")}</span>
              {t(" onde você mora?", " where you live?")}
            </h1>
            <p className="fade-up delay-2 mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
              {t("Vire detetive de dados com o Sleuth. Escolha uma pista, um lugar e um período: buscamos até 45 anos de dados da NASA, testamos como os cientistas testam e explicamos o veredito em palavras simples.",
                "Become a data detective with Sleuth. Pick a clue, a place and a period: we pull up to 45 years of NASA data, test it the way scientists do, and explain the verdict in plain words.")}
            </p>
            <div className="fade-up delay-3 mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#casos" className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--brand)] px-6 text-base font-semibold text-[var(--primary-foreground)] shadow-[var(--button-shadow)] transition hover:-translate-y-0.5 hover:brightness-110">
                <Play className="h-4 w-4" aria-hidden /> {t("Assistir a um caso", "Watch a case")}
              </a>
              <a href="#q1" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-6 text-base font-semibold text-foreground transition hover:border-[var(--brand)]">
                {t("Investigar por conta própria", "Investigate on my own")} <ArrowDown className="h-4 w-4" aria-hidden />
              </a>
            </div>
            <dl className="fade-up delay-4 mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-[var(--line)] pt-6">
              {[
                { I: Database, v: "45", k: t("anos de dados da NASA", "years of NASA data") },
                { I: Sparkles, v: String(FRONTEND_CLUES.length), k: t("pistas do clima", "climate clues") },
                { I: Sigma, v: "p < 0.05", k: t("teste de Mann-Kendall", "Mann-Kendall test") },
              ].map(({ I, v, k }) => (
                <div key={k}>
                  <dt className="sr-only">{k}</dt>
                  <dd className="flex items-center gap-1.5 font-serif text-xl font-bold tabular-nums text-foreground sm:text-2xl"><I className="h-4 w-4 text-[var(--brand)]" aria-hidden />{v}</dd>
                  <dd className="mt-0.5 text-xs leading-snug text-[var(--muted)]">{k}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="fade-up delay-2"><HeroPreview lang={lang} /></div>
        </div>
      </section>

      {/* HOW A DETECTIVE WORKS + DEMO CASES */}
      <section id="casos" className="scroll-mt-24 pb-4">
        <div className="mx-auto max-w-6xl px-4">
          <ol data-reveal className="mb-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { I: HelpCircle, h: t("1. Pergunte", "1. Ask"), d: t("Escolha o que quer descobrir: noites, calor, chuva, solo...", "Choose what to find out: nights, heat, rain, soil...") },
              { I: MapPin, h: t("2. Escolha o lugar", "2. Pick a place"), d: t("Qualquer ponto do planeta, ou dois para comparar.", "Any point on Earth, or two to compare.") },
              { I: CalendarRange, h: t("3. Defina os anos", "3. Set the years"), d: t("De 15 a 45 anos de dados mensais.", "15 to 45 years of monthly data.") },
              { I: ScanSearch, h: t("4. Receba o veredito", "4. Get the verdict"), d: t("O quê, onde, quanto e se é significativo.", "What, where, how much, and whether it's significant.") },
            ].map(({ I, h, d }) => (
              <li key={h} className="flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)]/70 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--panel-2)] text-[var(--brand)]"><I className="h-5 w-5" aria-hidden /></span>
                <span><span className="block font-serif font-bold text-foreground">{h}</span><span className="text-sm text-[var(--muted)]">{d}</span></span>
              </li>
            ))}
          </ol>

          <div data-reveal className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">{t("Casos de demonstração", "Demo cases")}</p>
              <h2 className="mt-1 text-3xl font-bold text-foreground sm:text-4xl">{t("Assista ao Sleuth resolver um caso", "Watch Sleuth solve a case")}</h2>
            </div>
            <p className="max-w-md text-sm text-[var(--muted)]">{t("Ele preenche cada passo na tela e explica o porquê. Depois é a sua vez.", "He fills in each step on screen and explains why. Then it's your turn.")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PRESET_CASES.map((c, i) => (
              <div key={c.id} data-reveal style={{ transitionDelay: `${i * 90}ms` }}
                className="surface ring-gradient group relative flex flex-col rounded-3xl p-6 transition duration-300 hover:-translate-y-1">
                <span className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[var(--muted)]">{t("Caso", "Case")} {String(i + 1).padStart(2, "0")}</span>
                  <span className="flex gap-1.5">
                    {c.clues.map((id) => { const I = CLUE_ICON[id]; return I ? <span key={id} className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--panel-2)] text-[var(--brand)]"><I className="h-4 w-4" aria-hidden /></span> : null; })}
                  </span>
                </span>
                <h3 className="mt-6 font-serif text-xl font-bold text-foreground">{t(c.title_pt.split("·")[1]?.trim() ?? c.title_pt, c.title_en.split("·")[1]?.trim() ?? c.title_en)}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--muted)]">{t(c.question_pt, c.question_en)}</p>
                <p className="mt-4 flex items-center gap-1.5 text-sm text-[var(--muted)]"><MapPin className="h-3.5 w-3.5" aria-hidden />{shortName(c.sceneA.region_name)}{c.sceneB ? ` × ${shortName(c.sceneB.region_name)}` : ""}</p>
                <div className="mt-5 flex gap-2 border-t border-[var(--line)] pt-4">
                  <button type="button" onClick={() => void watchDemo(c)}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--primary-foreground)] transition hover:brightness-110">
                    <Play className="h-4 w-4" aria-hidden /> {t("Assistir", "Watch")}
                  </button>
                  <button type="button" onClick={() => { applyCase(c); scrollToId("q1"); }}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-foreground transition hover:border-[var(--brand)]">
                    {t("Abrir", "Open")} <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-12">
        <div data-reveal className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">{t("Sua investigação", "Your investigation")}</p>
          <h2 className="mt-1 text-3xl font-bold text-foreground sm:text-4xl">{t("Três perguntas e um veredito", "Three questions and a verdict")}</h2>
        </div>

        <Question id="q1" n={1} title={t("O que você quer descobrir?", "What do you want to find out?")}
          hint={t("Toque em uma ou mais pistas. Cada uma é uma variável medida pela NASA, testada separadamente.", "Tap one or more clues. Each is a variable tracked by NASA, tested on its own.")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FRONTEND_CLUES.map((c) => {
              const on = clues.includes(c.parameter_id);
              const I = CLUE_ICON[c.parameter_id];
              const f = friendlyOf(c.parameter_id);
              return (
                <button key={c.parameter_id} type="button" aria-pressed={on} onClick={() => toggleClue(c.parameter_id)}
                  className={`group relative flex gap-4 rounded-2xl border p-4 text-left transition duration-200 hover:-translate-y-0.5 ${on ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_9%,var(--panel))] shadow-[0_10px_28px_-16px_var(--brand)]" : "border-[var(--line)] bg-[var(--panel)] hover:border-[color-mix(in_oklab,var(--brand)_50%,var(--line))]"}`}>
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition ${on ? "bg-[var(--brand)] text-white" : "bg-[var(--panel-2)] text-[var(--brand)] group-hover:scale-105"}`}>
                    {I && <I className="h-6 w-6" aria-hidden />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-serif text-[17px] font-bold leading-snug text-foreground">{f ? f.question[lang] : t(c.label_pt, c.label_en)}</span>
                    <span className="mt-1 block text-sm leading-snug text-[var(--muted)]">{f ? f.what[lang] : t(c.simple_def_pt, c.simple_def_en)}</span>
                    <span className="mt-2 inline-block rounded-md bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--muted)]">NASA · {c.parameter_id}</span>
                  </span>
                  {on && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[var(--brand)] text-white"><Check className="h-3.5 w-3.5" aria-hidden /></span>}
                </button>
              );
            })}
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-2)]/40 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground"><Wand2 className="h-4 w-4 text-[var(--brand)]" aria-hidden />{t("Ou pergunte do seu jeito", "Or ask in your own words")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative flex-1">
                <span className="sr-only">{t("Sua pergunta", "Your question")}</span>
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden />
                <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && interpret()}
                  placeholder={t("ex.: a terra está ficando mais seca?", "e.g. is the land getting drier?")}
                  className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] pl-10 pr-4 text-[15px] text-foreground placeholder:text-[var(--muted)]" />
              </label>
              <button type="button" onClick={interpret} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--panel)] px-4 text-sm font-semibold text-foreground ring-1 ring-[var(--line)] hover:ring-[var(--brand)]">
                {t("Sugerir pistas", "Suggest clues")}
              </button>
            </div>
            {noteText && <p className="reveal mt-3 rounded-lg bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] px-3 py-2 text-sm text-[var(--brand)]" role="status">{noteText}</p>}
          </div>
        </Question>

        <Question id="q2" n={2} title={t("Onde vamos investigar?", "Where should we look?")}
          hint={t("Escolha um tipo de lugar, toque no mapa ou digite as coordenadas.", "Pick a kind of place, tap the map or type coordinates.")}>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {REGION_SHORTCUTS.map((r) => {
              const cur = mapTarget === "B" && twoScenes ? sceneB : sceneA;
              const on = cur.region_name === r.region_name;
              const k = kindOf(r.region_name);
              const I = k?.Icon ?? MapPin;
              return (
                <button key={r.region_name} type="button" aria-pressed={on} onClick={() => (mapTarget === "B" && twoScenes ? setSceneB : setSceneA)(r)}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 ${on ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_9%,var(--panel))]" : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--brand)]"}`}>
                  <I className={`h-5 w-5 ${on ? "text-[var(--brand)]" : "text-[var(--muted)]"}`} aria-hidden />
                  <span className="text-sm font-semibold leading-tight text-foreground">{shortName(r.region_name)}</span>
                  {k && <span className="text-xs text-[var(--muted)]">{t(k.pt, k.en)}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => { setTwoScenes((v) => !v); setMapTarget(twoScenes ? "A" : "B"); }} aria-pressed={twoScenes}
            className={`mb-4 flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${twoScenes ? "border-[var(--orange)] bg-[color-mix(in_oklab,var(--orange)_10%,var(--panel))]" : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--orange)]"}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${twoScenes ? "bg-[var(--orange)] text-white" : "bg-[var(--panel-2)] text-[var(--orange)]"}`}><SplitSquareHorizontal className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">{twoScenes ? t("Comparando dois lugares", "Comparing two places") : t("Comparar com outro lugar", "Compare with another place")}</span>
              <span className="block text-sm text-[var(--muted)]">{t("A mesma pista pode subir num lugar e descer no outro, mesmo com a mesma causa.", "The same clue can rise in one place and fall in another, even with the same cause.")}</span>
            </span>
            <span className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${twoScenes ? "bg-[var(--orange)]" : "bg-[var(--line)]"}`} aria-hidden>
              <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${twoScenes ? "translate-x-5" : ""}`} />
            </span>
          </button>
          <div className={`mb-4 grid gap-3 ${twoScenes ? "sm:grid-cols-2" : ""}`}>
            {([["A", sceneA, setSceneA, "var(--brand)"], ...(twoScenes ? [["B", sceneB, setSceneB, "var(--orange)"]] : [])] as [string, ScenePoint, (s: ScenePoint) => void, string][]).map(([k, s, set, col]) => (
              <div key={k} onClick={() => setMapTarget(k as "A" | "B")}
                className="flex cursor-pointer flex-wrap items-center gap-2 rounded-2xl border bg-[var(--panel)] p-3 text-sm"
                style={{ borderColor: (twoScenes ? mapTarget === k : true) ? col : "var(--line)" }}>
                <MapPin className="h-4 w-4" style={{ color: col }} aria-hidden />
                <span className="font-bold" style={{ color: col }}>{t("Lugar", "Place")} {k}</span>
                <input aria-label={t(`Nome do lugar ${k}`, `Place ${k} name`)} value={s.region_name} onChange={(e) => set({ ...s, region_name: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-foreground" />
                <input aria-label="Latitude" type="number" step="0.01" min={-90} max={90} value={s.latitude}
                  onChange={(e) => set({ ...s, latitude: Number(e.target.value) })} className="w-24 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-foreground" />
                <input aria-label="Longitude" type="number" step="0.01" min={-180} max={180} value={s.longitude}
                  onChange={(e) => set({ ...s, longitude: Number(e.target.value) })} className="w-24 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-foreground" />
              </div>
            ))}
          </div>
          {ACCOUNT_FEATURES_ENABLED && (
            <PlaceSearch target={twoScenes ? mapTarget : "A"} focus={twoScenes && mapTarget === "B" ? sceneB : sceneA}
              onSelect={(target, point) => (target === "A" ? setSceneA : setSceneB)(point)} />
          )}
          <MapSelector lang={lang} sceneA={sceneA} sceneB={twoScenes ? sceneB : null} activeTarget={twoScenes ? mapTarget : "A"}
            latStep={primary.lat_step} lonStep={primary.lon_step}
            onSelectPoint={(target, lat, lon) =>
              (target === "A" ? setSceneA : setSceneB)({ region_name: `${t("Ponto", "Point")} ${lat}, ${lon}`, latitude: lat, longitude: lon })} />
        </Question>

        <Question id="q3" n={3} title={t("Quantos anos vamos olhar?", "How many years should we look at?")}
          hint={t("Uma tendência precisa de tempo. Com menos de 15 anos não dá para separar a mudança do ruído.", "A trend needs time. Under 15 years, change can't be told apart from noise.")}>
          <div className="mb-6 flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" aria-pressed={activePeriod === p.id} onClick={() => { setStartYear(p.from); setEndYear(p.to); }}
                className={`h-11 rounded-full border px-4 text-sm font-semibold transition ${activePeriod === p.id ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_12%,var(--panel))] text-foreground" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--brand)] hover:text-foreground"}`}>
                {t(p.pt, p.en)}
              </button>
            ))}
            <span className={`inline-flex h-11 items-center rounded-full px-4 text-sm ${activePeriod === "custom" ? "font-semibold text-foreground" : "text-[var(--muted)]"}`}>{t("ou arraste a régua", "or drag the timeline")}</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="font-serif text-4xl font-bold tabular-nums text-foreground">{startYear}</span>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${nYears >= MIN_YEARS ? "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)]" : "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] text-[var(--warning)]"}`}>
              {nYears} {t("anos", "years")}
            </span>
            <span className="font-serif text-4xl font-bold tabular-nums text-foreground">{endYear}</span>
          </div>
          <div className="relative mt-4">
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--line)]" />
            <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[var(--brand-2)] to-[var(--orange)]"
              style={{ left: `${pct(startYear)}%`, right: `${100 - pct(endYear)}%` }} />
            <div className="dual-range">
              <input type="range" min={FIRST_YEAR} max={LAST_YEAR} value={startYear} aria-label={t("Ano inicial", "Start year")}
                onChange={(e) => setStartYear(Math.min(Number(e.target.value), endYear - 1))} />
              <input type="range" min={FIRST_YEAR} max={LAST_YEAR} value={endYear} aria-label={t("Ano final", "End year")}
                onChange={(e) => setEndYear(Math.max(Number(e.target.value), startYear + 1))} />
            </div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
            {[1981, 1990, 2000, 2010, 2020, 2025].map((y) => <span key={y}>{y}</span>)}
          </div>
          {nYears < MIN_YEARS && (
            <p className="mt-3 text-sm text-[var(--warning)]">{t(`Com menos de ${MIN_YEARS} anos o resultado sai como "poucos dados".`, `Under ${MIN_YEARS} years the result will say "not enough data".`)}</p>
          )}

          <div className="mt-8">
            <button type="button" disabled={loading} onClick={() => void run()}
              className="relative flex h-16 w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] px-6 text-lg font-bold text-white shadow-[var(--button-shadow)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-80">
              {loading && <span className="scan-bar absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent" aria-hidden />}
              <ScanSearch className="h-6 w-6" aria-hidden />
              {loading ? t("Examinando as pistas…", "Examining the clues…") : t("Examinar as evidências", "Examine the evidence")}
            </button>
            <details className="mt-3 text-sm text-[var(--muted)]">
              <summary className="inline-flex cursor-pointer items-center gap-1.5 hover:text-foreground"><Settings2 className="h-3.5 w-3.5" aria-hidden />{t("Opções avançadas", "Advanced options")}</summary>
              <label className="mt-2 flex flex-wrap items-center gap-2">
                {t("Fonte dos dados", "Data source")}
                <select value={mode} onChange={(e) => setMode(e.target.value as DataMode)} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-2 text-foreground">
                  <option value="auto">{t("NASA ao vivo, com cópia salva de reserva", "NASA live, with saved copy as backup")}</option>
                  <option value="cache">{t("Cópia salva (mais rápido)", "Saved copy (faster)")}</option>
                  <option value="live">{t("Só NASA ao vivo", "NASA live only")}</option>
                </select>
              </label>
            </details>
          </div>
          {error && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--warning)]/40 bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] p-3 text-sm text-[var(--warning)]" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {error}
            </p>
          )}
        </Question>

        {/* VERDICT */}
        <section id="veredito" className="scroll-mt-24 space-y-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">{t("O veredito", "The verdict")}</p>
            <h2 className="mt-1 text-3xl font-bold text-foreground sm:text-4xl">{t("O que os dados dizem", "What the data says")}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--muted)]">{t("A estatística decide o carimbo, nunca uma IA.", "Statistics decide the stamp, never AI.")}</p>
          </div>
          {loading && !result && (
            <div className="surface flex flex-col items-center gap-3 rounded-3xl p-10 text-center text-[var(--muted)]">
              <ScanSearch className="h-10 w-10 animate-pulse text-[var(--brand)]" aria-hidden />
              {t("Buscando dados da NASA e rodando os testes…", "Fetching NASA data and running the tests…")}
            </div>
          )}
          {!result && !loading && (
            <div className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--panel-2)]/40 p-10 text-center text-[var(--muted)]">
              <ScanSearch className="mx-auto mb-3 h-10 w-10 text-[var(--line)]" aria-hidden />
              {t("Nenhum caso aberto ainda. Responda as três perguntas e examine, ou assista a um caso lá em cima.",
                "No case open yet. Answer the three questions and examine, or watch a case above.")}
            </div>
          )}
          {result && (
            <div className={`space-y-8 ${loading ? "opacity-60" : ""}`}>
              {result.runs.map((r) => {
                const two = !!r.scene_b;
                const key = `${result.case_id}-${r.variable.parameter_id}`;
                return (
                  <div key={key} className="space-y-4">
                    {r.errors.map((e) => <p key={e} className="rounded-xl border border-[var(--warning)]/40 bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] px-3 py-2 text-sm text-[var(--warning)]">{e}</p>)}
                    {r.comparison && (
                      <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${r.comparison.confirmed_opposite_trends ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] text-[var(--brand)]" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]"}`}>
                        {r.scene_a && r.scene_b ? plainComparison(r.variable.parameter_id, r.scene_a, r.scene_b, lang) : t(r.comparison.summary_pt, r.comparison.summary_en)}
                      </p>
                    )}
                    <div className={`grid gap-4 ${two ? "xl:grid-cols-2" : ""}`}>
                      {([["scene_a", t("Lugar A", "Place A"), "var(--brand)"], ["scene_b", t("Lugar B", "Place B"), "var(--orange)"]] as const).map(([k, label, color]) => {
                        const s = r[k];
                        if (!s) return null;
                        return <CaseVerdict key={k} run={r} scene={s} lang={lang} accent={color} compact={two} label={two ? label : undefined} onOpenEvidence={(sc) => setEvidence({ run: r, scene: sc })} />;
                      })}
                    </div>
                    {r.scene_a && (
                      <div className="flex justify-end">
                        <button type="button" onClick={() => saveToMural(r)} className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 text-sm font-semibold text-foreground hover:border-[var(--brand)]">
                          {copied === key ? <Check className="h-4 w-4 text-[var(--success)]" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
                          {copied === key ? t("Salvo no mural, link copiado", "Saved to the board, link copied") : t("Salvar no mural de casos", "Save to the case board")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <ComparisonExport result={result} lang={lang} />
              {ACCOUNT_FEATURES_ENABLED && <ComparisonSynthesis result={result} lang={lang} />}
            </div>
          )}
        </section>

        <section id="ods" data-reveal className="scroll-mt-24 pt-6"><SdgPanel activeTargets={primary.sdg_targets} lang={lang} /></section>

        {/* DETECTIVE NOTEBOOK */}
        <section id="caderno" data-reveal className="surface scroll-mt-24 rounded-3xl p-5 sm:p-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground"><BookOpen className="h-6 w-6 text-[var(--brand)]" aria-hidden />{t("Caderno do detetive", "Detective's notebook")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("As palavras que os cientistas usam, explicadas em uma linha.", "The words scientists use, explained in one line.")}</p>
          <dl className="mt-5 grid gap-3 md:grid-cols-2">
            {glossary.map((g) => (
              <div key={g.k} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)]/40 p-4">
                <dt className="font-serif font-bold text-foreground">{g.k}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{g.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* CASE BOARD */}
        <section id="mural" data-reveal className="surface scroll-mt-24 rounded-3xl p-5 sm:p-8">
          <h2 className="text-2xl font-bold text-foreground">{t("Mural de casos", "Case board")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("Cada cartão guarda um link que reabre a mesma investigação.", "Each card keeps a link that reopens the same investigation.")}</p>
          {mural.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">
              {t("Resolva um caso e toque em \"Salvar no mural de casos\" para pendurar o primeiro cartão.", "Solve a case and tap \"Save to the case board\" to pin the first card.")}
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {mural.map((c) => (
                <a key={c.id} href={c.shareUrl} className="block rotate-[-0.6deg] rounded-2xl border border-[var(--line)] bg-[var(--panel-2)]/60 p-4 transition hover:rotate-0 hover:border-[var(--brand)]">
                  <p className="text-xs font-bold text-[var(--brand)]">{friendlyOf(c.parameterId)?.short[lang] ?? c.parameterId} · {c.regions}</p>
                  <h3 className="mt-1 text-base font-bold text-foreground">{c.headline}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{c.question}</p>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mt-10 border-t border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <a href="#topo" className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-[var(--line)]">
                <img src="/brand/orbiting-analytics-globe-256.png" alt="" width={36} height={36} loading="lazy" className="h-9 w-9 object-contain" />
              </span>
              <span className="font-serif text-lg font-bold text-foreground">Earth <span className="text-gradient">Sleuth</span></span>
            </a>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
              {t("Uma linha de tendência descreve o passado; não é previsão climática. Projeto independente, sem endosso da NASA.",
                "A trend line describes the past; it is not a climate forecast. Independent project, not endorsed by NASA.")}
            </p>
            <p className="mt-3 text-xs text-[var(--muted)]">
              {t("Personagem 3D: ", "3D character: ")}
              <a href="https://sketchfab.com/3d-models/bunny-detective-b2ab08f1f5d04d9182400735d6471368" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Bunny Detective</a>
              {t(" por bird (birdii), CC BY 4.0.", " by bird (birdii), CC BY 4.0.")}
            </p>
          </div>
          <section aria-labelledby="nasa-resources-title">
            <h2 id="nasa-resources-title" className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">{t("Dados da NASA", "NASA data")}</h2>
            <ul className="mt-4 space-y-4 text-sm">
              <li>
                <a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--brand)] hover:underline">NASA POWER ↗</a>
                <p className="mt-1 leading-relaxed text-[var(--muted)]">{t("API de séries mensais por coordenadas, do NASA Langley Research Center.", "Monthly time-series API by coordinates, from NASA Langley Research Center.")}</p>
                <p className="mt-1 break-words font-mono text-[11px] text-[var(--muted)]">T2M · T2M_MIN · T2M_MAX · PRECTOTCORR · GWETROOT · EVPTRNS</p>
              </li>
              <li>
                <a href="https://gmao.gsfc.nasa.gov/gmao-products/merra-2/" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--brand)] hover:underline">GMAO MERRA-2 ↗</a>
                <p className="mt-1 leading-relaxed text-[var(--muted)]">{t("Reanálise por trás de todas as pistas, acessada via POWER.", "Reanalysis behind every clue, accessed through POWER.")}</p>
              </li>
            </ul>
          </section>
          <section aria-labelledby="method-title">
            <h2 id="method-title" className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">{t("Método", "Method")}</h2>
            <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
              <li>{t("Mann-Kendall sazonal (Hirsch e Slack, 1984)", "Seasonal Mann-Kendall (Hirsch and Slack, 1984)")}</li>
              <li>{t("Inclinação de Sen com IC de 95%", "Sen's slope with a 95% CI")}</li>
              <li>{t("Correção de Benjamini-Hochberg (FDR)", "Benjamini-Hochberg correction (FDR)")}</li>
              <li>{t("Veredito decidido pela estatística, nunca por IA", "Verdict decided by statistics, never by AI")}</li>
            </ul>
          </section>
        </div>
      </footer>

      <SleuthGuide lang={lang} text={guideText} mood={guideMood} active={talking || loading || !!demo} onSkip={demo ? skipDemo : undefined} />
      {evidence && <EvidenceModal run={evidence.run} scene={evidence.scene} lang={lang} onClose={() => setEvidence(null)} />}
    </div>
  );
}
