"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Search, Sparkles, SplitSquareHorizontal, Share2, Play, Database, Check, AlertCircle, Compass, MapPin, ListChecks, ShieldCheck,
  Thermometer, Moon, Sun, CloudRain, Sprout, Droplets, Satellite, type LucideIcon,
} from "lucide-react";
import { FRONTEND_CLUES, PRESET_CASES, REGION_SHORTCUTS, PELOTAS, clueById, PresetCase } from "@/lib/catalog";
import { planFromQuestion } from "@/lib/plan";
import { ClueRun, DataMode, InvestigationResponse, Lang, SceneAnalysis, ScenePoint } from "@/types/sleuth";
import TrendChart from "@/components/TrendChart";
import VerdictStamp from "@/components/VerdictStamp";
import CrossCheck from "@/components/CrossCheck";
import EvidenceModal from "@/components/EvidenceModal";
import SdgPanel from "@/components/SdgPanel";

const MapSelector = dynamic(() => import("@/components/MapSelector"), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-sm text-slate-500">Carregando mapa…</div>,
});

const FIRST_YEAR = 1981;
const LAST_YEAR = 2025;

const CLUE_ICON: Record<string, LucideIcon> = {
  T2M: Thermometer, T2M_MIN: Moon, T2M_MAX: Sun, PRECTOTCORR: CloudRain, GWETROOT: Sprout, EVPTRNS: Droplets, IMERG_PRECTOT: Satellite,
};

interface MuralCard {
  id: string;
  question: string;
  parameterId: string;
  regions: string;
  status: string;
  slope: number | null;
  unit: string;
  shareUrl: string;
}

function SceneEditor({ label, tone, scene, onChange, active, onActivate }: {
  label: string; tone: "a" | "b"; scene: ScenePoint; onChange: (s: ScenePoint) => void; active: boolean; onActivate: () => void;
}) {
  const a = tone === "a";
  const field = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 transition focus:border-[#1a9bc7] focus:outline-none focus:ring-2 focus:ring-sky-200";
  return (
    <div onClick={onActivate}
      className={`cursor-pointer rounded-xl border p-3 text-sm transition ${active ? (a ? "border-[#1a9bc7] bg-sky-50/70 ring-1 ring-[#1a9bc7]/40" : "border-[#f07c22] bg-orange-50/70 ring-1 ring-[#f07c22]/40") : "border-slate-200 hover:border-slate-300"}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 whitespace-nowrap font-bold ${a ? "text-sky-800" : "text-orange-800"}`}>
          <span className={`h-3 w-3 rounded-full border-2 border-white shadow ${a ? "bg-[#1a9bc7]" : "bg-[#f07c22]"}`} aria-hidden />
          {label}
          {active && <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">clique no mapa</span>}
        </span>
        <select aria-label={`Atalhos para ${label}`} value="" className="max-w-[11rem] rounded-lg border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
          onChange={(e) => { const f = REGION_SHORTCUTS.find((r) => r.region_name === e.target.value); if (f) onChange(f); }}>
          <option value="">Atalhos…</option>
          {REGION_SHORTCUTS.map((r) => <option key={r.region_name} value={r.region_name}>{r.region_name}</option>)}
        </select>
      </div>
      <input aria-label="Nome do local" value={scene.region_name} onChange={(e) => onChange({ ...scene, region_name: e.target.value })}
        className={`mb-1.5 ${field}`} />
      <div className="grid grid-cols-2 gap-1.5">
        <input aria-label="Latitude" type="number" step="0.01" min={-90} max={90} value={scene.latitude}
          onChange={(e) => onChange({ ...scene, latitude: Number(e.target.value) })} className={field} />
        <input aria-label="Longitude" type="number" step="0.01" min={-180} max={180} value={scene.longitude}
          onChange={(e) => onChange({ ...scene, longitude: Number(e.target.value) })} className={field} />
      </div>
    </div>
  );
}

export default function EarthSleuthsApp() {
  const [lang, setLang] = useState<Lang>("pt");
  const [tab, setTab] = useState<"investigate" | "sdg" | "mural">("investigate");
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);

  const [question, setQuestion] = useState(PRESET_CASES[0].question_pt);
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
  const [asking, setAsking] = useState(false);

  // Link reproduzível: restaura a ficha a partir da URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (!p.get("clues")) return;
    const ids = p.get("clues")!.split(",").filter((id) => clueById(id));
    if (ids.length) setClues(ids);
    if (p.get("q")) setQuestion(p.get("q")!);
    const num = (k: string) => (p.get(k) !== null ? Number(p.get(k)) : NaN);
    if (!isNaN(num("latA"))) setSceneA({ region_name: p.get("nameA") ?? "Cena A", latitude: num("latA"), longitude: num("lonA") });
    if (!isNaN(num("latB"))) {
      setSceneB({ region_name: p.get("nameB") ?? "Cena B", latitude: num("latB"), longitude: num("lonB") });
      setTwoScenes(true);
    }
    if (!isNaN(num("start"))) setStartYear(num("start"));
    if (!isNaN(num("end"))) setEndYear(num("end"));
    setNote("Ficha restaurada a partir de um link compartilhado. Confira e clique em Executar.");
  }, []);

  const primary = useMemo(() => clueById(clues[0]) ?? FRONTEND_CLUES[0], [clues]);
  const latestStart = Math.max(...clues.map((id) => clueById(id)?.min_year ?? FIRST_YEAR), startYear);
  const spanWarning = endYear - latestStart + 1 < 15;
  const yearsInvalid = startYear < FIRST_YEAR || endYear > LAST_YEAR || startYear > endYear;

  const shareUrl = () => {
    const p = new URLSearchParams({
      q: question, clues: clues.join(","), start: String(startYear), end: String(endYear),
      nameA: sceneA.region_name, latA: String(sceneA.latitude), lonA: String(sceneA.longitude),
    });
    if (twoScenes) {
      p.set("nameB", sceneB.region_name);
      p.set("latB", String(sceneB.latitude));
      p.set("lonB", String(sceneB.longitude));
    }
    return `${window.location.origin}/?${p.toString()}`;
  };

  const ask = async () => {
    setAsking(true);
    const plan = await planFromQuestion(question, lang);
    setAsking(false);
    if (plan.clues.length) setClues(plan.clues);
    setStartYear(plan.start);
    setEndYear(plan.end);
    setTwoScenes(plan.twoScenes);
    if (plan.places[0]) setSceneA(plan.places[0]);
    if (plan.places[1]) setSceneB(plan.places[1]);
    setNote(plan.note);
    if (plan.run) execute({ question, clues: plan.clues, startYear: plan.start, endYear: plan.end, sceneA: plan.places[0], sceneB: plan.twoScenes ? plan.places[1] : null });
  };

  const applyPreset = (c: PresetCase) => {
    setQuestion(lang === "pt" ? c.question_pt : c.question_en);
    setClues(c.clues);
    setTwoScenes(c.twoScenes);
    setSceneA(c.sceneA);
    if (c.sceneB) setSceneB(c.sceneB);
    setStartYear(FIRST_YEAR);
    setEndYear(LAST_YEAR);
    setNote(t(`“${c.title_pt}” carregado. Mude o que quiser abaixo e use “Executar com estes ajustes”.`, `“${c.title_en}” loaded. Change anything below and use “Run with these settings”.`));
    execute({
      question: lang === "pt" ? c.question_pt : c.question_en, clues: c.clues, startYear: FIRST_YEAR, endYear: LAST_YEAR,
      sceneA: c.sceneA, sceneB: c.twoScenes ? (c.sceneB ?? sceneB) : null,
    });
  };

  const toggleClue = (id: string) =>
    setClues((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]));

  const run = () => execute({ question, clues, startYear, endYear, sceneA, sceneB: twoScenes ? sceneB : null });

  const execute = async (o: { question: string; clues: string[]; startYear: number; endYear: number; sceneA: ScenePoint; sceneB: ScenePoint | null }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: o.question, parameter_ids: o.clues, start_year: o.startYear, end_year: o.endYear, mode, lang,
          scene_a: o.sceneA, scene_b: o.sceneB,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = body.detail;
        throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg: string }) => x.msg).join("; ") : `Erro HTTP ${res.status}`);
      }
      setResult(body as InvestigationResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "O motor estatístico não respondeu.");
    } finally {
      setLoading(false);
    }
  };

  const saveToMural = (r: ClueRun) => {
    if (!result || !r.scene_a) return;
    const url = shareUrl();
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
    const dirs = sig.map((r) => `${r.variable.parameter_id} ${r.scene_a!.statistics.direction === "increasing" ? "↑" : "↓"}`);
    return t(
      `Dossiê: ${sig.length} de ${done.length} pistas com tendência significativa na Cena A${dirs.length ? ` (${dirs.join(", ")})` : ""}. Cada pista é avaliada separadamente; o conjunto é compatível com uma leitura, mas não prova causa.`,
      `Dossier: ${sig.length} of ${done.length} clues show a significant trend in Scene A${dirs.length ? ` (${dirs.join(", ")})` : ""}. Each clue is assessed separately; together they do not prove a cause.`
    );
  }, [result, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabBtn = (k: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} aria-current={tab === k}
      className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${tab === k ? "bg-white text-[#12284a] shadow" : "text-sky-100 hover:bg-white/10"}`}>{label}</button>
  );
  const card = "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,40,74,.05),0_10px_28px_-14px_rgba(16,40,74,.18)]";
  const stepTitle = "flex items-center gap-2 text-lg font-bold text-[#12284a]";
  const field = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm transition focus:border-[#1a9bc7] focus:outline-none focus:ring-2 focus:ring-sky-200";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-gradient-to-r from-[#0a1a34] via-[#12284a] to-[#14416b] text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Compass className="h-6 w-6 text-sky-300" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-extrabold leading-tight tracking-tight">Earth Sleuths</h1>
              <p className="text-xs text-sky-200">{t("O planeta deixa pistas. A ciência revela tendências.", "Earth leaves clues. Science reveals trends.")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <nav className="inline-flex rounded-xl bg-white/10 p-1 ring-1 ring-white/10">
              {tabBtn("investigate", t("Investigar", "Investigate"))}
              {tabBtn("sdg", t("ODS", "SDGs"))}
              {tabBtn("mural", `${t("Mural", "Board")} (${mural.length})`)}
            </nav>
            <button type="button" onClick={() => setLang((l) => (l === "pt" ? "en" : "pt"))}
              className="rounded-xl border border-white/20 px-3 py-1.5 font-semibold transition hover:bg-white/10">
              {lang === "pt" ? "English" : "Português"}
            </button>
          </div>
        </div>
        {(asking || loading) && <div className="indeterminate h-1 w-full bg-sky-900/40" role="progressbar" aria-label={t("Carregando", "Loading")}><div /></div>}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6">
        {tab === "sdg" && <SdgPanel activeTargets={primary.sdg_targets} lang={lang} />}

        {tab === "mural" && (
          <section className="space-y-4">
            <div className={card}>
              <h2 className={stepTitle}>{t("Mural de investigações", "Investigation board")}</h2>
              <p className="mt-1 text-sm text-slate-600">{t("Cada cartão guarda um link que reabre a mesma ficha. Nenhum dado pessoal é coletado.", "Each card keeps a link that reopens the same case file. No personal data is collected.")}</p>
            </div>
            {mural.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                {t("Rode uma investigação e use “Salvar no mural” para criar o primeiro cartão.", "Run an investigation and use “Save to board” to create the first card.")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {mural.map((c) => (
                  <article key={c.id} className={`${card} space-y-2`}>
                    <p className="text-xs font-bold text-sky-700">{c.parameterId}</p>
                    <h3 className="text-sm font-bold text-slate-900">{c.question}</h3>
                    <p className="text-xs text-slate-600">{c.regions}</p>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                      <span className="font-semibold">{c.status.replace(/_/g, " ")} · {c.slope !== null ? `${c.slope > 0 ? "+" : ""}${c.slope} ${c.unit}/déc` : "—"}</span>
                      <a href={c.shareUrl} className="font-semibold text-sky-700 underline">{t("Abrir ficha", "Open case")}</a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "investigate" && (
          <>
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a1a34] via-[#12284a] to-[#17608a] p-6 text-white shadow-xl sm:p-8">
              <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-sky-400/25 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-orange-400/15 blur-3xl" aria-hidden />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">NASA POWER · {t("dados abertos", "open data")}</p>
                <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{t("O que você quer investigar?", "What do you want to investigate?")}</h2>
                <p className="mt-1 max-w-2xl text-sm text-sky-100">
                  {t("Pergunte em linguagem natural. A IA sugere as pistas, o lugar e o período; tudo aparece preenchido logo abaixo para você conferir e mudar.",
                    "Ask in plain language. The AI suggests clues, place and period; everything shows up pre-filled below for you to check and change.")}
                </p>

                <div className="mt-5 flex flex-col gap-2 rounded-2xl bg-white p-1.5 shadow-lg sm:flex-row">
                  <label className="relative flex-1">
                    <span className="sr-only">{t("Pergunta", "Question")}</span>
                    <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" aria-hidden />
                    <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !asking && !loading && ask()}
                      placeholder={t("Ex.: a terra está ficando mais seca no Ceará?", "E.g. is the land getting drier in Ceará?")}
                      className="w-full rounded-xl bg-transparent py-3 pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none" />
                  </label>
                  <button type="button" onClick={ask} disabled={asking || loading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1a9bc7] to-[#1580ad] px-6 py-3 text-sm font-bold text-white shadow transition hover:brightness-110 disabled:from-slate-400 disabled:to-slate-400">
                    <Sparkles className="h-4 w-4" aria-hidden />
                    {asking ? t("Interpretando…", "Interpreting…") : loading ? t("Calculando…", "Computing…") : t("Investigar", "Investigate")}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-sky-200">{t("Exemplos", "Examples")}</span>
                  {PRESET_CASES.map((c) => (
                    <button key={c.id} type="button" onClick={() => applyPreset(c)}
                      className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm transition hover:bg-white/20">
                      {t(c.title_pt, c.title_en)} <span className="text-sky-200">· {c.ods}</span>
                    </button>
                  ))}
                </div>

                {note && <p className="mt-4 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm backdrop-blur" role="status">{note}</p>}
                <p className="mt-4 flex items-start gap-1.5 text-xs text-sky-200/90">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    <strong>{t("Regra de confiança:", "Trust rule:")}</strong>{" "}
                    {t("a IA só sugere a ficha; você confere, o código calcula e a estatística decide o carimbo.",
                      "the AI only suggests the case file; you check it, the code computes and statistics decide the stamp.")}
                  </span>
                </p>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <section className={`${card} space-y-4 lg:col-span-5`}>
                <div className="flex items-center justify-between">
                  <h2 className={stepTitle}>
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-100 text-[#1580ad]"><ListChecks className="h-4 w-4" aria-hidden /></span>
                    {t("Pistas e período", "Clues and period")}
                  </h2>
                  <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-[#12284a]">{clues.length} {t("selecionada(s)", "selected")}</span>
                </div>
                <fieldset className="min-w-0 space-y-1.5">
                  <legend className="sr-only">{t("Pistas", "Clues")}</legend>
                  {FRONTEND_CLUES.map((c) => {
                    const on = clues.includes(c.parameter_id);
                    const Icon = CLUE_ICON[c.parameter_id] ?? Thermometer;
                    return (
                      <label key={c.parameter_id} title={t(c.simple_def_pt, c.simple_def_en)}
                        className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition ${on ? "border-[#1a9bc7] bg-sky-50 ring-1 ring-[#1a9bc7]/40" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleClue(c.parameter_id)} className="peer sr-only" />
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${on ? "bg-[#1a9bc7] text-white" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"}`}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold text-slate-900">{t(c.label_pt, c.label_en)}</span>
                            <code className="shrink-0 rounded bg-[#12284a] px-1.5 py-0.5 text-[10px] text-white">{c.parameter_id}</code>
                          </span>
                          <span className="block truncate text-xs text-slate-500">{t(c.simple_def_pt, c.simple_def_en)} · {t("desde", "since")} {c.min_year}</span>
                        </span>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-sky-300 ${on ? "border-[#1a9bc7] bg-[#1a9bc7] text-white" : "border-slate-300 text-transparent"}`}>
                          <Check className="h-3 w-3" aria-hidden />
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-sm">
                  <label>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Início", "Start")}</span>
                    <input type="number" min={FIRST_YEAR} max={LAST_YEAR} value={startYear} onChange={(e) => setStartYear(Number(e.target.value))} className={field} />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Fim", "End")}</span>
                    <input type="number" min={FIRST_YEAR} max={LAST_YEAR} value={endYear} onChange={(e) => setEndYear(Number(e.target.value))} className={field} />
                  </label>
                  <label>
                    <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"><Database className="h-3 w-3" aria-hidden /> {t("Dados", "Data")}</span>
                    <select value={mode} onChange={(e) => setMode(e.target.value as DataMode)} className={field}>
                      <option value="auto">{t("NASA + reserva", "NASA + backup")}</option>
                      <option value="cache">{t("Cópia salva", "Saved copy")}</option>
                      <option value="live">{t("Só ao vivo", "Live only")}</option>
                    </select>
                  </label>
                </div>
                {yearsInvalid && <p className="text-sm text-red-700">{t(`Use anos entre ${FIRST_YEAR} e ${LAST_YEAR}, com início antes do fim.`, `Use years ${FIRST_YEAR}–${LAST_YEAR}, start before end.`)}</p>}
                {!yearsInvalid && spanWarning && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("Período com menos de 15 anos para alguma pista: o resultado sairá como “dados insuficientes”.", "Fewer than 15 years for some clue: the result will be “insufficient data”.")}</p>
                )}

                <button type="button" disabled={loading || yearsInvalid} onClick={run}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#12284a] to-[#1c4f80] py-3 text-sm font-bold text-white shadow transition hover:brightness-125 disabled:from-slate-400 disabled:to-slate-400">
                  <Play className="h-4 w-4 fill-current" aria-hidden />
                  {loading ? t("Calculando…", "Computing…") : t("Executar com estes ajustes", "Run with these settings")}
                </button>
              </section>

              <section className={`${card} space-y-4 lg:col-span-7`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={stepTitle}>
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-100 text-[#1580ad]"><MapPin className="h-4 w-4" aria-hidden /></span>
                    {t("Onde?", "Where?")}
                  </h2>
                  <button type="button" onClick={() => setTwoScenes((v) => !v)} aria-pressed={twoScenes}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${twoScenes ? "border-[#f07c22] bg-[#f07c22] text-white shadow" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                    <SplitSquareHorizontal className="h-4 w-4" aria-hidden />
                    {twoScenes ? t("Duas Cenas ligado", "Two Scenes on") : t("Comparar com outra região", "Compare with another region")}
                  </button>
                </div>
                <div className={`grid grid-cols-1 gap-3 ${twoScenes ? "sm:grid-cols-2" : ""}`}>
                  <SceneEditor label="Cena A" tone="a" scene={sceneA} onChange={setSceneA} active={!twoScenes || mapTarget === "A"} onActivate={() => setMapTarget("A")} />
                  {twoScenes && <SceneEditor label="Cena B" tone="b" scene={sceneB} onChange={setSceneB} active={mapTarget === "B"} onActivate={() => setMapTarget("B")} />}
                </div>
                <MapSelector sceneA={sceneA} sceneB={twoScenes ? sceneB : null} activeTarget={twoScenes ? mapTarget : "A"}
                  latStep={primary.lat_step} lonStep={primary.lon_step}
                  onSelectPoint={(target, lat, lon) =>
                    (target === "A" ? setSceneA : setSceneB)((s) => ({ ...s, region_name: `Ponto ${lat}, ${lon}`, latitude: lat, longitude: lon }))
                  } />
              </section>
            </div>

            {error && (
              <p className="flex items-center gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {error}
              </p>
            )}

            {result && (
              <section className="space-y-6" aria-live="polite">
                <h2 className={`${stepTitle} text-xl`}>{t("Laudo, carimbo e evidências", "Report, stamp and evidence")}</h2>
                {dossierSummary && <p className="rounded-2xl bg-gradient-to-r from-[#12284a] to-[#1c4f80] p-4 text-sm leading-relaxed text-white shadow-lg">{dossierSummary}</p>}
                {result.runs.map((r) => {
                  const two = !!r.scene_b;
                  const Icon = CLUE_ICON[r.variable.parameter_id] ?? Thermometer;
                  return (
                    <article key={r.variable.parameter_id} className={`${card} space-y-4 border-t-4 border-t-[#1a9bc7]`}>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex items-start gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-[#1580ad]"><Icon className="h-5 w-5" aria-hidden /></span>
                          <div>
                            <h3 className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900">
                              {t(r.variable.label_pt, r.variable.label_en)}
                              <code className="rounded bg-[#12284a] px-2 py-0.5 font-sans text-xs text-white">{r.variable.parameter_id}</code>
                            </h3>
                            <p className="mt-0.5 text-sm text-slate-500">{r.variable.source_mission} · {t(r.variable.simple_def_pt, r.variable.simple_def_en)}</p>
                          </div>
                        </div>
                        {r.scene_a && (
                          <button type="button" onClick={() => saveToMural(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold transition hover:bg-slate-50">
                            {copied === `${result.case_id}-${r.variable.parameter_id}` ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
                            {copied === `${result.case_id}-${r.variable.parameter_id}` ? t("Salvo e link copiado", "Saved, link copied") : t("Salvar no mural", "Save to board")}
                          </button>
                        )}
                      </div>
                      {r.errors.map((e) => (
                        <p key={e} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{e}</p>
                      ))}
                      {r.comparison && (
                        <p className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${r.comparison.confirmed_opposite_trends ? "border-indigo-200 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                          {t(r.comparison.summary_pt, r.comparison.summary_en)}
                        </p>
                      )}
                      <div className={`grid gap-4 ${two ? "lg:grid-cols-2" : ""}`}>
                        {([["scene_a", "Cena A", "#1a9bc7"], ["scene_b", "Cena B", "#f07c22"]] as const).map(([k, label, color]) => {
                          const s = r[k];
                          if (!s) return null;
                          return (
                            <div key={k} className="space-y-3">
                              <VerdictStamp run={r} scene={s} label={two ? label : undefined} lang={lang} onOpenEvidence={(sc) => setEvidence({ run: r, scene: sc })} />
                              <TrendChart scene={s} lang={lang} color={color} />
                              <CrossCheck parameterId={r.variable.parameter_id} scene={s} lang={lang} />
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs text-slate-500">
        {t("Dados: NASA Langley Research Center POWER Project. Earth Sleuths é um projeto independente, sem endosso da NASA.",
          "Data: NASA Langley Research Center POWER Project. Earth Sleuths is independent and not endorsed by NASA.")}
      </footer>

      {evidence && <EvidenceModal run={evidence.run} scene={evidence.scene} lang={lang} onClose={() => setEvidence(null)} />}
    </div>
  );
}
