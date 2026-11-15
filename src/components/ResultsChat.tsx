"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, RotateCcw, AlertCircle, User } from "lucide-react";
import { InvestigationResponse, Lang, SceneAnalysis } from "@/types/sleuth";

interface Msg { role: "user" | "model"; text: string }

const sceneContext = (label: string, s: SceneAnalysis | null) => s && {
  cena: label, lugar: s.geography.region_name, latitude: s.geography.latitude, longitude: s.geography.longitude,
  periodo: `${s.period.start_date} a ${s.period.end_date}`, carimbo: s.status, unidade: s.unit,
  direcao: s.statistics.direction, tendencia_por_decada: s.statistics.slope_per_decade,
  ic95: [s.statistics.ci95_low, s.statistics.ci95_high], p_valor: s.statistics.p_value, q_fdr: s.statistics.q_value_fdr ?? null,
  metodo: s.statistics.methodology, nota_robustez: s.statistics.robustness_note,
  meses_validos: s.quality.n_valid, meses_total: s.quality.n_total, anos: s.quality.span_years,
  percentual_ausente: s.quality.percent_ausente, alerta_qualidade: s.quality.alert,
  fonte: `${s.provenance.source_mission} (${s.provenance.data_mode})`, resumo_do_app: s.narrative,
};

const buildContext = (r: InvestigationResponse) => ({
  pergunta_do_aluno: r.question, testes_estatisticos: r.n_tests,
  pistas: r.runs.map((run) => ({
    pista: run.variable.parameter_id, nome: run.variable.label_pt, o_que_e: run.variable.simple_def_pt,
    cenas: [sceneContext("A", run.scene_a), sceneContext("B", run.scene_b)].filter(Boolean),
    comparacao_entre_cenas: run.comparison?.summary_pt ?? null, erros: run.errors,
  })),
});

/** Markdown mínimo (negrito, listas, títulos): o suficiente para as respostas do modelo, sem dependência. */
const inline = (s: string) =>
  s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i} className="font-bold text-slate-900">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));

function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={out.length} className="my-1.5 list-disc space-y-1 pl-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) return list.push(li[1]);
    flush();
    if (!line) return;
    const h = line.match(/^#{1,4}\s+(.*)/);
    out.push(<p key={out.length} className={h ? "mt-3 font-bold text-[#12284a]" : "mt-1.5"}>{inline(h ? h[1] : line)}</p>);
  });
  flush();
  return <div className="text-sm leading-relaxed text-slate-700 [&>*:first-child]:mt-0">{out}</div>;
}

export default function ResultsChat({ result, lang }: { result: InvestigationResponse; lang: Lang }) {
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

  const send = async (text: string, history = msgs) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...history, { role: "user", text: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context: buildContext(result) }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok || !body.text) throw new Error();
      setMsgs([...next, { role: "model", text: body.text }]);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => { const last = msgs[msgs.length - 1]; if (last?.role === "user") send(last.text, msgs.slice(0, -1)); };

  const suggestions = [
    t("Explique esses resultados para mim", "Explain these results to me"),
    t("Isso prova que o clima está mudando?", "Does this prove the climate is changing?"),
    t("O que significa “pode ser ruído”?", "What does “may be noise” mean?"),
    t("Como eu usaria isso num trabalho da escola?", "How could I use this in a school project?"),
  ];

  return (
    <section aria-label={t("Chat com os resultados", "Chat about the results")}
      className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,40,74,.05),0_10px_28px_-14px_rgba(16,40,74,.18)]">
      <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#0a1a34] via-[#12284a] to-[#14416b] px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20"><Bot className="h-5 w-5 text-sky-300" aria-hidden /></span>
          <div>
            <h2 className="text-lg font-bold leading-tight">{t("Converse com os seus resultados", "Chat about your results")}</h2>
            <p className="text-xs text-sky-200">{t("Sleuth, o cientista do clima · Gemini", "Sleuth, the climate scientist · Gemini")}</p>
          </div>
        </div>
        {msgs.length > 0 && (
          <button type="button" onClick={() => { setMsgs([]); setFailed(false); }} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-50">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t("Nova conversa", "New chat")}
          </button>
        )}
      </header>

      <div ref={box} className="max-h-[560px] min-h-[220px] space-y-4 overflow-y-auto bg-slate-50/60 p-5" aria-live="polite">
        {msgs.length === 0 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky-100 bg-white p-4 text-sm leading-relaxed text-slate-700">
              <p className="font-semibold text-[#12284a]">{t("Ficou alguma dúvida sobre os gráficos e carimbos?", "Any questions about the charts and stamps?")}</p>
              <p className="mt-1">
                {t("Pergunte do seu jeito. Eu leio os resultados e as tabelas desta investigação e explico em linguagem simples, pensando em quem está no ensino médio ou na faculdade. Na primeira resposta faço um resumo completo; depois a conversa segue com o que você quiser saber.",
                  "Ask in your own words. I read this investigation's results and tables and explain them simply, for high-school and college students. My first answer is a complete summary; after that the chat follows whatever you want to know.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white px-3.5 py-1.5 text-sm text-[#12284a] transition hover:border-[#1a9bc7] hover:bg-sky-50">
                  <Sparkles className="h-3.5 w-3.5 text-[#1a9bc7]" aria-hidden /> {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex items-start justify-end gap-2.5">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-gradient-to-r from-[#1a9bc7] to-[#1580ad] px-4 py-2.5 text-sm text-white shadow">{m.text}</p>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-100 text-[#1580ad]"><User className="h-4 w-4" aria-hidden /></span>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#12284a] text-sky-300"><Bot className="h-4 w-4" aria-hidden /></span>
            <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm"><Markdown text={m.text} /></div>
          </div>
        ))}

        {busy && (
          <div className="flex items-start gap-2.5" role="status" aria-label={t("Sleuth está escrevendo", "Sleuth is typing")}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#12284a] text-sky-300"><Bot className="h-4 w-4" aria-hidden /></span>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[#1a9bc7]" style={{ animationDelay: `${d}ms` }} />)}
              {msgs.length === 1 && <span className="ml-2 text-xs text-slate-500">{t("Lendo os resultados…", "Reading the results…")}</span>}
            </div>
          </div>
        )}

        {failed && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {t("Não consegui responder agora (limite ou conexão). Seus resultados continuam salvos.", "I could not answer right now (limit or connection). Your results are still here.")}
            <button type="button" onClick={retry} className="font-bold underline">{t("Tentar de novo", "Try again")}</button>
          </p>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
        <label className="flex-1">
          <span className="sr-only">{t("Sua pergunta", "Your question")}</span>
          <textarea value={input} rows={1} maxLength={1000} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={t("Pergunte sobre os gráficos, carimbos ou números…", "Ask about the charts, stamps or numbers…")}
            className="max-h-32 w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm transition focus:border-[#1a9bc7] focus:outline-none focus:ring-2 focus:ring-sky-200" />
        </label>
        <button type="submit" disabled={busy || !input.trim()} aria-label={t("Enviar", "Send")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-[#1a9bc7] to-[#1580ad] text-white shadow transition hover:brightness-110 disabled:from-slate-300 disabled:to-slate-300">
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
      <p className="bg-white px-4 pb-3 text-center text-[11px] text-slate-400">
        {t("A IA explica os números do app, não calcula nem muda o carimbo. Pode errar: confira nas evidências.", "The AI explains the app's numbers; it does not compute or change the stamp. It can be wrong: check the evidence.")}
      </p>
    </section>
  );
}
