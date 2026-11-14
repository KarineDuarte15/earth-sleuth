"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Search, Wand2, SplitSquareHorizontal, Share2, Play, Database, Check, AlertCircle, Compass } from "lucide-react";
import { FRONTEND_CLUES, PRESET_CASES, REGION_SHORTCUTS, PELOTAS, clueById, PresetCase } from "@/lib/catalog";
import { interpretQuestion } from "@/lib/interpreter";
import { ClueRun, DataMode, InvestigationResponse, Lang, SceneAnalysis, ScenePoint } from "@/types/sleuth";
import TrendChart from "@/components/TrendChart";
import VerdictStamp from "@/components/VerdictStamp";
import EvidenceModal from "@/components/EvidenceModal";
import SdgPanel from "@/components/SdgPanel";

const MapSelector = dynamic(() => import("@/components/MapSelector"), {
  ssr: false,
  loading: () => <div className="flex h-[340px] items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500">Carregando mapa…</div>,
});

const FIRST_YEAR = 1981;
const LAST_YEAR = 2025;

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
  const border = tone === "a" ? "border-[#1a9bc7] bg-sky-50/60" : "border-[#f07c22] bg-orange-50/60";
  return (
    <div onClick={onActivate} className={`cursor-pointer rounded-xl border p-3 text-sm ${active ? border : "border-slate-200"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`font-bold ${tone === "a" ? "text-sky-800" : "text-orange-800"}`}>{label}{active ? " (clique no mapa)" : ""}</span>
        <select aria-label={`Atalhos para ${label}`} value="" className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
          onChange={(e) => { const f = REGION_SHORTCUTS.find((r) => r.region_name === e.target.value); if (f) onChange(f); }}>
          <option value="">Atalhos…</option>
          {REGION_SHORTCUTS.map((r) => <option key={r.region_name} value={r.region_name}>{r.region_name}</option>)}
        </select>
      </div>
      <input aria-label="Nome do local" value={scene.region_name} onChange={(e) => onChange({ ...scene, region_name: e.target.value })}
        className="mb-1.5 w-full rounded border border-slate-300 bg-white px-2 py-1" />
      <div className="grid grid-cols-2 gap-1.5">
        <input aria-label="Latitude" type="number" step="0.01" min={-90} max={90} value={scene.latitude}
          onChange={(e) => onChange({ ...scene, latitude: Number(e.target.value) })} className="rounded border border-slate-300 bg-white px-2 py-1" />
        <input aria-label="Longitude" type="number" step="0.01" min={-180} max={180} value={scene.longitude}
          onChange={(e) => onChange({ ...scene, longitude: Number(e.target.value) })} className="rounded border border-slate-300 bg-white px-2 py-1" />
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

  const interpret = () => {
    const i = interpretQuestion(question);
    setClues(i.clues);
    if (i.twoScenes) setTwoScenes(true);
    setNote(lang === "pt" ? i.rationale_pt : i.rationale_en);
  };

  const applyPreset = (c: PresetCase) => {
    setQuestion(lang === "pt" ? c.question_pt : c.question_en);
    setClues(c.clues);
    setTwoScenes(c.twoScenes);
    setSceneA(c.sceneA);
    if (c.sceneB) setSceneB(c.sceneB);
    setStartYear(FIRST_YEAR);
    setEndYear(LAST_YEAR);
    setNote(t(`“${c.title_pt}” carregado na ficha. Edite o que quiser antes de executar.`, `“${c.title_en}” loaded. Edit anything before running.`));
  };

  const toggleClue = (id: string) =>
    setClues((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]));

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question, parameter_ids: clues, start_year: startYear, end_year: endYear, mode, lang,
          scene_a: sceneA, scene_b: twoScenes ? sceneB : null,
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
      className={`rounded-md px-3 py-1.5 font-semibold ${tab === k ? "bg-[#1a9bc7] text-white" : "text-slate-300 hover:text-white"}`}>{label}</button>
  );
  const card = "rounded-2xl border border-slate-200 bg-white p-5";
  const stepTitle = "text-lg font-bold text-[#12284a]";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 bg-[#12284a] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Compass className="h-8 w-8 text-[#1a9bc7]" aria-hidden />
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Earth Sleuths</h1>
              <p className="text-xs text-sky-200">{t("O planeta deixa pistas. A ciência revela tendências.", "Earth leaves clues. Science reveals trends.")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <nav className="inline-flex rounded-lg bg-white/10 p-1">
              {tabBtn("investigate", t("Investigar", "Investigate"))}
              {tabBtn("sdg", t("ODS", "SDGs"))}
              {tabBtn("mural", `${t("Mural", "Board")} (${mural.length})`)}
            </nav>
            <button type="button" onClick={() => setLang((l) => (l === "pt" ? "en" : "pt"))}
              className="rounded-lg border border-white/20 px-2.5 py-1.5 font-semibold hover:bg-white/10">
              {lang === "pt" ? "English" : "Português"}
            </button>
          </div>
        </div>
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
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                {t("Rode uma investigação e use “Salvar no mural” para criar o primeiro cartão.", "Run an investigation and use “Save to board” to create the first card.")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {mural.map((c) => (
                  <article key={c.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
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
            <p className="rounded-xl bg-[#e6f4fa] px-4 py-2.5 text-sm text-[#12284a]">
              <strong>{t("Regra de confiança:", "Trust rule:")}</strong>{" "}
              {t("a interface sugere as pistas, você confirma a ficha, o código calcula e a estatística — nunca uma IA — decide o carimbo.",
                "the interface suggests clues, you confirm the case file, the code computes and statistics — never AI — decide the stamp.")}
            </p>

            <section className={`${card} space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={stepTitle}>1. {t("Qual é o caso?", "What is the case?")}</h2>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_CASES.map((c) => (
                    <button key={c.id} type="button" onClick={() => applyPreset(c)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm hover:border-[#1a9bc7] hover:bg-sky-50">
                      {t(c.title_pt, c.title_en)} <span className="text-slate-500">· {c.ods}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative flex-1">
                  <span className="sr-only">{t("Pergunta", "Question")}</span>
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" aria-hidden />
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && interpret()}
                    placeholder={t("Ex.: a terra está ficando mais seca no Ceará?", "E.g. is the land getting drier in Ceará?")}
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm" />
                </label>
                <button type="button" onClick={interpret}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#12284a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1c3a66]">
                  <Wand2 className="h-4 w-4" aria-hidden /> {t("Sugerir pistas", "Suggest clues")}
                </button>
              </div>
              {note && <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900" role="status">{note}</p>}
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <section className={`${card} space-y-4 lg:col-span-5`}>
                <div className="flex items-center justify-between">
                  <h2 className={stepTitle}>2. {t("Ficha do caso", "Case file")}</h2>
                  <span className="text-sm text-slate-500">{clues.length} {t("pista(s)", "clue(s)")}</span>
                </div>
                <fieldset className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                  <legend className="sr-only">{t("Pistas", "Clues")}</legend>
                  {FRONTEND_CLUES.map((c) => {
                    const on = clues.includes(c.parameter_id);
                    return (
                      <label key={c.parameter_id} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 ${on ? "border-[#1a9bc7] bg-sky-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleClue(c.parameter_id)} className="mt-1 accent-[#1a9bc7]" />
                        <span className="flex-1 text-sm">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">{t(c.label_pt, c.label_en)}</span>
                            <code className="rounded bg-[#12284a] px-1.5 py-0.5 text-[10px] text-white">{c.parameter_id}</code>
                          </span>
                          <span className="block text-slate-600">{t(c.simple_def_pt, c.simple_def_en)}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{c.data_type_pt}, {c.spatial_resolution}, {t("desde", "since")} {c.min_year}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-sm">
                  <label>
                    <span className="mb-1 block font-semibold text-slate-700">{t("Início", "Start")}</span>
                    <input type="number" min={FIRST_YEAR} max={LAST_YEAR} value={startYear} onChange={(e) => setStartYear(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5" />
                  </label>
                  <label>
                    <span className="mb-1 block font-semibold text-slate-700">{t("Fim", "End")}</span>
                    <input type="number" min={FIRST_YEAR} max={LAST_YEAR} value={endYear} onChange={(e) => setEndYear(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5" />
                  </label>
                  <label>
                    <span className="mb-1 flex items-center gap-1 font-semibold text-slate-700"><Database className="h-3.5 w-3.5" aria-hidden /> {t("Dados", "Data")}</span>
                    <select value={mode} onChange={(e) => setMode(e.target.value as DataMode)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5">
                      <option value="auto">{t("NASA ao vivo + reserva", "NASA live + backup")}</option>
                      <option value="cache">{t("Cópia salva (rápido)", "Saved copy (fast)")}</option>
                      <option value="live">{t("Só NASA ao vivo", "NASA live only")}</option>
                    </select>
                  </label>
                </div>
                {yearsInvalid && <p className="text-sm text-red-700">{t(`Use anos entre ${FIRST_YEAR} e ${LAST_YEAR}, com início antes do fim.`, `Use years ${FIRST_YEAR}–${LAST_YEAR}, start before end.`)}</p>}
                {!yearsInvalid && spanWarning && (
                  <p className="text-sm text-amber-800">{t("Período com menos de 15 anos para alguma pista: o resultado sairá como “dados insuficientes”.", "Fewer than 15 years for some clue: the result will be “insufficient data”.")}</p>
                )}

                <button type="button" disabled={loading || yearsInvalid} onClick={run}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1a9bc7] py-3 text-sm font-bold text-white hover:bg-[#1789b0] disabled:bg-slate-400">
                  <Play className="h-4 w-4 fill-current" aria-hidden />
                  {loading ? t("Calculando…", "Computing…") : t("Executar investigação", "Run investigation")}
                </button>
              </section>

              <section className={`${card} space-y-4 lg:col-span-7`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={stepTitle}>3. {t("Onde?", "Where?")}</h2>
                  <button type="button" onClick={() => setTwoScenes((v) => !v)} aria-pressed={twoScenes}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${twoScenes ? "border-[#f07c22] bg-[#f07c22] text-white" : "border-slate-300 bg-slate-50 text-slate-700"}`}>
                    <SplitSquareHorizontal className="h-4 w-4" aria-hidden />
                    {twoScenes ? t("Duas Cenas ligado", "Two Scenes on") : t("Comparar com outra região", "Compare with another region")}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <p className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {error}
              </p>
            )}

            {result && (
              <section className="space-y-6" aria-live="polite">
                <h2 className={stepTitle}>4–6. {t("Laudo, carimbo e evidências", "Report, stamp and evidence")}</h2>
                {dossierSummary && <p className="rounded-xl bg-[#12284a] p-4 text-sm text-white">{dossierSummary}</p>}
                {result.runs.map((r) => {
                  const two = !!r.scene_b;
                  return (
                    <article key={r.variable.parameter_id} className={`${card} space-y-4`}>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div>
                          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                            <code className="rounded bg-[#12284a] px-2 py-0.5 font-sans text-xs text-white">{r.variable.parameter_id}</code>
                            {t(r.variable.label_pt, r.variable.label_en)}
                          </h3>
                          <p className="mt-0.5 text-sm text-slate-500">{r.variable.source_mission} · {t(r.variable.simple_def_pt, r.variable.simple_def_en)}</p>
                        </div>
                        {r.scene_a && (
                          <button type="button" onClick={() => saveToMural(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">
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

      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        {t("Dados: NASA Langley Research Center POWER Project. Earth Sleuths é um projeto independente, sem endosso da NASA.",
          "Data: NASA Langley Research Center POWER Project. Earth Sleuths is independent and not endorsed by NASA.")}
      </footer>

      {evidence && <EvidenceModal run={evidence.run} scene={evidence.scene} lang={lang} onClose={() => setEvidence(null)} />}
    </div>
  );
}
