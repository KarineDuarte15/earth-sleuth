// The AI comparison summary calls a paid model with the server's own key (AI_* in .env.example),
// so it only shows when the deployment opts in with VITE_AI_SYNTHESIS=on.
const AI_SYNTHESIS_ENABLED = import.meta.env.VITE_AI_SYNTHESIS === "on";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, useNavigate } from "@tanstack/react-router";
import { analyzeInvestigation } from "@/lib/analyze.functions";
import {
  Thermometer, Moon, Sun, CloudRain, Sprout, Leaf, Search, SplitSquareHorizontal, Share2, Check, AlertCircle,
  MapPin, ScanSearch, ArrowRight, ArrowDown, Sparkles, Database, Sigma, Play, Trees,
  BookOpen, HelpCircle, CalendarRange, Pin, Pencil, Paperclip, Fingerprint, Footprints, Compass, Star, Radio, Tv, Monitor, Smartphone, Rocket, Snowflake, type LucideIcon,
} from "lucide-react";
import { FRONTEND_CLUES, PRESET_CASES, PELOTAS, clueById, type PresetCase } from "@/lib/catalog";
import { friendlyOf, plainComparison, plainVerdict } from "@/lib/friendly";
import type { ClueRun, InvestigationResponse, Lang, SceneAnalysis, ScenePoint } from "@/types/sleuth";
import EvidenceModal from "@/components/EvidenceModal";
import SdgPanel from "@/components/SdgPanel";
import PlaceSearch from "@/components/PlaceSearch";
import ComparisonExport from "@/components/ComparisonExport";
import ComparisonSynthesis from "@/components/ComparisonSynthesis";
import SiteHeader from "@/components/SiteHeader";
import HeroStage from "@/components/HeroStage";
import CaseVerdict from "@/components/CaseVerdict";
import ClueScene from "@/components/ClueScene";
import SleuthGuide, { type GuideMood, type GuideSpot } from "@/components/SleuthGuide";

const MapSelectorLazy = lazy(() => import("@/components/MapSelector"));
const mapFallback = <div className="flex h-[340px] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] text-sm text-[var(--muted)]">Loading map…</div>;
function MapSelector(props: React.ComponentProps<typeof MapSelectorLazy>) {
  return (
    <ClientOnly fallback={mapFallback}>
      <Suspense fallback={mapFallback}><MapSelectorLazy {...props} /></Suspense>
    </ClientOnly>
  );
}

const GlobeLazy = lazy(() => import("@/components/GlobeSelector"));
const globeFallback = <div className="space flex h-[380px] items-center justify-center font-serif text-lg font-bold text-white sm:h-[clamp(260px,calc(100vh-520px),540px)]">…</div>;
function GlobeSelector(props: React.ComponentProps<typeof GlobeLazy>) {
  return (
    <ClientOnly fallback={globeFallback}>
      <Suspense fallback={globeFallback}><GlobeLazy {...props} /></Suspense>
    </ClientOnly>
  );
}

// Starting points next to the globe: kinds of landscape around the world, as the challenge suggests,
// not cities. Each one is just a grid square inside that landscape.
const QUICK_PLACES: { Icon: LucideIcon; col: string; pt: string; en: string; wherePt: string; whereEn: string; latitude: number; longitude: number }[] = [
  { Icon: Sun, col: "var(--sun)", pt: "Deserto", en: "Desert", wherePt: "Saara, África", whereEn: "Sahara, Africa", latitude: 23.5, longitude: 12.5 },
  { Icon: Trees, col: "var(--mint)", pt: "Floresta tropical", en: "Rain forest", wherePt: "Amazônia, América do Sul", whereEn: "Amazon, South America", latitude: -3.5, longitude: -62.5 },
  { Icon: Snowflake, col: "var(--aqua)", pt: "Gelo polar", en: "Polar ice", wherePt: "Groenlândia", whereEn: "Greenland", latitude: 72, longitude: -40 },
];

const FIRST_YEAR = 1981;
const LAST_YEAR = 2025;
const MIN_YEARS = 15;

const CLUE_ICON: Record<string, LucideIcon> = {
  T2M: Thermometer, T2M_MIN: Moon, T2M_MAX: Sun, PRECTOTCORR: CloudRain, GWETROOT: Sprout, EVPTRNS: Leaf,
};

const CLUE_COLOR: Record<string, string> = {
  T2M: "var(--coral)", T2M_MIN: "var(--grape)", T2M_MAX: "var(--tang)", PRECTOTCORR: "var(--aqua)", GWETROOT: "var(--mint)", EVPTRNS: "var(--sun)",
};

const shortName = (name: string) => name.split("/")[0].trim();

// What everyday technology looked like in each stretch of the timeline: the old-to-new feel of the period step.
const ERAS: { before: number; Icon: LucideIcon; pt: string; en: string }[] = [
  { before: 1990, Icon: Radio, pt: "tempo do rádio de pilha", en: "transistor-radio days" },
  { before: 2000, Icon: Tv, pt: "tempo da TV de tubo", en: "tube-TV days" },
  { before: 2010, Icon: Monitor, pt: "tempo do PC de mesa", en: "desktop-PC days" },
  { before: 2020, Icon: Smartphone, pt: "tempo do smartphone", en: "smartphone days" },
  { before: 9999, Icon: Rocket, pt: "hoje", en: "today" },
];

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

const SECTIONS = ["topo", "casos", "q1", "veredito", "caderno", "mural"] as const;
type SectionId = (typeof SECTIONS)[number];

const SECTION_LINE: Record<SectionId | "q2" | "q3", DemoLine> = {
  topo: { pt: "Oi! Eu sou o Sr. Coelho, um detetive de dados. Vamos descobrir se o clima está mudando mesmo em algum lugar?", en: "Hi! I'm Mr. Bunny, a data detective. Shall we find out if the climate is really changing somewhere?" },
  casos: { pt: "Comece aqui! Escolha um caso e aperte Assistir. Eu resolvo na sua frente e explico cada passo.", en: "Start here! Pick a case and press Watch. I'll solve it in front of you and explain every step." },
  q1: { pt: "Passo 1: qual é a sua pergunta? Cada cartão é uma variável climática da NASA, explicada em palavras simples.", en: "Step 1: what's your question? Each card is a NASA climate variable, in plain words." },
  q2: { pt: "Passo 2: onde investigar? Gire o planeta e crave o alfinete. Dica: compare dois lugares, a mesma pista pode subir num e descer no outro!", en: "Step 2: where should we look? Spin the planet and drop the pin. Tip: compare two places, the same clue can rise in one and fall in the other!" },
  q3: { pt: "Passo 3: de quando até quando? Preciso de pelo menos 15 para dar um veredito. Mais anos, evidência mais forte.", en: "Step 3: from when to when? I need at least 15 to give a verdict. More years, stronger evidence." },
  veredito: { pt: "O veredito aparece aqui depois que você apertar Examinar as evidências.", en: "Your verdict shows up here once you press Examine the evidence." },
  caderno: { pt: "Meu caderno de detetive: cada palavra difícil explicada em uma linha.", en: "My detective notebook: every tricky word explained in one line." },
  mural: { pt: "Casos resolvidos vão para o mural. Cada cartão é um link que reabre a investigação.", en: "Solved cases go on the board. Each card is a link that reopens the case." },
};

// Sleuth walks to a different spot for each part of the page.
const SPOT: Record<SectionId | "q2" | "q3", GuideSpot> = {
  topo: "hero", casos: "left", q1: "right", q2: "left", q3: "right", veredito: "left", caderno: "right", mural: "left",
};

const CONFETTI_COLORS = ["#ffc93c", "#ff6b98", "#3fd4ff", "#a78bff", "#3fe0ae", "#ff9248"];
/** A short burst of confetti when a real trend is found. */
function Confetti({ burst }: { burst: string }) {
  const pieces = useMemo(() => Array.from({ length: 44 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.8 + Math.random() * 1.6, w: 7 + Math.random() * 8, c: CONFETTI_COLORS[i % 6],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [burst]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((p, i) => <span key={i} className="confetti" style={{ left: `${p.left}%`, width: p.w, height: p.w * 1.6, background: p.c, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />)}
    </div>
  );
}

interface MuralCard {
  id: string; question: string; parameterId: string; regions: string;
  status: string; headline: string; shareUrl: string;
}

interface RunInput { clues: string[]; sceneA: ScenePoint; sceneB: ScenePoint | null; startYear: number; endYear: number; question: string }

function StepHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-5">
      <h3 className="flex items-start gap-2 text-2xl font-bold text-foreground sm:text-3xl">
        <Pencil className="wiggle mt-1 h-6 w-6 shrink-0 text-[var(--coral)]" aria-hidden /><span className="write-on">{title}</span>
      </h3>
      <p className="mt-1 text-[15px] font-semibold text-[var(--muted)]">{hint}</p>
    </div>
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
  const [clues, setClues] = useState<string[]>(["T2M_MIN"]);
  const [startYear, setStartYear] = useState(FIRST_YEAR);
  const [endYear, setEndYear] = useState(LAST_YEAR);
  const [twoScenes, setTwoScenes] = useState(false);
  const [mapTarget, setMapTarget] = useState<"A" | "B">("A");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cheer, setCheer] = useState(0);
  const [peering, setPeering] = useState(false);
  const [sceneA, setSceneA] = useState<ScenePoint>(PRESET_CASES[0].sceneA);
  const [sceneB, setSceneB] = useState<ScenePoint>(PELOTAS);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigationResponse | null>(null);
  const [evidence, setEvidence] = useState<{ run: ClueRun; scene: SceneAnalysis } | null>(null);
  const [mural, setMural] = useState<MuralCard[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId>("topo");
  // Guided demo: which case is playing and which step it is on (0 intro, 1 clue, 2 place, 3 years).
  const [demo, setDemo] = useState<{ caseId: string; stage: 0 | 1 | 2 | 3 } | null>(null);
  // "Watch a case" on the hero opens the tutorial at its first screen: the three cases in the spotlight.
  const [picking, setPicking] = useState(false);
  // The case file as it was before the tutorial started, so leaving the tutorial puts everything back.
  const beforeDemo = useRef<{ question: string; clues: string[]; twoScenes: boolean; sceneA: ScenePoint; sceneB: ScenePoint; startYear: number; endYear: number; step: 1 | 2 | 3; result: InvestigationResponse | null; scrollY: number } | null>(null);
  // The first time the case file comes into view, a short scene plays: the screen irises shut,
  // a notebook opens and the camera dives into its page.
  const [intro, setIntro] = useState(false);
  const [globeFailed, setGlobeFailed] = useState(false);
  // The magnifier sweeps across the case file when the evidence is examined.
  const [sweep, setSweep] = useState(false);
  const restored = useRef(false);
  useScrollReveal([result, mural.length, lang, demo, picking]);

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

  useEffect(() => {
    const el = document.getElementById("q1");
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.55) return;
    let t1 = 0, t2 = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setIntro(true);
      t1 = window.setTimeout(() => el.scrollIntoView({ behavior: "instant", block: "start" }), 700);
      t2 = window.setTimeout(() => setIntro(false), 3000);
    }, { rootMargin: "0px 0px -45% 0px" });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const primary = useMemo(() => clueById(clues[0]) ?? FRONTEND_CLUES[0], [clues]);
  // The earliest year every chosen clue has data for; the timeline cannot start before it.
  const dataStart = Math.max(FIRST_YEAR, ...clues.map((id) => clueById(id)?.min_year ?? FIRST_YEAR));
  const latestStart = Math.max(dataStart, startYear);
  const nYears = endYear - latestStart + 1;

  const toggleClue = (id: string) => {
    if (!clues.includes(id)) setCheer((c) => c + 1);
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
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setSweep(!calm);
    setTimeout(() => { setSweep(false); scrollToId("veredito"); }, calm ? 60 : 850);
    try {
      const body = await analyzeInvestigation({
        data: {
          question: input.question || t("Investigação livre", "Open investigation"),
          parameter_ids: input.clues, start_year: input.startYear, end_year: input.endYear, mode: "auto", lang,
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
    setStep(1);
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

  // Guided demo, one step per click: Sleuth fills a step, the choice is spotlighted, the visitor presses Continue.
  const demoStage = (c: PresetCase, stage: 0 | 1 | 2 | 3) => {
    if (stage === 0) { setResult(null); setStep(1); setClues([]); setTwoScenes(false); }
    if (stage === 1) { setStep(1); setQuestion(lang === "pt" ? c.question_pt : c.question_en); setClues(c.clues); }
    if (stage === 2) { setStep(2); setTwoScenes(c.twoScenes); setMapTarget("A"); setSceneA(c.sceneA); if (c.sceneB) setSceneB(c.sceneB); }
    if (stage === 3) { setStep(3); setStartYear(FIRST_YEAR); setEndYear(LAST_YEAR); }
    setDemo({ caseId: c.id, stage });
    // The place step is tall: line the page up with its content, so the whole globe is on screen.
    setTimeout(() => scrollToId(stage === 2 ? "step-body" : "q1"), 40);
  };
  const snapshot = () => { beforeDemo.current = { question, clues, twoScenes, sceneA, sceneB, startYear, endYear, step, result, scrollY: window.scrollY }; };
  const startPicking = () => { snapshot(); setPicking(true); scrollToId("casos-grid"); };
  const watchDemo = (c: PresetCase) => {
    if (!picking) snapshot();
    setPicking(false);
    demoStage(c, 0);
  };
  const demoCase = demo ? PRESET_CASES.find((p) => p.id === demo.caseId) ?? null : null;
  const demoNext = () => {
    if (!demo || !demoCase) return;
    if (demo.stage < 3) { demoStage(demoCase, (demo.stage + 1) as 1 | 2 | 3); return; }
    setDemo(null);
    void run(caseInput(demoCase));
  };

  // Leaving the tutorial at any step: everything stops and the page goes back to how it was.
  const exitDemo = () => {
    const b = beforeDemo.current;
    setDemo(null);
    setPicking(false);
    if (!b) return;
    setQuestion(b.question); setClues(b.clues); setTwoScenes(b.twoScenes); setMapTarget("A");
    setSceneA(b.sceneA); setSceneB(b.sceneB); setStartYear(b.startYear); setEndYear(b.endYear);
    setStep(b.step); setResult(b.result);
    setTimeout(() => window.scrollTo({ top: b.scrollY, behavior: "smooth" }), 60);
  };
  const exitRef = useRef(exitDemo);
  exitRef.current = exitDemo;
  useEffect(() => {
    if (!demo && !picking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") exitRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demo, picking]);

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
    setCheer((c) => c + 1);
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

  const [confetti, setConfetti] = useState<string | null>(null);
  useEffect(() => {
    if (!result || !resultLine?.real) return;
    setConfetti(result.case_id);
    const id = setTimeout(() => setConfetti(null), 4200);
    return () => clearTimeout(id);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const guideKey = section === "q1" ? (step === 1 ? "q1" : step === 2 ? "q2" : "q3") : section;
  const [talking, setTalking] = useState(false);
  const demoLine = demo ? DEMO_SCRIPT[demo.caseId][(["intro", "clue", "place", "years"] as const)[demo.stage]] : null;
  const guideText = demoLine ? L(demoLine)
    : picking ? t("Escolha um dos três casos e aperte Assistir. Eu resolvo na sua frente e explico cada passo.", "Pick one of the three cases and press Watch. I'll solve it in front of you and explain every step.")
    : loading ? t("Investigando... estou buscando décadas de dados mensais da NASA e testando cada pista.", "Investigating... I'm pulling decades of monthly NASA data and testing each clue.")
    : resultLine && section === "veredito" ? resultLine.text
    : L(SECTION_LINE[guideKey]);
  useEffect(() => {
    setTalking(true);
    const ms = Math.min(6000, Math.max(2200, guideText.length * 45));
    const id = setTimeout(() => setTalking(false), ms);
    return () => clearTimeout(id);
  }, [guideText]);
  const guideMood: GuideMood = demo || picking ? "talk"
    : loading || peering ? "investigate"
    : resultLine?.real && section === "veredito" && talking ? "jump"
    : talking ? "talk" : "idle";

  const pct = (y: number) => ((y - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * 100;

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

  const sectionTitle = (kicker: string, title: React.ReactNode, color: string) => (
    <div data-reveal className="mb-8 text-center">
      <span className="outline-ink inline-block -rotate-2 rounded-full px-4 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--on-color)] shadow-[3px_3px_0_0_var(--pop)]" style={{ background: color }}>{kicker}</span>
      <h2 className="mt-4 text-4xl font-bold leading-tight text-foreground sm:text-5xl">{title}</h2>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <SiteHeader lang={lang} setLang={setLang} boardCount={mural.length} tour={!!demo || picking} onStopTour={exitDemo} />
      {confetti && <Confetti burst={confetti} />}

      {/* HERO */}
      <section id="topo" className="hero-bg -mt-[76px] pt-[76px]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1.1fr_1fr] lg:pb-20">
          <div>
            <p className="fade-up outline-ink inline-flex -rotate-2 items-center gap-2 rounded-full bg-[var(--panel)] px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wider text-foreground shadow-[3px_3px_0_0_var(--pop)]">
              <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-[var(--success)]" aria-hidden />
              {t("Missão aberta · 3 casos para resolver", "Mission open · 3 cases to crack")}
            </p>
            <h1 className="fade-up delay-1 mt-6 text-[2.9rem] font-bold leading-[1.02] text-foreground sm:text-7xl">
              {t("Vire um ", "Become a ")}<span className="text-gradient">{t("detetive", "climate")}</span>{t(" do ", " ")}
              <span className="marker">{t("clima", "detective")}</span>
              <Search className="wiggle ml-2 inline h-10 w-10 text-[var(--tang)] sm:h-14 sm:w-14" aria-hidden />
            </h1>
            <p className="fade-up delay-2 mt-6 max-w-xl text-xl leading-relaxed text-[var(--muted)]">
              {t("O planeta deixa pistas. Escolha uma, aponte um lugar e descubra com o Sr. Coelho, usando 45 anos de dados da NASA, se existe mesmo uma ",
                "The planet leaves clues. Pick one, point at a place and find out with Mr. Bunny, using 45 years of NASA data, whether there is a real ")}
              <b className="text-foreground">{t("tendência", "trend")}</b>
              {t(" ou se foi só o sobe e desce normal do clima.", " or just the climate's normal ups and downs.")}
            </p>
            <div className="fade-up delay-3 mt-8 flex flex-col gap-4 sm:flex-row">
              <button type="button" onClick={startPicking} className="btn-pop group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[var(--sun)] px-7 font-serif text-lg font-bold text-[var(--on-color)]">
                <Play className="group-wiggle h-5 w-5 fill-current" aria-hidden /> {t("Assistir a um caso", "Watch a case")}
              </button>
              <a href="#q1" className="btn-pop inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[var(--panel)] px-7 font-serif text-lg font-bold text-foreground">
                {t("Investigar agora", "Investigate now")} <ArrowDown className="h-5 w-5" aria-hidden />
              </a>
            </div>
          </div>
          <div className="pop-in delay-2 mt-24 sm:mt-0"><HeroStage /></div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="marquee border-y-[2.5px] border-[var(--stroke)] bg-[#1b1440] py-3 font-serif text-lg font-bold text-[#ffc93c]" aria-hidden>
        {[0, 1].map((k) => (
          <div key={k}>
            {FRONTEND_CLUES.map((c, i) => {
              const I = CLUE_ICON[c.parameter_id];
              return <span key={c.parameter_id} className="flex items-center gap-2.5 whitespace-nowrap" style={{ color: ["#ffc93c", "#3fd4ff", "#ff6b98", "#3fe0ae", "#a78bff", "#ff9248"][i % 6] }}>{I && <I className="h-5 w-5" />}{friendlyOf(c.parameter_id)?.question[lang]}<span className="pl-6 text-white/40">✦</span></span>;
            })}
          </div>
        ))}
      </div>

      {/* HOW IT WORKS + DEMO CASES */}
      <section id="casos" className="scroll-mt-24 border-b-[2.5px] border-[var(--stroke)] bg-[var(--band)] py-16">
        <div className="mx-auto max-w-6xl px-4">
          {sectionTitle(t("Comece por aqui", "Start here"), <>{t("Escolha um caso e ", "Pick a case and ")}<span className="text-gradient">{t("aperte Assistir", "press Watch")}</span></>, "var(--coral)")}
          <p data-reveal className="-mt-4 mb-8 text-center text-lg font-semibold text-[var(--muted)]">{t("O Sr. Coelho resolve o caso na sua frente e explica cada passo.", "Mr. Bunny solves the case in front of you and explains every step.")}</p>
          <div id="casos-grid" className={`grid scroll-mt-24 gap-7 md:grid-cols-3 ${picking ? "relative z-[45]" : ""}`}>
            {PRESET_CASES.map((c, i) => {
              const col = ["var(--sun)", "var(--coral)", "var(--aqua)"][i % 3];
              return (
                <div key={c.id} data-reveal={["left", "zoom", "right"][i % 3]} style={{ transitionDelay: `${i * 100}ms` }} className="group relative pt-7">
                  <span className="outline-ink absolute left-5 top-0 z-0 rounded-t-2xl border-b-0 px-4 pb-3 pt-1.5 font-mono text-xs font-bold uppercase text-[var(--on-color)]" style={{ background: col }}>
                    {t("Caso", "Case")} #{String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="pop lift relative z-10 flex h-full flex-col overflow-hidden rounded-3xl">
                    <div className="dots relative flex h-28 items-center justify-center gap-3 border-b-[2.5px] border-[var(--stroke)]" style={{ backgroundColor: col }}>
                      {c.clues.map((id, k) => { const I = CLUE_ICON[id]; return I ? <span key={id} className="outline-ink float grid h-14 w-14 place-items-center rounded-2xl bg-[var(--panel)] text-foreground shadow-[3px_3px_0_0_var(--pop)]" style={{ animationDelay: `${-k * 0.9}s`, rotate: `${[-8, 6, -4][k % 3]}deg` }}><I className="h-7 w-7" aria-hidden /></span> : null; })}
                      <span className="absolute right-3 top-3 rotate-6 rounded-md border-2 border-[#dc3f2c] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#dc3f2c]">{t("Aberto", "Open")}</span>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="font-serif text-2xl font-bold text-foreground">{t(c.title_pt.split("·")[1]?.trim() ?? c.title_pt, c.title_en.split("·")[1]?.trim() ?? c.title_en)}</h3>
                      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-[var(--muted)]">{t(c.question_pt, c.question_en)}</p>
                      <p className="mt-4 flex items-center gap-1.5 text-sm font-bold text-foreground"><MapPin className="h-4 w-4 text-[var(--coral)]" aria-hidden />{shortName(c.sceneA.region_name)}{c.sceneB ? ` × ${shortName(c.sceneB.region_name)}` : ""}</p>
                      <div className="mt-5 flex gap-2.5">
                        <button type="button" onClick={() => watchDemo(c)} className="btn-pop inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--brand)] px-4 font-serif font-bold text-[var(--primary-foreground)]">
                          <Play className="h-4 w-4 fill-current" aria-hidden /> {t("Assistir", "Watch")}
                        </button>
                        <button type="button" onClick={() => { setPicking(false); applyCase(c); scrollToId("q1"); }} className="btn-pop inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-[var(--panel)] px-4 font-serif font-bold text-foreground">
                          {t("Abrir", "Open")} <ArrowRight className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div data-reveal className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="font-serif text-xl font-bold text-foreground">{t("Já entendeu como funciona?", "Got the idea?")}</p>
            <a href="#q1" className="btn-pop inline-flex h-14 items-center gap-2 rounded-full bg-[var(--panel)] px-7 font-serif text-lg font-bold text-foreground">
              {t("Agora é a sua vez", "Now it's your turn")} <ArrowDown className="h-5 w-5" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      {/* THE INVESTIGATION */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16">
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute inset-0 hidden text-[var(--on-color)] lg:block">
            {([
              [Fingerprint, "var(--grape)", "left-[2%] top-0 h-14 w-14 -rotate-12", "float"],
              [Footprints, "var(--mint)", "left-[11%] top-[58%] h-12 w-12 rotate-6", "float-fast"],
              [Compass, "var(--aqua)", "right-[3%] top-[4%] h-14 w-14 rotate-12", "float-slow"],
              [Search, "var(--coral)", "right-[12%] top-[60%] h-12 w-12 -rotate-6", "wiggle"],
            ] as [LucideIcon, string, string, string][]).map(([I, bg, pos, anim], i) => (
              <span key={i} className={`outline-ink absolute grid place-items-center rounded-2xl shadow-[4px_4px_0_0_var(--pop)] ${pos} ${anim}`} style={{ background: bg }}><I className="h-7 w-7" /></span>
            ))}
            <Star className="blink-star absolute left-[22%] top-[10%] h-5 w-5 fill-current text-[var(--sun)]" />
            <Star className="blink-star absolute right-[23%] top-[18%] h-4 w-4 fill-current text-[var(--coral)]" style={{ animationDelay: "-0.9s" }} />
          </span>
          {sectionTitle(t("Sua vez", "Your turn"), <>{t("Monte a ficha e peça o ", "Fill in the case file, get a ")}<span className="text-gradient">{t("veredito", "verdict")}</span></>, "var(--sun)")}
        </div>

        <section id="q1" className={`casefile pop relative scroll-mt-28 overflow-hidden rounded-[32px] ${demo ? "pointer-events-none z-[45]" : ""}`}>
          {sweep && (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
              <span className="sweep absolute grid h-44 w-44 place-items-center rounded-full border-[10px] border-[var(--stroke)] bg-white/30 shadow-[6px_6px_0_0_var(--pop)] backdrop-blur-[1px] backdrop-brightness-125 backdrop-saturate-150">
                <span className="absolute left-[88%] top-[88%] h-6 w-24 origin-left rotate-45 rounded-full border-[3px] border-[var(--stroke)] bg-[var(--tang)]" />
              </span>
            </div>
          )}
          <div role="tablist" aria-label={t("Passos da investigação", "Investigation steps")} className="grid grid-cols-3 border-b-[2.5px] border-[var(--stroke)]">
            {([
              { n: 1, I: HelpCircle, c: "var(--grape)", h: t("O quê?", "What?") },
              { n: 2, I: MapPin, c: "var(--mint)", h: t("Onde?", "Where?") },
              { n: 3, I: CalendarRange, c: "var(--tang)", h: t("Quando?", "When?") },
            ] as const).map(({ n, I, c, h }) => {
              const on = step === n;
              return (
                <button key={n} type="button" role="tab" aria-selected={on} onClick={() => setStep(n)}
                  style={{ backgroundColor: on ? c : undefined }}
                  className={`group relative flex min-w-0 flex-col items-center gap-1 px-2 py-3 text-center transition sm:flex-row sm:gap-3 sm:px-5 sm:py-4 sm:text-left ${n > 1 ? "border-l-[2.5px] border-[var(--stroke)]" : ""} ${on ? "dots text-[var(--on-color)]" : "bg-[var(--panel-2)] text-foreground hover:bg-[var(--panel)]"}`}>
                  <span className={`outline-ink grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--panel)] font-serif text-xl font-bold text-foreground sm:h-12 sm:w-12 ${on ? "-rotate-6 shadow-[3px_3px_0_0_var(--pop)]" : ""}`}>{n}</span>
                  <span className="flex min-w-0 items-center justify-center gap-1.5 font-serif text-lg font-bold leading-tight sm:justify-start sm:text-2xl"><I className="group-wiggle hidden h-6 w-6 sm:block" aria-hidden />{h}</span>
                </button>
              );
            })}
          </div>
          <div aria-hidden className="spiral" />
          <div id="step-body" className="relative scroll-mt-20 p-5 [perspective:1600px] sm:p-7">
          <div key={`flip${step}`} aria-hidden className="page-flip ruled pointer-events-none absolute inset-0 z-10 bg-[var(--panel)]" />
        {step === 1 && (
          <div key="s1" className="page-in">
          <StepHead title={t("O que você quer descobrir?", "What do you want to find out?")} hint={t("Toque em uma ou mais pistas. Cada uma é uma variável da NASA, testada separadamente.", "Tap one or more clues. Each is a NASA variable, tested on its own.")} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FRONTEND_CLUES.map((c) => {
              const on = clues.includes(c.parameter_id);
              const I = CLUE_ICON[c.parameter_id];
              const f = friendlyOf(c.parameter_id);
              const col = CLUE_COLOR[c.parameter_id] ?? "var(--sun)";
              return (
                <button key={c.parameter_id} type="button" aria-pressed={on} onClick={() => toggleClue(c.parameter_id)}
                  style={on ? { background: `color-mix(in oklab, ${col} 30%, var(--panel))` } : undefined}
                  className={`group relative flex flex-col rounded-3xl text-left ${on ? "pop -translate-x-0.5 -translate-y-0.5" : "outline-ink lift bg-[var(--panel)]"} ${demo ? (on ? "spot" : "dimmed") : ""}`}>
                  <ClueScene id={c.parameter_id} />
                  <span className="flex gap-3 p-4">
                    <span className={`outline-ink -mt-9 grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[var(--on-color)] shadow-[3px_3px_0_0_var(--pop)] ${on ? "wiggle" : "group-wiggle"}`} style={{ background: col }}>
                      {I && <I className="h-6 w-6" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-serif text-lg font-bold leading-snug text-foreground">{f ? f.question[lang] : t(c.label_pt, c.label_en)}</span>
                      <span className="mt-1 block text-sm leading-snug text-[var(--muted)]">{f ? f.what[lang] : t(c.simple_def_pt, c.simple_def_en)}</span>
                      <span className="mt-2 inline-block rounded-md bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--muted)]">NASA · {c.parameter_id}</span>
                    </span>
                  </span>
                  {on && <span className="outline-ink pop-in absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-[var(--mint)] text-[var(--on-color)]"><Check className="h-4 w-4" strokeWidth={3.5} aria-hidden /></span>}
                </button>
              );
            })}
          </div>
          </div>
        )}

        {step === 2 && (
          <div key="s2" className="page-in">
          <StepHead title={t("Onde vamos investigar?", "Where should we look?")} hint={t("Gire o planeta e crave o alfinete em qualquer lugar do mundo, ou comece por uma paisagem.", "Spin the planet and drop the pin anywhere in the world, or start from a landscape.")} />
          <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.9fr)]">
            {QUICK_PLACES.map((r) => {
              const same = (p: ScenePoint) => p.latitude === r.latitude && p.longitude === r.longitude;
              const on = same(mapTarget === "B" && twoScenes ? sceneB : sceneA);
              const point = { region_name: `${t(r.pt, r.en)} · ${t(r.wherePt, r.whereEn)}`, latitude: r.latitude, longitude: r.longitude };
              return (
                <button key={r.en} type="button" aria-pressed={on} onClick={() => (mapTarget === "B" && twoScenes ? setSceneB : setSceneA)(point)}
                  style={on ? { background: `color-mix(in oklab, ${r.col} 35%, var(--panel))` } : undefined}
                  className={`group flex items-center gap-3 rounded-3xl p-3 text-left ${on ? "pop" : "outline-ink lift bg-[var(--panel)]"} ${demo ? "dimmed" : ""}`}>
                  <span className="outline-ink group-wiggle grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--on-color)]" style={{ background: r.col }}><r.Icon className="h-5 w-5" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block font-serif text-[15px] font-bold leading-tight text-foreground">{t(r.pt, r.en)}</span>
                    <span className="block text-xs font-semibold text-[var(--muted)]">{t(r.wherePt, r.whereEn)}</span>
                  </span>
                </button>
              );
            })}
            <button type="button" onClick={() => { setTwoScenes((v) => !v); setMapTarget(twoScenes ? "A" : "B"); }} aria-pressed={twoScenes}
              style={twoScenes ? { background: "color-mix(in oklab, var(--tang) 30%, var(--panel))" } : undefined}
              className={`flex items-center gap-3 rounded-3xl p-3 text-left sm:col-span-3 lg:col-span-1 ${twoScenes ? "pop" : "outline-ink lift bg-[var(--panel)]"} ${demo ? (twoScenes ? "spot" : "dimmed") : ""}`}>
              <span className="outline-ink grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--tang)] text-[var(--on-color)]"><SplitSquareHorizontal className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[15px] font-bold leading-tight text-foreground">{twoScenes ? t("Comparando dois lugares!", "Comparing two places!") : t("Comparar com outro lugar", "Compare with another place")}</span>
                <span className="block text-xs font-semibold text-[var(--muted)]">{t("A mesma pista pode subir num e descer no outro.", "The same clue can rise in one and fall in the other.")}</span>
              </span>
              <span className={`outline-ink h-8 w-14 shrink-0 rounded-full p-0.5 transition ${twoScenes ? "bg-[var(--mint)]" : "bg-[var(--panel-2)]"}`} aria-hidden>
                <span className={`outline-ink block h-6 w-6 rounded-full bg-[var(--panel)] transition ${twoScenes ? "translate-x-6" : ""}`} />
              </span>
            </button>
          </div>
          <PlaceSearch target={twoScenes ? mapTarget : "A"} focus={twoScenes && mapTarget === "B" ? sceneB : sceneA}
            onSelect={(target, point) => (target === "A" ? setSceneA : setSceneB)(point)} />
          <div className={`map-unfold outline-ink relative overflow-hidden rounded-3xl shadow-[6px_6px_0_0_var(--pop)] ${demo ? "spot-soft" : ""}`} onPointerEnter={() => setPeering(true)} onPointerLeave={() => setPeering(false)}>
            {globeFailed ? (
              <MapSelector lang={lang} sceneA={sceneA} sceneB={twoScenes ? sceneB : null} activeTarget={twoScenes ? mapTarget : "A"}
                latStep={primary.lat_step} lonStep={primary.lon_step}
                onSelectPoint={(target, lat, lon) =>
                  (target === "A" ? setSceneA : setSceneB)({ region_name: t("Ponto no mapa", "Map point"), latitude: lat, longitude: lon })} />
            ) : (
              <GlobeSelector lang={lang} sceneA={sceneA} sceneB={twoScenes ? sceneB : null} activeTarget={twoScenes ? mapTarget : "A"}
                latStep={primary.lat_step} lonStep={primary.lon_step} onFail={() => setGlobeFailed(true)}
                onSelectPoint={(target, lat, lon, country) => {
                  setCheer((c) => c + 1);
                  (target === "A" ? setSceneA : setSceneB)({ region_name: country ? `${t("Ponto em", "Point in")} ${country}` : t("Ponto no oceano", "Point in the ocean"), latitude: lat, longitude: lon });
                }} />
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {([["A", sceneA, "var(--brand)"], ...(twoScenes ? [["B", sceneB, "var(--orange)"]] : [])] as [string, ScenePoint, string][]).map(([k, s, col]) => {
              const on = twoScenes && mapTarget === k;
              return (
                <button key={k} type="button" disabled={!twoScenes} onClick={() => setMapTarget(k as "A" | "B")} aria-pressed={twoScenes ? on : undefined}
                  style={on ? { background: `color-mix(in oklab, ${col} 22%, var(--panel))` } : undefined}
                  className={`inline-flex min-w-0 items-center gap-2.5 rounded-full py-2 pl-2 pr-5 text-left ${on ? "pop-sm" : "bg-[var(--panel-2)]"}`}>
                  <span className="outline-ink grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: col }}><MapPin className="h-5 w-5" aria-hidden /></span>
                  <span key={s.region_name} className="reveal min-w-0 truncate font-serif text-lg font-bold text-foreground">{shortName(s.region_name)}</span>
                </button>
              );
            })}
          </div>
          </div>
        )}

        {step === 3 && (
          <div key="s3" className="page-in">
          <StepHead title={t("De quando até quando?", "From when to when?")} hint={t("Arraste as duas pontas da linha do tempo. Com menos de 15 anos não dá para separar a mudança do ruído.", "Drag both ends of the timeline. Under 15 years, change can't be told apart from noise.")} />
          <div className={`rounded-3xl ${demo ? "spot" : ""}`}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            {([[startYear, "old", t("De", "From")], [endYear, "new", t("Até", "To")]] as const).map(([y, kind, label], i) => {
              const era = ERAS.find((e) => y < e.before) ?? ERAS[ERAS.length - 1];
              return (
                <div key={kind} className={`outline-ink relative flex items-center gap-3 rounded-3xl p-3 shadow-[5px_5px_0_0_var(--pop)] sm:p-4 ${kind === "old" ? "year-old -rotate-1 justify-self-start" : "year-new order-3 rotate-1 justify-self-end"}`}>
                  <span key={era.before} className="outline-ink pop-in grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/85 text-[#1b1440] sm:h-14 sm:w-14"><era.Icon className="h-7 w-7" aria-hidden /></span>
                  <span>
                    <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.2em] opacity-80">{label}</span>
                    <span key={y} className="tick block font-serif text-4xl font-bold leading-none tabular-nums sm:text-5xl">{y}</span>
                    <span className="mt-1 block text-xs font-bold opacity-80">{t(era.pt, era.en)}</span>
                  </span>
                  {i === 0 && <span aria-hidden className="grain pointer-events-none absolute inset-0 rounded-3xl" />}
                </div>
              );
            })}
            <span key={nYears} className={`outline-ink pop-in order-2 rounded-full px-4 py-1.5 font-serif text-lg font-bold text-[var(--on-color)] ${nYears >= MIN_YEARS ? "bg-[var(--mint)]" : "bg-[var(--coral)]"}`}>
              {nYears} {t("anos", "years")}
            </span>
          </div>
          <div className="relative mt-8">
            <div className="outline-ink absolute inset-x-0 top-1/2 h-5 -translate-y-1/2 rounded-full bg-[var(--panel-2)]" />
            <div className="timeline-fill absolute top-1/2 h-5 -translate-y-1/2 rounded-full border-y-[2.5px] border-[var(--stroke)]"
              style={{ left: `${pct(startYear)}%`, right: `${100 - pct(endYear)}%`, backgroundSize: `${10000 / Math.max(1, pct(endYear) - pct(startYear))}% 100%`, backgroundPosition: `${(pct(startYear) / Math.max(0.01, 100 - (pct(endYear) - pct(startYear)))) * 100}% 0` }} />
            <div className="dual-range">
              <input type="range" min={FIRST_YEAR} max={LAST_YEAR} value={startYear} aria-label={t("Ano inicial", "Start year")}
                onChange={(e) => setStartYear(Math.max(dataStart, Math.min(Number(e.target.value), endYear - 1)))} />
              <input type="range" min={FIRST_YEAR} max={LAST_YEAR} value={endYear} aria-label={t("Ano final", "End year")}
                onChange={(e) => setEndYear(Math.max(Number(e.target.value), startYear + 1))} />
            </div>
          </div>
          <div className="relative mt-3 h-12">
            {ERAS.map((e, i) => {
              const y = i === 0 ? FIRST_YEAR : ERAS[i - 1].before;
              const lit = y >= startYear && y <= endYear;
              return (
                <span key={y} className={`absolute top-0 flex -translate-x-1/2 flex-col items-center gap-0.5 transition ${lit ? "text-foreground" : "text-[var(--muted)] opacity-45"}`} style={{ left: `${Math.min(97, Math.max(3, pct(y)))}%` }}>
                  <e.Icon className={`h-5 w-5 ${lit ? "wiggle" : ""}`} aria-hidden />
                  <span className="font-mono text-xs font-bold">{y}</span>
                </span>
              );
            })}
          </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Database className="h-4 w-4 text-[var(--brand)]" aria-hidden />{t("Dados da NASA para cada pista:", "NASA data for each clue:")}</span>
            {clues.map((id) => {
              const I = CLUE_ICON[id];
              return (
                <span key={id} className="outline-ink inline-flex items-center gap-1.5 rounded-full bg-[var(--panel)] px-3 py-1 text-sm font-bold text-foreground">
                  {I && <I className="h-4 w-4" aria-hidden />}{friendlyOf(id)?.short[lang] ?? id} · {clueById(id)?.min_year ?? FIRST_YEAR}–{LAST_YEAR}
                </span>
              );
            })}
          </div>
          {nYears < MIN_YEARS && (
            <p className="mt-3 font-bold text-[var(--warning)]">⚠️ {t(`Com menos de ${MIN_YEARS} anos o resultado sai como "poucos dados".`, `Under ${MIN_YEARS} years the result will say "not enough data".`)}</p>
          )}

          </div>
        )}
          </div>
          <div className="flex flex-col gap-3 border-t-[2.5px] border-[var(--stroke)] bg-[var(--panel-2)] p-4 sm:flex-row sm:items-start sm:p-5">
            <div className={`flex gap-3 ${demo ? "dimmed" : ""}`}>
              <button type="button" disabled={step === 1} onClick={() => setStep((step - 1) as 1 | 2)} className="btn-pop inline-flex h-16 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[var(--panel)] px-5 font-serif text-lg font-bold text-foreground disabled:opacity-40 sm:flex-none">
                <ArrowRight className="h-5 w-5 rotate-180" aria-hidden /> {t("Voltar", "Back")}
              </button>
              <button type="button" disabled={step === 3} onClick={() => setStep((step + 1) as 2 | 3)} className="btn-pop inline-flex h-16 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[var(--aqua)] px-5 font-serif text-lg font-bold text-[var(--on-color)] disabled:opacity-40 sm:flex-none">
                {t("Próximo", "Next")} <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          <div className="min-w-0 flex-1">
            <button type="button" disabled={loading} onClick={() => void run()} onPointerEnter={() => setPeering(true)} onPointerLeave={() => setPeering(false)}
              className={`btn-pop group relative flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-3xl bg-[var(--sun)] px-6 font-serif text-xl font-bold text-[var(--on-color)] sm:text-2xl disabled:opacity-80 ${demo ? (demo.stage === 3 ? "spot" : "dimmed") : ""}`}>
              {!loading && !demo && <span className="shine absolute inset-y-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent" aria-hidden />}
              {loading && <span className="scan-bar absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent" aria-hidden />}
              <ScanSearch className={`h-8 w-8 ${loading ? "wiggle" : "group-wiggle"}`} aria-hidden />
              {loading ? t("Examinando as pistas…", "Examining the clues…") : t("Examinar as evidências!", "Examine the evidence!")}
            </button>
          </div>
          {error && (
            <p className="outline-ink mt-4 flex items-center gap-2 rounded-2xl bg-[var(--coral)] p-3 text-sm font-bold text-[var(--on-color)]" role="alert">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden /> {error}
            </p>
          )}
          </div>
        </section>
      </main>

      {/* VERDICT */}
      <section id="veredito" className="scroll-mt-24 border-y-[2.5px] border-[var(--stroke)] bg-[var(--band-2)] py-16">
        <div className="mx-auto max-w-6xl space-y-6 px-4">
          {sectionTitle(t("O veredito", "The verdict"), <>{t("O que os ", "What the ")}<span className="marker">{t("dados", "data")}</span>{t(" dizem", " says")}</>, "var(--mint)")}
          <p className="-mt-4 text-center font-semibold text-[var(--muted)]">{t("A estatística decide o carimbo, nunca uma IA.", "Statistics decide the stamp, never AI.")}</p>
          {loading && !result && (
            <div className="pop mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl p-10 text-center font-bold text-foreground">
              <div className="radar outline-ink h-32 w-32" aria-hidden />
              {t("Buscando dados da NASA e rodando os testes…", "Fetching NASA data and running the tests…")}
            </div>
          )}
          {!result && !loading && (
            <div className="mx-auto max-w-xl rounded-3xl border-[2.5px] border-dashed border-[var(--stroke)] bg-[var(--panel)]/60 p-10 text-center font-semibold text-[var(--muted)]">
              <ScanSearch className="float mx-auto mb-3 h-12 w-12 text-[var(--brand)]" aria-hidden />
              {t("Nenhum caso aberto ainda. Responda as três perguntas e examine, ou assista a um caso lá em cima.",
                "No case open yet. Answer the three questions and examine, or watch a case above.")}
            </div>
          )}
          {result && (
            <div className={`space-y-10 ${loading ? "opacity-60" : ""}`}>
              {result.runs.map((r) => {
                const two = !!r.scene_b;
                const key = `${result.case_id}-${r.variable.parameter_id}`;
                return (
                  <div key={key} className="space-y-5">
                    {r.errors.map((e) => <p key={e} className="outline-ink rounded-2xl bg-[var(--coral)] px-4 py-2 text-sm font-bold text-[var(--on-color)]">{e}</p>)}
                    {r.comparison && (
                      <p className={`pop-sm rounded-2xl px-4 py-3 font-bold ${r.comparison.confirmed_opposite_trends ? "bg-[var(--mint)] text-[var(--on-color)]" : "bg-[var(--panel)] text-foreground"}`}>
                        ⚖️ {r.scene_a && r.scene_b ? plainComparison(r.variable.parameter_id, r.scene_a, r.scene_b, lang) : t(r.comparison.summary_pt, r.comparison.summary_en)}
                      </p>
                    )}
                    <div className={`grid gap-6 ${two ? "xl:grid-cols-2" : ""}`}>
                      {([["scene_a", t("Lugar A", "Place A"), "var(--brand)"], ["scene_b", t("Lugar B", "Place B"), "var(--orange)"]] as const).map(([k, label, color]) => {
                        const s = r[k];
                        if (!s) return null;
                        return <CaseVerdict key={k} run={r} scene={s} lang={lang} accent={color} compact={two} label={two ? label : undefined} onOpenEvidence={(sc) => setEvidence({ run: r, scene: sc })} />;
                      })}
                    </div>
                    {r.scene_a && (
                      <div className="flex justify-end">
                        <button type="button" onClick={() => saveToMural(r)} className="btn-pop inline-flex h-12 items-center gap-2 rounded-full bg-[var(--tang)] px-5 font-serif font-bold text-[var(--on-color)]">
                          {copied === key ? <Check className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}
                          {copied === key ? t("No mural! Link copiado", "Pinned! Link copied") : t("Pendurar no mural", "Pin to the board")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="pop flex flex-col items-center gap-4 rounded-3xl p-6 text-center sm:flex-row sm:justify-between sm:text-left">
                <p className="font-serif text-xl font-bold text-foreground">{t("Caso encerrado! E agora?", "Case closed! What next?")}</p>
                <button type="button" onClick={() => { setStep(1); scrollToId("q1"); }} className="btn-pop inline-flex h-14 items-center gap-2 rounded-full bg-[var(--sun)] px-6 font-serif text-lg font-bold text-[var(--on-color)]">
                  <Search className="h-5 w-5" aria-hidden /> {t("Investigar outro caso", "Investigate another case")}
                </button>
              </div>
              <ComparisonExport result={result} lang={lang} />
              {AI_SYNTHESIS_ENABLED && <ComparisonSynthesis result={result} lang={lang} />}
            </div>
          )}
        </div>
      </section>


      {/* DETECTIVE NOTEBOOK */}
      <section id="caderno" className="scroll-mt-24 border-y-[2.5px] border-[var(--stroke)] bg-[var(--band)] py-16">
        <div className="mx-auto max-w-6xl px-4">
          {sectionTitle(t("Glossário", "Glossary"), <><BookOpen className="wiggle mr-2 inline h-10 w-10 text-[var(--brand)]" aria-hidden />{t("Caderno do detetive", "Detective's notebook")}</>, "var(--grape)")}
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {glossary.map((g, i) => (
              <div key={i} data-reveal="zoom" style={{ transitionDelay: `${(i % 4) * 80}ms`, rotate: `${[-1.2, 0.8, -0.6, 1.4][i % 4]}deg` }} className="pop lift ruled relative rounded-2xl p-4 pt-7">
                <span aria-hidden className="absolute left-1/2 top-[-10px] h-5 w-16 -translate-x-1/2 rotate-[-3deg] border-2 border-[var(--stroke)] opacity-90" style={{ background: ["var(--sun)", "var(--coral)", "var(--aqua)", "var(--mint)"][i % 4] }} />
                <dt className="font-serif text-xl font-bold text-foreground">{g.k}</dt>
                <dd className="mt-1 text-sm leading-7 text-foreground/80">{g.v}</dd>
              </div>
            ))}
          </dl>
          <details className="pop group mt-10 rounded-3xl">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-serif text-lg font-bold text-foreground">
              <span>🌍 {t("Por que isso importa: metas da ONU ligadas às pistas", "Why it matters: UN goals linked to the clues")}</span>
              <ArrowDown className="h-5 w-5 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="p-4 pt-0 sm:p-6 sm:pt-0"><SdgPanel activeTargets={primary.sdg_targets} lang={lang} /></div>
          </details>
        </div>
      </section>

      {/* CASE BOARD */}
      <section id="mural" className="cork scroll-mt-24 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div data-reveal className="pop mx-auto mb-8 w-fit -rotate-1 rounded-2xl px-6 py-3 text-center">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">📌 {t("Mural de casos", "Case board")}</h2>
            <p className="text-sm font-semibold text-[var(--muted)]">{t("Cada cartão guarda um link que reabre a investigação.", "Each card keeps a link that reopens the investigation.")}</p>
          </div>
          {mural.length === 0 ? (
            <p className="pop mx-auto max-w-md rotate-1 rounded-2xl p-6 text-center font-semibold text-[var(--muted)]">
              {t("Resolva um caso e toque em \"Pendurar no mural\" para colocar o primeiro cartão aqui.", "Solve a case and tap \"Pin to the board\" to put the first card here.")}
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {mural.map((c, i) => (
                <a key={c.id} href={c.shareUrl} style={{ rotate: `${[-2, 1.5, -1, 2][i % 4]}deg` }} className="pop lift pop-in relative block rounded-2xl p-5 pt-7">
                  <span aria-hidden className="outline-ink absolute left-1/2 top-[-12px] h-6 w-6 -translate-x-1/2 rounded-full bg-[var(--coral)]" />
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--brand)]">{friendlyOf(c.parameterId)?.short[lang] ?? c.parameterId} · {c.regions}</p>
                  <h3 className="mt-1 text-xl font-bold text-foreground">{c.headline}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{c.question}</p>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t-[2.5px] border-[var(--stroke)] bg-[#1b1440] text-[#f7f2ff]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <a href="#topo" className="flex items-center gap-2.5">
              <span className="grid h-12 w-12 place-items-center rounded-full border-[2.5px] border-[#f7f2ff] bg-white">
                <img src="/brand/orbiting-analytics-globe-256.png" alt="" width={36} height={36} loading="lazy" className="h-9 w-9 object-contain" />
              </span>
              <span className="font-serif text-2xl font-bold">Earth<span className="text-[#ffc93c]">Sleuth</span></span>
            </a>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#cfc6f5]">
              {t("Uma linha de tendência descreve o passado; não é previsão climática. Projeto independente, sem endosso da NASA.",
                "A trend line describes the past; it is not a climate forecast. Independent project, not endorsed by NASA.")}
            </p>
            <p className="mt-3 text-xs text-[#cfc6f5]">
              {t("Personagem 3D: ", "3D character: ")}
              <a href="https://sketchfab.com/3d-models/bunny-detective-b2ab08f1f5d04d9182400735d6471368" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Bunny Detective</a>
              {t(" por bird (birdii), CC BY 4.0.", " by bird (birdii), CC BY 4.0.")}
            </p>
          </div>
          <section aria-labelledby="nasa-resources-title">
            <h2 id="nasa-resources-title" className="font-serif text-lg font-bold text-[#3fd4ff]">{t("Dados da NASA", "NASA data")}</h2>
            <ul className="mt-4 space-y-4 text-sm">
              <li>
                <a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer" className="font-bold text-[#ffc93c] hover:underline">NASA POWER ↗</a>
                <p className="mt-1 leading-relaxed text-[#cfc6f5]">{t("API de séries mensais por coordenadas, do NASA Langley Research Center.", "Monthly time-series API by coordinates, from NASA Langley Research Center.")}</p>
                <p className="mt-1 break-words font-mono text-[11px] text-[#cfc6f5]">T2M · T2M_MIN · T2M_MAX · PRECTOTCORR · GWETROOT · EVPTRNS</p>
              </li>
              <li>
                <a href="https://gmao.gsfc.nasa.gov/gmao-products/merra-2/" target="_blank" rel="noopener noreferrer" className="font-bold text-[#ffc93c] hover:underline">GMAO MERRA-2 ↗</a>
                <p className="mt-1 leading-relaxed text-[#cfc6f5]">{t("Reanálise por trás de todas as pistas, acessada via POWER.", "Reanalysis behind every clue, accessed through POWER.")}</p>
              </li>
            </ul>
          </section>
          <section aria-labelledby="method-title">
            <h2 id="method-title" className="font-serif text-lg font-bold text-[#3fe0ae]">{t("Método", "Method")}</h2>
            <ul className="mt-4 space-y-2 text-sm text-[#cfc6f5]">
              <li>{t("Mann-Kendall sazonal (Hirsch e Slack, 1984)", "Seasonal Mann-Kendall (Hirsch and Slack, 1984)")}</li>
              <li>{t("Inclinação de Sen com IC de 95%", "Sen's slope with a 95% CI")}</li>
              <li>{t("Correção de Benjamini-Hochberg (FDR)", "Benjamini-Hochberg correction (FDR)")}</li>
              <li>{t("Veredito decidido pela estatística, nunca por IA", "Verdict decided by statistics, never by AI")}</li>
            </ul>
          </section>
        </div>
      </footer>

      <SleuthGuide lang={lang} text={guideText} mood={guideMood} spot={picking ? "left" : SPOT[guideKey]} cheer={cheer} active={talking || loading || !!demo || picking} tour={!!demo || picking} onNext={demo ? demoNext : undefined}
        nextLabel={demo ? (demo.stage === 3 ? t("Examinar as evidências!", "Examine the evidence!") : t("Continuar", "Continue")) : undefined} />
      {(demo || picking) && <div aria-hidden onClick={picking ? exitDemo : undefined} className="reveal fixed inset-0 z-[44] bg-[#0b0724]/55 backdrop-blur-[3px]" />}
      {intro && (
        <div aria-hidden onClick={() => setIntro(false)} className="intro fixed inset-0 z-[80] cursor-pointer overflow-hidden">
          <div className="intro-iris" />
          <div className="intro-stage space absolute inset-0 grid place-items-center [perspective:1700px]">
            <div className="intro-book relative aspect-[3/4] w-[min(64vw,400px)]">
              <div className="ruled absolute inset-0 flex flex-col gap-5 rounded-r-2xl rounded-l-md border-[3px] border-[#1b1440] bg-[#fffaf0] p-7 text-[#1b1440]">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.25em]">{t("Caso nº", "Case no.")} 001</p>
                {[t("O quê?", "What?"), t("Onde?", "Where?"), t("Quando?", "When?")].map((q, i) => (
                  <p key={q} className="intro-line font-serif text-3xl font-bold" style={{ animationDelay: `${1.45 + i * 0.16}s` }}>{q}</p>
                ))}
                <Search className="mt-auto h-14 w-14 self-end text-[#ff6b98]" />
              </div>
              <div className="intro-cover dots absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-r-2xl rounded-l-md border-[3px] border-[#1b1440] px-5 text-center text-[#3b2408]">
                <Paperclip className="absolute -top-5 left-8 h-14 w-14 -rotate-12 text-[#6b6480]" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em]">EarthSleuth</p>
                <p className="font-serif text-4xl font-bold leading-none sm:text-5xl">{t("Arquivo de caso", "Case file")}</p>
                <p className="-rotate-6 rounded-lg border-4 border-[#c8321f] px-3 py-1 font-mono text-lg font-bold uppercase tracking-[0.2em] text-[#c8321f]">{t("Caso aberto", "Open case")}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {evidence && <EvidenceModal run={evidence.run} scene={evidence.scene} lang={lang} onClose={() => setEvidence(null)} />}
    </div>
  );
}
