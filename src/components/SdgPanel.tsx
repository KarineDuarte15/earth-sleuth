"use client";

import { useState } from "react";
import { GraduationCap, Droplets, Flame, Trees, Building2, Waves } from "lucide-react";
import { Lang } from "@/types/sleuth";

const SDG = [
  { code: "ODS 4", target: "4.4 e 4.7", pt: "Educação de qualidade", en: "Quality education", Icon: GraduationCap, tone: "border-red-200 bg-red-50 text-red-950",
    dpt: "Letramento científico com dados reais da NASA para estudantes e professores.", den: "Data and science literacy with real NASA data.",
    ind: "Turmas atendidas e evolução no diagnóstico antes/depois" },
  { code: "ODS 13", target: "13.1 e 13.3", pt: "Ação climática", en: "Climate action", Icon: Flame, tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
    dpt: "Tendências locais viram evidência auditável para conscientização.", den: "Local trends become auditable evidence for awareness.",
    ind: "Casos investigados e municípios analisados" },
  { code: "ODS 6", target: "6.4", pt: "Água potável e saneamento", en: "Clean water", Icon: Droplets, tone: "border-sky-200 bg-sky-50 text-sky-950",
    dpt: "Chuva, umidade do solo e evapotranspiração no Semiárido. Não mede potabilidade.", den: "Rain, soil wetness and evapotranspiration. Does not measure water quality.",
    ind: "Investigações hídricas com cobertura validada" },
  { code: "ODS 11", target: "11.b", pt: "Cidades sustentáveis", en: "Sustainable cities", Icon: Building2, tone: "border-amber-200 bg-amber-50 text-amber-950",
    dpt: "Trilha complementar: apoio a conversas de adaptação local, sem substituir a Defesa Civil.", den: "Complementary: supports local adaptation dialogue.",
    ind: "Dossiês territoriais exploratórios" },
  { code: "ODS 15", target: "15.3", pt: "Vida terrestre", en: "Life on land", Icon: Trees, tone: "border-lime-200 bg-lime-50 text-lime-950",
    dpt: "Umidade nas raízes e sinais associados à degradação do solo.", den: "Root-zone moisture and land-degradation signals.",
    ind: "Áreas com pistas de secura analisadas" },
  { code: "ODS 14", target: "14.1", pt: "Vida na água (próxima fase)", en: "Life below water (roadmap)", Icon: Waves, tone: "border-indigo-200 bg-indigo-50 text-indigo-950",
    dpt: "Próxima fase: clorofila-a costeira via MODIS-Aqua. Ainda não implementado.", den: "Roadmap: coastal chlorophyll-a. Not implemented yet.",
    ind: "Estudos costeiros documentados" },
];

export default function SdgPanel({ activeTargets, lang }: { activeTargets: string[]; lang: Lang }) {
  const [classroom, setClassroom] = useState(false);
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t("Metas da ONU ligadas às investigações", "UN SDG targets linked to investigations")}</h2>
          <p className="text-sm text-slate-600">{t("Destacadas: metas da pista que está selecionada na ficha.", "Highlighted: targets of the clue selected in the case file.")}</p>
        </div>
        <button type="button" onClick={() => setClassroom((v) => !v)} aria-pressed={classroom}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${classroom ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-slate-50 text-slate-700"}`}>
          {classroom ? t("Sair do Modo Aula", "Exit classroom mode") : t("Abrir Modo Aula", "Open classroom mode")}
        </button>
      </div>

      {classroom && (
        <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
          <p className="font-bold">{t("Pergunta diagnóstica (não coleta nenhum dado do estudante)", "Diagnostic question (collects no student data)")}</p>
          <p>{t("Se o ano passado foi o mais seco da década, isso já prova uma tendência?", "If last year was the driest of the decade, does that prove a trend?")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAnswer("no")} className={`rounded-lg border px-3 py-1.5 ${answer === "no" ? "border-emerald-600 bg-emerald-600 text-white" : "border-indigo-200 bg-white"}`}>
              {t("Não — um ano extremo pode ser oscilação", "No — one extreme year can be variability")}
            </button>
            <button type="button" onClick={() => setAnswer("yes")} className={`rounded-lg border px-3 py-1.5 ${answer === "yes" ? "border-amber-600 bg-amber-600 text-white" : "border-indigo-200 bg-white"}`}>
              {t("Sim — um ano atípico basta", "Yes — one unusual year is enough")}
            </button>
          </div>
          {answer === "no" && <p className="font-semibold text-emerald-800">{t("Isso. Para falar em tendência é preciso uma série longa e um teste estatístico — é o que o carimbo faz.", "Right. A trend needs a long series and a statistical test — that is what the stamp does.")}</p>}
          {answer === "yes" && <p className="font-semibold text-amber-800">{t("Cuidado: um ano extremo pode ser variação natural. Rode uma investigação e veja o carimbo.", "Careful: one extreme year can be natural variability. Run an investigation and check the stamp.")}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {SDG.map((s) => {
          const on = activeTargets.some((x) => s.target.includes(x));
          return (
            <div key={s.code} className={`rounded-xl border p-4 ${s.tone} ${on ? "ring-2 ring-[#12284a]" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{s.code} · {t("meta", "target")} {s.target}</span>
                <s.Icon className="h-4 w-4" aria-hidden />
              </div>
              <h3 className="mt-1 text-sm font-semibold">{t(s.pt, s.en)}</h3>
              <p className="mt-1 text-sm opacity-90">{t(s.dpt, s.den)}</p>
              <p className="mt-2 border-t border-black/10 pt-2 text-xs">{t("Indicador", "Indicator")}: {s.ind}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
