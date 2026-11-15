// Address search and the AI comparison summary need a signed-in account (Supabase + Lovable gateway).
// Space Apps judges must reach the whole project without a login, so both stay off for the submission.
// Set to true to bring them back; their code is unchanged.
const ACCOUNT_FEATURES_ENABLED = false;
// Partner images chosen by the team, copied from the Lovable asset store so they load on any host.
const spaceAppsLogo = { url: "/brand/partners/space-apps-logo.png" };
const agenciesPrimary = { url: "/brand/partners/space-agencies-primary.png" };
const agenciesSecondary = { url: "/brand/partners/space-agencies-secondary.png" };
import { Button } from "@/components/ui/button";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, useNavigate } from "@tanstack/react-router";
import { analyzeInvestigation } from "@/lib/analyze.functions";
import {
  Thermometer, Moon, Sun, CloudRain, Sprout, Leaf, Satellite, Search, Wand2, SplitSquareHorizontal,
  Share2, Check, AlertCircle, MapPin, ScanSearch, ArrowRight, ArrowDown, Sparkles, Database, Sigma, type LucideIcon,
} from "lucide-react";
import { FRONTEND_CLUES, PRESET_CASES, REGION_SHORTCUTS, PELOTAS, clueById, type PresetCase } from "@/lib/catalog";
import { interpretQuestion } from "@/lib/interpreter";
import type { ClueRun, DataMode, InvestigationResponse, Lang, SceneAnalysis, ScenePoint } from "@/types/sleuth";
import TrendChart from "@/components/TrendChart";
import VerdictStamp from "@/components/VerdictStamp";
import EvidenceModal from "@/components/EvidenceModal";
import SdgPanel from "@/components/SdgPanel";
import ClimateStripes, { type StripePalette } from "@/components/ClimateStripes";
import PlaceSearch from "@/components/PlaceSearch";
import ComparisonExport from "@/components/ComparisonExport";
import ProposalDocuments from "@/components/ProposalDocuments";
import ComparisonSynthesis from "@/components/ComparisonSynthesis";
import SiteHeader from "@/components/SiteHeader";
import HeroPreview from "@/components/HeroPreview";

const MapSelectorLazy = lazy(() => import("@/components/MapSelector"));
const mapFallback = <div className="flex h-[380px] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] text-sm text-[var(--muted)]">Loading map…</div>;
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
  T2M: Thermometer, T2M_MIN: Moon, T2M_MAX: Sun, PRECTOTCORR: CloudRain,
  GWETROOT: Sprout, EVPTRNS: Leaf, IMERG_PRECTOT: Satellite,
};
const PALETTE: Record<string, StripePalette> = {
  T2M: "temp", T2M_MIN: "temp", T2M_MAX: "temp",
  PRECTOTCORR: "water", GWETROOT: "water", IMERG_PRECTOT: "water", EVPTRNS: "energy",
};

interface MuralCard {
  id: string; question: string; parameterId: string; regions: string;
  status: string; slope: number | null; unit: string; shareUrl: string;
}

function Step({ n, title, hint, children, id }: { n: string; title: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} data-reveal className="surface scroll-mt-24 rounded-3xl p-5 sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] font-mono text-sm font-bold text-white shadow-[var(--button-shadow)]">{n}</span>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-foreground sm:text-[28px]">{title}</h2>
          {hint && <p className="mt-1 text-sm text-[var(--muted)]">{hint}</p>}
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
    const root = document.documentElement;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add("is-visible"); else io.observe(el);
    });
    root.classList.add("js-reveal");
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function EarthSleuthsApp() {
  const [lang, setLang] = useState<Lang>("en");
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);

  const [question, setQuestion] = useState("");
  const [note, setNote] = useState("");
  const [clues, setClues] = useState<string[]>(["T2M_MIN"]);
  const [focusClue, setFocusClue] = useState("T2M_MIN");
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
  const restored = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  useScrollReveal([result, mural.length]);

  // Restaura a ficha a partir do link (?clues=...&latA=...)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const num = (k: string) => (p.get(k) !== null ? Number(p.get(k)) : NaN);
    const ids = (p.get("clues") ?? "").split(",").filter((id) => clueById(id));
    if (ids.length) { setClues(ids); setFocusClue(ids[0]); }
    if (p.get("q")) setQuestion(p.get("q")!);
    if (!isNaN(num("latA"))) setSceneA({ region_name: p.get("nameA") ?? "Cena A", latitude: num("latA"), longitude: num("lonA") });
    if (!isNaN(num("latB"))) { setSceneB({ region_name: p.get("nameB") ?? "Cena B", latitude: num("latB"), longitude: num("lonB") }); setTwoScenes(true); }
    const from = !isNaN(num("from")) ? num("from") : num("start");
    const to = !isNaN(num("to")) ? num("to") : num("end");
    if (!isNaN(from)) setStartYear(from);
    if (!isNaN(to)) setEndYear(to);
    if (ids.length) setNote(lang === "pt" ? "Ficha restaurada a partir de um link. Confira e clique em Examinar." : "Case file restored from a link. Check it and click Examine the evidence.");
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

  const primary = useMemo(() => clueById(clues[0]) ?? FRONTEND_CLUES[0], [clues]);
  const focused = clueById(focusClue) ?? primary;
  const latestStart = Math.max(...clues.map((id) => clueById(id)?.min_year ?? FIRST_YEAR), startYear);
  const nYears = endYear - latestStart + 1;

  const interpret = () => {
    if (!question.trim()) return;
    const i = interpretQuestion(question);
    setClues(i.clues);
    setFocusClue(i.clues[0]);
    if (i.twoScenes) setTwoScenes(true);
    setNote(lang === "pt" ? i.rationale_pt : i.rationale_en);
  };

  const applyPreset = (c: PresetCase) => {
    setQuestion(lang === "pt" ? c.question_pt : c.question_en);
    setClues(c.clues);
    setFocusClue(c.clues[0]);
    setTwoScenes(c.twoScenes);
    setSceneA(c.sceneA);
    if (c.sceneB) setSceneB(c.sceneB);
    setStartYear(FIRST_YEAR);
    setEndYear(LAST_YEAR);
    setNote(t(`Dossiê “${c.title_pt}” aberto. Ajuste o que quiser e examine.`, `Case “${c.title_en}” opened. Adjust anything, then examine.`));
    document.getElementById("pista")?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleClue = (id: string) => {
    setFocusClue(id);
    setClues((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]));
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await analyzeInvestigation({
        data: {
          question: question || t("Investigação livre", "Open investigation"),
          parameter_ids: clues, start_year: startYear, end_year: endYear, mode, lang,
          scene_a: sceneA, scene_b: twoScenes ? sceneB : null,
        },
      });
      setResult(body);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("O motor estatístico não respondeu.", "The statistics engine did not respond."));
    } finally {
      setLoading(false);
    }
  };

  const saveToMural = (r: ClueRun) => {
    if (!result || !r.scene_a) return;
    const url = `${window.location.origin}/${shareUrl}`;
    const id = `${result.case_id}-${r.variable.parameter_id}`;
    setMural((m) => [{
      id, question: result.question, parameterId: r.variable.parameter_id,
      regions: r.scene_a!.geography.region_name + (r.scene_b ? ` × ${r.scene_b.geography.region_name}` : ""),
      status: r.scene_a!.status, slope: r.scene_a!.statistics.slope_per_decade, unit: r.scene_a!.unit, shareUrl: url,
    }, ...m.filter((c) => c.id !== id)]);
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  };

  const dossierSummary = useMemo(() => {
    if (!result || result.runs.length < 2) return null;
    const done = result.runs.filter((r) => r.scene_a && r.scene_a.status !== "DADOS_INSUFICIENTES");
    const sig = done.filter((r) => r.scene_a!.status === "TENDENCIA_REAL");
    return { sig: sig.length, total: done.length, dirs: sig.map((r) => ({ id: r.variable.parameter_id, up: r.scene_a!.statistics.direction === "increasing" })) };
  }, [result]);

  const pct = (y: number) => ((y - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * 100;
  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${active ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_12%,var(--panel))] text-foreground" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--brand)] hover:text-foreground"}`;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader lang={lang} setLang={setLang} boardCount={mural.length} />

      <section id="topo" className="hero-bg">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-24 lg:pt-20">
          <div>
            <p className="fade-up inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)]/80 px-3 py-1.5 text-xs font-semibold text-[var(--muted)] shadow-sm backdrop-blur">
              <span className="pulse-dot h-2 w-2 rounded-full bg-[var(--success)]" aria-hidden />
              {t("Space Apps 2026 · Desafio Trend Detective", "Space Apps 2026 · Trend Detective challenge")}
            </p>
            <h1 className="fade-up delay-1 mt-5 text-[2.6rem] font-bold leading-[1.04] text-foreground sm:text-6xl lg:text-[4.1rem]">
              {t("Está ", "Is it ")}<span className="text-gradient">{t("mudando mesmo", "really changing")}</span>
              {t(", ou foi só um ano estranho?", ", or was it just a strange year?")}
            </h1>
            <p className="fade-up delay-2 mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
              {t("Escolha uma pista, um lugar e um período. O Earth Sleuth busca décadas de dados da NASA e devolve um veredito com a estatística à vista.",
                "Pick a clue, a place and a period. Earth Sleuth pulls decades of NASA data and returns a verdict with the statistics in plain sight.")}
            </p>
            <div className="fade-up delay-3 mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#pista" className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--brand)] px-6 text-base font-semibold text-[var(--primary-foreground)] shadow-[var(--button-shadow)] transition hover:-translate-y-0.5 hover:brightness-110">
                {t("Começar a investigar", "Start investigating")}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
              </a>
              <a href="#casos" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-6 text-base font-semibold text-foreground transition hover:border-[var(--brand)]">
                {t("Ver casos prontos", "See ready-made cases")}
                <ArrowDown className="h-4 w-4" aria-hidden />
              </a>
            </div>
            <dl className="fade-up delay-4 mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-[var(--line)] pt-6">
              {[
                { I: Database, v: "45", k: t("anos de dados mensais", "years of monthly data") },
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
          <div className="fade-up delay-2">
            <HeroPreview lang={lang} />
          </div>
        </div>
      </section>

      <section id="casos" className="scroll-mt-24 pb-6">
        <div className="mx-auto max-w-6xl px-4">
          <div data-reveal className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">{t("Comece por aqui", "Start here")}</p>
              <h2 className="mt-1 text-3xl font-bold text-foreground">{t("Dossiês prontos para abrir", "Case files ready to open")}</h2>
            </div>
            <p className="max-w-md text-sm text-[var(--muted)]">{t("Cada dossiê preenche a pista, o lugar e o período. Depois é só examinar.", "Each case fills in the clue, the place and the period. Then just examine.")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PRESET_CASES.map((c, i) => (
              <button key={c.id} type="button" onClick={() => applyPreset(c)} data-reveal style={{ transitionDelay: `${i * 90}ms` }}
                className="surface ring-gradient group relative flex flex-col rounded-3xl p-6 text-left transition duration-300 hover:-translate-y-1">
                <span className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[var(--muted)]">{t("Dossiê", "Case")} {String(i + 1).padStart(2, "0")}</span>
                  <span className="flex gap-1.5">
                    {c.clues.map((id) => { const I = CLUE_ICON[id]; return I ? <span key={id} className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--panel-2)] text-[var(--brand)]"><I className="h-4 w-4" aria-hidden /></span> : null; })}
                  </span>
                </span>
                <span className="mt-6 block font-serif text-xl font-bold text-foreground">{t(c.title_pt.split("·")[1]?.trim() ?? c.title_pt, c.title_en.split("·")[1]?.trim() ?? c.title_en)}</span>
                <span className="mt-2 block flex-1 text-sm leading-relaxed text-[var(--muted)]">{t(c.question_pt, c.question_en)}</span>
                <span className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-4 text-sm">
                  <span className="flex items-center gap-1.5 text-[var(--muted)]"><MapPin className="h-3.5 w-3.5" aria-hidden />{c.sceneA.region_name.split("/")[0]}{c.sceneB ? ` × ${c.sceneB.region_name.split("/")[0]}` : ""}</span>
                  <span className="flex items-center gap-1 font-semibold text-[var(--brand)]">{t("Abrir", "Open")}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden /></span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-10">
        <Step id="pista" n="01" title={t("Escolha a pista", "Choose the clue")} hint={t("Pode marcar mais de uma: cada pista é testada separadamente.", "Pick one or more; each clue is tested separately.")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {FRONTEND_CLUES.map((c) => {
              const on = clues.includes(c.parameter_id);
              const I = CLUE_ICON[c.parameter_id];
              return (
                <Button variant="plain" size="content" key={c.parameter_id} type="button" aria-pressed={on} onClick={() => toggleClue(c.parameter_id)}
                  onMouseEnter={() => setFocusClue(c.parameter_id)} onFocus={() => setFocusClue(c.parameter_id)}
                  className={`relative flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-center transition duration-200 hover:-translate-y-0.5 ${on ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_10%,var(--panel))] text-foreground shadow-[0_8px_24px_-14px_var(--brand)]" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[color-mix(in_oklab,var(--brand)_50%,var(--line))] hover:text-foreground"}`}>
                  {on && <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[var(--brand)] text-white"><Check className="h-3 w-3" aria-hidden /></span>}
                  {I && <I className={`h-7 w-7 ${on ? "text-[var(--brand)]" : ""}`} aria-hidden />}
                  <span className="text-sm font-semibold leading-tight">{t(c.label_pt, c.label_en)}</span>
                </Button>
              );
            })}
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--panel-2)]/60 p-4 text-sm">
            <span className="font-semibold text-foreground">{t(focused.label_pt, focused.label_en)}</span>
            <span className="text-[var(--muted)]">: {t(focused.simple_def_pt, focused.simple_def_en)} </span>
            <span className="text-xs text-[var(--muted)]">({focused.parameter_id} · {focused.source_mission} · {t(focused.data_type_pt, focused.data_type_en ?? focused.data_type_pt)} · {t("desde", "since")} {focused.min_year})</span>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">{t("Sua pergunta", "Your question")}</span>
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-[var(--muted)]" aria-hidden />
              <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && interpret()}
                placeholder={t("Ou escreva sua pergunta: “a terra está ficando mais seca no Ceará?”", "Or type your question: “is the land getting drier?”")}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--night)] py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-[var(--muted)]" />
            </label>
            <Button variant="plain" size="content" type="button" onClick={interpret} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary">
              <Wand2 className="h-4 w-4 text-primary" aria-hidden /> {t("Sugerir pistas", "Suggest clues")}
            </Button>
          </div>
          {note && <p className="reveal mt-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary" role="status">{note}</p>}
        </Step>

        <Step n="02" title={t("Escolha o lugar", "Choose the place")} hint={t("Clique no mapa, use um atalho ou digite as coordenadas.", "Click the map, use a shortcut or type coordinates.")}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {REGION_SHORTCUTS.map((r) => {
              const cur = mapTarget === "B" && twoScenes ? sceneB : sceneA;
              return (
                <Button variant="plain" size="content" key={r.region_name} type="button" className={chip(cur.region_name === r.region_name)}
                  onClick={() => (mapTarget === "B" && twoScenes ? setSceneB : setSceneA)(r)}>
                  {r.region_name.split("/")[0].trim()}
                </Button>
              );
            })}
            <Button variant="plain" size="content" type="button" onClick={() => { setTwoScenes((v) => !v); setMapTarget(twoScenes ? "A" : "B"); }} aria-pressed={twoScenes}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${twoScenes ? "border-scene-b bg-scene-b/15 text-scene-b" : "border-[var(--line)] text-foreground hover:border-scene-b"}`}>
              <SplitSquareHorizontal className="h-4 w-4" aria-hidden />
              {twoScenes ? t("Duas Cenas ligado", "Two Scenes on") : t("Comparar duas regiões", "Compare two regions")}
            </Button>
          </div>
          <div className={`mb-4 grid gap-3 ${twoScenes ? "sm:grid-cols-2" : ""}`}>
            {([["A", sceneA, setSceneA, "var(--brand)"], ...(twoScenes ? [["B", sceneB, setSceneB, "var(--orange)"]] : [])] as [string, ScenePoint, (s: ScenePoint) => void, string][]).map(([k, s, set, col]) => (
              <div key={k} onClick={() => setMapTarget(k as "A" | "B")}
                className="flex cursor-pointer flex-wrap items-center gap-2 rounded-xl border bg-[var(--night)] p-3 text-sm"
                style={{ borderColor: (twoScenes ? mapTarget === k : true) ? col : "var(--line)" }}>
                <MapPin className="h-4 w-4" style={{ color: col }} aria-hidden />
                <span className="font-bold" style={{ color: col }}>{t("Cena", "Scene")} {k}</span>
                <input aria-label={`Nome da cena ${k}`} value={s.region_name} onChange={(e) => set({ ...s, region_name: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-foreground" />
                <input aria-label="Latitude" type="number" step="0.01" min={-90} max={90} value={s.latitude}
                  onChange={(e) => set({ ...s, latitude: Number(e.target.value) })} className="w-24 rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-foreground" />
                <input aria-label="Longitude" type="number" step="0.01" min={-180} max={180} value={s.longitude}
                  onChange={(e) => set({ ...s, longitude: Number(e.target.value) })} className="w-24 rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-foreground" />
              </div>
            ))}
          </div>
          {ACCOUNT_FEATURES_ENABLED && (
            <PlaceSearch target={twoScenes ? mapTarget : "A"} focus={twoScenes && mapTarget === "B" ? sceneB : sceneA}
              onSelect={(target, point) => (target === "A" ? setSceneA : setSceneB)(point)} />
          )}
          <MapSelector sceneA={sceneA} sceneB={twoScenes ? sceneB : null} activeTarget={twoScenes ? mapTarget : "A"}
            latStep={primary.lat_step} lonStep={primary.lon_step}
            onSelectPoint={(target, lat, lon) =>
              (target === "A" ? setSceneA : setSceneB)({ region_name: `Ponto ${lat}, ${lon}`, latitude: lat, longitude: lon })} />
        </Step>

        <Step n="03" title={t("Escolha o período", "Choose the period")} hint={t("Arraste as duas pontas da linha do tempo.", "Drag both ends of the timeline.")}>
          <div className="flex items-end justify-between">
            <span className="font-serif text-4xl font-bold text-foreground">{startYear}</span>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${nYears >= MIN_YEARS ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
              {nYears} {t("anos", "years")}
            </span>
            <span className="font-serif text-4xl font-bold text-foreground">{endYear}</span>
          </div>
          <div className="relative mt-4">
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--line)]" />
            <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-yonder to-rocket-red"
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
          <p className="mt-3 text-sm text-[var(--muted)]">
            {nYears >= MIN_YEARS
              ? t("Quanto mais longo o período, mais confiável o veredito.", "Longer periods make the verdict more reliable.")
              : t(`Com menos de ${MIN_YEARS} anos o laudo sai como “dados insuficientes”.`, `Under ${MIN_YEARS} years the verdict will be “insufficient data”.`)}
            {latestStart > startYear && t(` Alguma pista escolhida só tem dados a partir de ${latestStart}.`, ` A chosen clue only has data from ${latestStart}.`)}
          </p>

          <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button variant="plain" size="content" type="button" disabled={loading} onClick={run}
              className="relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] px-6 py-4 text-lg font-bold text-white shadow-[var(--button-shadow)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-80">
              {loading && <span className="scan-bar absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent" aria-hidden />}
              <ScanSearch className="h-6 w-6" aria-hidden />
              {loading ? t("Examinando as pistas…", "Examining the clues…") : t("Examinar as evidências", "Examine the evidence")}
            </Button>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              {t("Dados", "Data")}
              <select value={mode} onChange={(e) => setMode(e.target.value as DataMode)} className="rounded-lg border border-[var(--line)] bg-[var(--night)] px-2 py-2 text-foreground">
                <option value="auto">{t("NASA ao vivo + reserva", "NASA live + backup")}</option>
                <option value="cache">{t("Cópia salva (rápido)", "Saved copy (fast)")}</option>
                <option value="live">{t("Só NASA ao vivo", "NASA live only")}</option>
              </select>
            </label>
          </div>
          {error && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {error}
            </p>
          )}
        </Step>

        <div ref={resultsRef} id="veredito" className="scroll-mt-24">
          <Step n="04" title={t("Evidências e veredito", "Evidence and verdict")}
            hint={t("A estatística decide o carimbo, nunca uma IA.", "Statistics decide the stamp, never AI.")}>
            {!result ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-2)]/40 p-10 text-center text-[var(--muted)]">
                <ScanSearch className="mx-auto mb-3 h-10 w-10 text-[var(--line)]" aria-hidden />
                {t("Nenhum caso aberto ainda. Escolha pista, lugar e período e clique em Examinar, ou abra um dossiê lá em cima.",
                  "No case open yet. Pick a clue, place and period and press Examine, or open a case file above.")}
              </div>
            ) : (
              <div className="space-y-8">
                <ComparisonExport result={result} lang={lang} />
                {ACCOUNT_FEATURES_ENABLED && <ComparisonSynthesis result={result} lang={lang} />}
                {dossierSummary && (
                  <div className="reveal flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--night)] p-4">
                    <span className="font-serif text-4xl font-extrabold text-foreground">{dossierSummary.sig}<span className="text-xl text-[var(--muted)]">/{dossierSummary.total}</span></span>
                    <span className="max-w-xl text-sm text-[var(--muted)]">
                      {t("pistas com tendência significativa na Cena A. O conjunto pode ser compatível com uma leitura, mas não prova a causa.",
                        "clues with a significant trend in Scene A. Together they may fit a story, but they do not prove the cause.")}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {dossierSummary.dirs.map((d) => (
                        <span key={d.id} className="rounded-full bg-[var(--panel-2)] px-3 py-1 text-xs font-semibold text-foreground">{d.id} {d.up ? "↑" : "↓"}</span>
                      ))}
                    </span>
                  </div>
                )}
                {result.runs.map((r) => {
                  const I = CLUE_ICON[r.variable.parameter_id];
                  const two = !!r.scene_b;
                  const key = `${result.case_id}-${r.variable.parameter_id}`;
                  return (
                    <article key={key} className="reveal space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2.5 text-xl font-bold text-foreground">
                          <I className="h-6 w-6 text-primary" aria-hidden /> {t(r.variable.label_pt, r.variable.label_en)}
                          <span className="font-sans text-xs font-normal text-[var(--muted)]">{r.variable.parameter_id}</span>
                        </h3>
                        {r.scene_a && (
                          <Button variant="plain" size="content" type="button" onClick={() => saveToMural(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-semibold text-foreground hover:border-primary">
                            {copied === key ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
                            {copied === key ? t("Salvo, link copiado", "Saved, link copied") : t("Salvar no mural", "Save to board")}
                          </Button>
                        )}
                      </div>
                      {r.errors.map((e) => <p key={e} className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{e}</p>)}
                      {r.comparison && (
                        <p className={`rounded-xl border px-4 py-3 text-sm font-semibold ${r.comparison.confirmed_opposite_trends ? "border-comparison/50 bg-comparison/10 text-comparison" : "border-[var(--line)] bg-[var(--night)] text-[var(--muted)]"}`}>
                          {t(r.comparison.summary_pt, r.comparison.summary_en)}
                        </p>
                      )}
                      <div className={`grid gap-4 ${two ? "lg:grid-cols-2" : ""}`}>
                        {([["scene_a", t("Cena A", "Scene A"), "var(--brand)"], ["scene_b", t("Cena B", "Scene B"), "var(--orange)"]] as const).map(([k, label, color]) => {
                          const s = r[k];
                          if (!s) return null;
                          return (
                            <div key={k} className="space-y-3">
                              <VerdictStamp run={r} scene={s} label={two ? label : undefined} accent={color} lang={lang} compact={two}
                                onOpenEvidence={(sc) => setEvidence({ run: r, scene: sc })} />
                              <ClimateStripes series={s.series} unit={s.unit} palette={PALETTE[r.variable.parameter_id] ?? "temp"} lang={lang} />
                              <TrendChart scene={s} lang={lang} color={color} />
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Step>
        </div>

        <section id="ods" data-reveal className="scroll-mt-24"><SdgPanel activeTargets={primary.sdg_targets} lang={lang} /></section>

        <section id="mural" data-reveal className="surface scroll-mt-24 rounded-3xl p-5 sm:p-8">
          <h2 className="text-2xl font-bold text-foreground">{t("Mural de investigações", "Investigation board")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("Cada cartão guarda um link que reabre a mesma ficha.", "Each card reopens the same case file.")}</p>
          {mural.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">
              {t("Examine um caso e use “Salvar no mural” para criar o primeiro cartão.", "Examine a case and use “Save to board”.")}
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {mural.map((c) => (
                <a key={c.id} href={c.shareUrl} className="block rounded-2xl border border-[var(--line)] bg-[var(--night)] p-4 hover:border-primary">
                  <p className="text-xs font-bold text-primary">{c.parameterId}</p>
                  <h3 className="mt-1 text-base font-bold text-foreground">{c.question}</h3>
                  <p className="text-sm text-[var(--muted)]">{c.regions}</p>
                  <p className="mt-2 border-t border-[var(--line)] pt-2 text-sm text-foreground">
                    {c.status.replace(/_/g, " ")} · {c.slope !== null ? `${c.slope > 0 ? "+" : ""}${c.slope} ${c.unit}/${t("déc", "dec")}` : "n/a"}
                  </p>
                </a>
              ))}
            </div>
          )}
        </section>
        <ProposalDocuments lang={lang} />
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
              <li>{t("Seasonal Mann-Kendall (Hirsch e Slack, 1984)", "Seasonal Mann-Kendall (Hirsch and Slack, 1984)")}</li>
              <li>{t("Inclinação de Sen com IC de 95%", "Sen's slope with a 95% CI")}</li>
              <li>{t("Correção de Benjamini-Hochberg (FDR)", "Benjamini-Hochberg correction (FDR)")}</li>
              <li>{t("Veredito decidido pela estatística, nunca por IA", "Verdict decided by statistics, never by AI")}</li>
            </ul>
          </section>
        </div>
        <div className="border-t border-[var(--line)]">
          <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
            <div className="mx-auto flex max-w-xs justify-center rounded-2xl bg-deep-blue px-6 py-5">
              <img src={spaceAppsLogo.url} alt="NASA Space Apps Challenge" width={440} height={171} loading="lazy" className="h-auto w-full max-w-[220px] object-contain" />
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[var(--line)]">
              <img src={agenciesPrimary.url} alt="NASA, GOPEN, CONAE, Bahrain Space Agency, AEB, Canadian Space Agency, ESA"
                width={1593} height={111} loading="lazy" className="h-auto w-full object-contain" />
              <img src={agenciesSecondary.url} alt="KASA, ASES, AEE, Turkish Space Agency, Mohammed Bin Rashid Space Centre, UK Space Agency"
                width={967} height={81} loading="lazy" className="mx-auto mt-3 h-auto w-full max-w-4xl object-contain" />
            </div>
            <p className="text-center text-xs text-[var(--muted)]">
              {t("Dados: NASA Langley Research Center POWER Project (MERRA-2). Space Apps Challenge 2026.", "Data: NASA Langley Research Center POWER Project (MERRA-2). Space Apps Challenge 2026.")}
            </p>
          </div>
        </div>
      </footer>

      {evidence && <EvidenceModal run={evidence.run} scene={evidence.scene} lang={lang} onClose={() => setEvidence(null)} />}
    </div>
  );
}
