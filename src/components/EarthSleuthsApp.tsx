const LOGO_SRC = "/brand/orbiting-analytics-globe.png";
const LOGO_SMALL_SRC = "/brand/orbiting-analytics-globe-256.png";
// Address search and the AI comparison summary need a signed-in account (Supabase + Lovable gateway).
// Space Apps judges must reach the whole project without a login, so both stay off for the submission.
// Set to true to bring them back; their code is unchanged.
const ACCOUNT_FEATURES_ENABLED = false;
import agenciesPrimary from "@/assets/space-agencies-primary.png.asset.json";
import agenciesSecondary from "@/assets/space-agencies-secondary.png.asset.json";
import spaceAppsLogo from "@/assets/space-apps-logo.png.asset.json";
import { Button } from "@/components/ui/button";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { analyzeInvestigation } from "@/lib/analyze.functions";
import {
  Thermometer, Moon, Sun, CloudRain, Sprout, Leaf, Satellite, Search, Wand2, SplitSquareHorizontal,
  Share2, Check, AlertCircle, FolderOpen, MapPin, ScanSearch, type LucideIcon,
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

const MapSelectorLazy = lazy(() => import("@/components/MapSelector"));
const mapFallback = <div className="flex h-[380px] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--panel)] text-sm text-[var(--muted)]">Carregando mapa…</div>;
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
    <section id={id} className="scroll-mt-20 rounded-3xl border border-[var(--line)] bg-[var(--panel)]/70 p-5 sm:p-7">
      <div className="mb-5 flex items-baseline gap-4">
        <span className="font-serif text-4xl font-extrabold text-[var(--brand)]" aria-hidden>{n}</span>
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          {hint && <p className="text-sm text-[var(--muted)]">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
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

  // A barra de endereço acompanha a ficha: qualquer estado vira um link
  useEffect(() => {
    if (restored.current) window.history.replaceState(null, "", shareUrl);
  }, [shareUrl]);

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
    `rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-primary bg-primary/15 text-foreground" : "border-[var(--line)] text-[var(--muted)] hover:border-primary/60 hover:text-foreground"}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-blue-yonder bg-deep-blue text-brand-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="#topo" className="flex items-center gap-2.5">
            <img src={LOGO_SMALL_SRC} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-md bg-brand-white object-contain p-0.5" />
            <span className="font-serif text-lg font-extrabold text-brand-white">Earth Sleuth</span>
          </a>
          <nav className="flex items-center gap-1 text-sm">
            <Button asChild variant="plain" size="content" className="hidden rounded-md bg-neon-blue px-3 py-1.5 text-brand-white hover:bg-electric-blue sm:inline-flex"><a href="#pista">{t("Investigar", "Investigate")}</a></Button>
            <Button asChild variant="plain" size="content" className="hidden rounded-md px-3 py-1.5 text-blue-yonder hover:bg-electric-blue hover:text-brand-white sm:inline-flex"><a href="#ods">{t("ODS", "SDGs")}</a></Button>
            <Button asChild variant="plain" size="content" className="rounded-md bg-martian-red px-3 py-1.5 text-brand-white hover:bg-rocket-red"><a href="#mural">{t("Mural", "Board")} ({mural.length})</a></Button>
            <Button variant="plain" size="content" type="button" onClick={() => setLang((l) => (l === "pt" ? "en" : "pt"))}
              className="ml-1 rounded-md border border-neon-yellow bg-neon-yellow px-2.5 py-1.5 font-semibold text-deep-blue hover:bg-neon-yellow/80">
              {lang === "pt" ? "EN" : "PT"}
            </Button>
          </nav>
        </div>
        <div aria-hidden="true" className="grid h-1 grid-cols-8">
          <span className="bg-deep-blue" /><span className="bg-electric-blue" /><span className="bg-neon-blue" /><span className="bg-blue-yonder" />
          <span className="bg-rocket-red" /><span className="bg-martian-red" /><span className="bg-neon-yellow" /><span className="bg-brand-white" />
        </div>
      </header>

      <div id="topo" className="starfield">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-14 sm:pt-20">
          <img src={LOGO_SRC} width={176} height={176} alt={t("Logo Earth Sleuth: planeta, lupa e satélite", "Earth Sleuth logo: globe, magnifying glass and satellite")} className="mb-5 h-36 w-36 object-contain sm:h-44 sm:w-44" />
          <p className="text-sm font-semibold text-primary">{t("O planeta deixa pistas. A ciência revela tendências.", "Earth leaves clues. Science reveals trends.")}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.1] text-foreground sm:text-6xl">
            {t("Está mudando mesmo — ou foi só um ano estranho?", "Is it really changing — or was it just a strange year?")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[var(--muted)]">
            {t("Escolha uma pista, um lugar e um período. O Earth Sleuth busca décadas de dados da NASA e devolve um veredito com a estatística à vista.",
              "Pick a clue, a place and a period. Earth Sleuth pulls decades of NASA data and returns a verdict with the statistics in plain sight.")}
          </p>

          <div className="mt-12 grid gap-x-4 gap-y-12 md:grid-cols-3">
            {PRESET_CASES.map((c, i) => (
              <Button variant="plain" size="content" key={c.id} type="button" onClick={() => applyPreset(c)}
                className="group relative block rounded-2xl rounded-tl-none border border-[var(--line)] bg-[var(--panel)] p-5 pt-6 text-left transition hover:-translate-y-1 hover:border-primary/70">
                <span className="absolute -top-7 left-0 rounded-t-lg border border-b-0 border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-primary group-hover:border-primary/70">
                  {t("Dossiê", "Case")} {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex gap-1.5 text-primary">
                  {c.clues.map((id) => { const I = CLUE_ICON[id]; return <I key={id} className="h-5 w-5" aria-hidden />; })}
                </span>
                <span className="mt-3 block font-serif text-lg font-bold text-foreground">{t(c.title_pt.split("·")[1]?.trim() ?? c.title_pt, c.title_en.split("·")[1]?.trim() ?? c.title_en)}</span>
                <span className="mt-1 block text-sm text-[var(--muted)]">{t(c.question_pt, c.question_en)}</span>
                <span className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>{c.sceneA.region_name.split("/")[0]}{c.sceneB ? ` × ${c.sceneB.region_name.split("/")[0]}` : ""}</span>
                  <span className="flex items-center gap-1 font-semibold text-primary"><FolderOpen className="h-3.5 w-3.5" aria-hidden />{t("Abrir", "Open")}</span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8">
        <Step id="pista" n="01" title={t("Escolha a pista", "Choose the clue")} hint={t("Pode marcar mais de uma: cada pista é testada separadamente.", "Pick one or more; each clue is tested separately.")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {FRONTEND_CLUES.map((c) => {
              const on = clues.includes(c.parameter_id);
              const I = CLUE_ICON[c.parameter_id];
              return (
                <Button variant="plain" size="content" key={c.parameter_id} type="button" aria-pressed={on} onClick={() => toggleClue(c.parameter_id)}
                  onMouseEnter={() => setFocusClue(c.parameter_id)} onFocus={() => setFocusClue(c.parameter_id)}
                  className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${on ? "border-primary bg-primary/10 text-foreground" : "border-[var(--line)] text-[var(--muted)] hover:border-primary/50 hover:text-foreground"}`}>
                  {on && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" aria-hidden />}
                  <I className={`h-8 w-8 ${on ? "text-primary" : ""}`} aria-hidden />
                  <span className="text-sm font-semibold leading-tight">{t(c.label_pt, c.label_en)}</span>
                </Button>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--night)] p-4 text-sm">
            <span className="font-semibold text-foreground">{t(focused.label_pt, focused.label_en)}</span>
            <span className="text-[var(--muted)]"> — {t(focused.simple_def_pt, focused.simple_def_en)} </span>
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
              className="relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-neon-yellow px-6 py-4 text-lg font-bold text-deep-blue shadow-[var(--button-shadow)] transition hover:bg-neon-yellow/80 disabled:opacity-80">
              {loading && <span className="scan-bar absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent" aria-hidden />}
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

        <div ref={resultsRef} className="scroll-mt-20">
          <Step n="04" title={t("Evidências e veredito", "Evidence and verdict")}
            hint={t("A estatística decide o carimbo — não uma IA.", "Statistics decide the stamp — never AI.")}>
            {!result ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] p-10 text-center text-[var(--muted)]">
                <ScanSearch className="mx-auto mb-3 h-10 w-10 text-[var(--line)]" aria-hidden />
                {t("Nenhum caso aberto ainda. Escolha pista, lugar e período e clique em Examinar — ou abra um dossiê lá em cima.",
                  "No case open yet. Pick a clue, place and period and press Examine — or open a case file above.")}
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

        <section id="ods" className="scroll-mt-20"><SdgPanel activeTargets={primary.sdg_targets} lang={lang} /></section>

        <section id="mural" className="scroll-mt-20 rounded-3xl border border-[var(--line)] bg-[var(--panel)]/70 p-5 sm:p-7">
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
                    {c.status.replace(/_/g, " ")} · {c.slope !== null ? `${c.slope > 0 ? "+" : ""}${c.slope} ${c.unit}/${t("déc", "dec")}` : "—"}
                  </p>
                </a>
              ))}
            </div>
          )}
        </section>
        <ProposalDocuments lang={lang} />
      </main>

      <footer className="border-t border-[var(--line)] px-4 py-6 text-center text-xs text-[var(--muted)]">
        <section aria-labelledby="nasa-resources-title" className="mx-auto mb-8 max-w-6xl text-left">
          <h2 id="nasa-resources-title" className="mb-4 text-lg font-bold text-deep-blue">{t("Recursos NASA utilizados", "NASA resources used")}</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="border-l-4 border-neon-blue pl-4">
              <Button asChild variant="link" size="content" className="p-0 text-base font-semibold text-electric-blue"><a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA POWER ↗</a></Button>
              <p className="mt-2 text-sm leading-relaxed">{t("API de séries mensais por coordenadas, do NASA Langley Research Center. Fonte de acesso aos dados das investigações.", "Monthly time-series API by coordinates from NASA Langley Research Center. Data access source for investigations.")}</p>
              <p className="mt-2 break-words text-xs text-electric-blue">T2M · T2M_MIN · T2M_MAX · PRECTOTCORR · GWETROOT · EVPTRNS</p>
            </div>
            <div className="border-l-4 border-rocket-red pl-4">
              <Button asChild variant="link" size="content" className="p-0 text-base font-semibold text-electric-blue"><a href="https://gmao.gsfc.nasa.gov/gmao-products/merra-2/" target="_blank" rel="noopener noreferrer">GMAO MERRA-2 ↗</a></Button>
              <p className="mt-2 text-sm leading-relaxed">{t("Reanálise usada para temperatura do ar, precipitação corrigida, umidade do solo e evapotranspiração, acessada via POWER.", "Reanalysis used for air temperature, corrected precipitation, soil wetness and evapotranspiration, accessed through POWER.")}</p>
            </div>
          </div>
        </section>
        <div className="mx-auto mb-6 flex max-w-6xl justify-center rounded-md bg-deep-blue px-6 py-6">
          <img src={spaceAppsLogo.url} alt="NASA Space Apps Challenge" width={440} height={171}
            loading="lazy" className="h-auto w-full max-w-[280px] object-contain" />
        </div>
        <div className="mx-auto mb-6 max-w-6xl space-y-4 overflow-x-auto">
          <img src={agenciesPrimary.url} alt="NASA, GOPEN, CONAE, Bahrain Space Agency, AEB, Canadian Space Agency e ESA"
            width={1593} height={111} loading="lazy" className="h-auto w-full min-w-[720px] object-contain" />
          <img src={agenciesSecondary.url} alt="KASA e outras agências espaciais internacionais, incluindo ASES, AEE, Turkish Space Agency, Mohammed Bin Rashid Space Centre e UK Space Agency"
            width={967} height={81} loading="lazy" className="mx-auto h-auto w-full min-w-[720px] max-w-4xl object-contain" />
        </div>
        {t("Dados: NASA Langley Research Center POWER Project (MERRA-2). Uma linha de tendência descreve o passado; não é previsão climática. Projeto independente, sem endosso da NASA.",
          "Data: NASA Langley Research Center POWER Project. A trend line describes the past; it is not a climate forecast. Independent project, not endorsed by NASA.")}
      </footer>

      {evidence && <EvidenceModal run={evidence.run} scene={evidence.scene} lang={lang} onClose={() => setEvidence(null)} />}
    </div>
  );
}
