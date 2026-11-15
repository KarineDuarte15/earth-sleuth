import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { canExportComparison } from "@/lib/comparison-report";
import { prepareSynthesis, type ComparisonSynthesis as Synthesis } from "@/lib/comparison-synthesis";
import { synthesizeComparison } from "@/lib/comparison-synthesis.functions";
import type { InvestigationResponse, Lang } from "@/types/sleuth";

export default function ComparisonSynthesis({ result, lang }: { result: InvestigationResponse; lang: Lang }) {
  const [question, setQuestion] = useState(result.question);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const version = useRef(0);
  const generate = useServerFn(synthesizeComparison);
  const t = (pt: string, en: string) => lang === "pt" ? pt : en;
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { version.current++; setQuestion(result.question); setSynthesis(null); setError(""); setBusy(false); }, [result, lang]);
  useEffect(() => () => { version.current++; }, []);
  if (!canExportComparison(result)) return null;
  return <section aria-labelledby="synthesis-title" className="space-y-4 border-y border-border py-6">
    <h3 id="synthesis-title" className="flex items-center gap-2 text-xl font-bold text-foreground"><Sparkles className="text-primary" />{t("Síntese da comparação por IA", "AI comparison synthesis")}</h3>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); if (busy || !signedIn) return;
      const current = ++version.current;
      setBusy(true); setError("");
      try {
        const response = await generate({ data: prepareSynthesis(result, question, lang) });
        if (current !== version.current) return;
        if (response.synthesis) setSynthesis(response.synthesis);
        else setError(response.error ?? t("Síntese indisponível.", "Synthesis unavailable."));
      } catch { if (current === version.current) setError(t("Não foi possível gerar a síntese. Confira sua sessão e tente novamente.", "Unable to generate the synthesis. Check your session and try again.")); }
      finally { if (current === version.current) setBusy(false); }
    }}>
      <label htmlFor="synthesis-question" className="block text-sm font-semibold">{t("Pergunta para a síntese", "Synthesis question")}</label>
      <Textarea id="synthesis-question" value={question} maxLength={2000} disabled={busy} onChange={e => setQuestion(e.target.value)} className="min-h-24" />
      <p className="text-sm text-muted-foreground">{t("Ao enviar, sua pergunta, os dados mensais A/B e as fontes desta investigação serão compartilhados com o modelo. A síntese pode conter erros e não altera o veredito estatístico.", "Sending shares your question, A/B monthly data and this investigation's sources with the model. The synthesis may contain errors and does not change the statistical verdict.")}</p>
      <Button type="submit" disabled={busy || !signedIn || question.trim().length < 3} className="max-w-full whitespace-normal">{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}{busy ? t("Gerando síntese…", "Generating synthesis…") : t("Enviar pergunta e dados", "Send question and data")}</Button>
      {!signedIn && <p className="text-sm text-muted-foreground">{t("Entre na sua conta na busca de locais para gerar a síntese.", "Sign in through the place search to generate the synthesis.")}</p>}
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {synthesis && <div aria-live="polite" className="space-y-5 break-words text-sm leading-relaxed">
      <p>{synthesis.summary}</p>
      {([
        [t("Padrões", "Patterns"), synthesis.patterns],
        [t("Ressalvas", "Caveats"), synthesis.caveats],
        [t("Próximos passos", "Next steps"), synthesis.next_steps],
      ] as const).map(([title, items]) => <div key={title}><h4 className="mb-2 text-base font-bold text-primary">{title}</h4><ul className="list-disc space-y-2 pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul></div>)}
      <h4 className="font-bold">{t("Fontes enviadas", "Submitted sources")}</h4>
      <ul className="space-y-2">{result.runs.flatMap(run => [run.scene_a, run.scene_b].flatMap((scene, i) => {
        if (!scene) return [];
        const url = scene.provenance.request_url;
        return [<li key={`${run.variable.parameter_id}-${i}`} className="break-words">{i === 0 ? "A" : "B"} · {scene.geography.region_name} · {scene.provenance.source_mission} · {scene.provenance.dataset_id}{url?.startsWith("https://power.larc.nasa.gov/") && <Button asChild variant="link" size="content" className="ml-2 whitespace-normal"><a href={url} target="_blank" rel="noopener noreferrer">NASA POWER ↗</a></Button>}</li>];
      }))}</ul>
    </div>}
  </section>;
}