import { Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import pt from "@/assets/proposal-pt.pdf.asset.json";
import en from "@/assets/proposal-en.pdf.asset.json";
import type { Lang } from "@/types/sleuth";

export default function ProposalDocuments({ lang }: { lang: Lang }) {
  return <section id="documentos" aria-labelledby="documents-title" className="scroll-mt-24 border-y border-border py-8">
    <h2 id="documents-title" className="mb-5 text-2xl font-bold text-deep-blue">{lang === "pt" ? "Documentos do projeto" : "Project documents"}</h2>
    <div className="grid gap-6 sm:grid-cols-2">
      {[{ asset: pt, language: "Português", title: "Proposta estratégica", file: "earth-sleuth-proposta-pt.pdf" }, { asset: en, language: "English", title: "Strategic proposal", file: "earth-sleuth-proposal-en.pdf" }].map(d => <article key={d.language} className="min-w-0 border-l-4 border-electric-blue pl-4">
        <p className="text-sm font-semibold text-primary">{d.language} · PDF</p>
        <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold"><FileText className="h-5 w-5 text-primary" />{d.title}</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href={d.asset.url} target="_blank" rel="noopener noreferrer"><ExternalLink />{lang === "pt" ? "Abrir PDF" : "Open PDF"}</a></Button>
          <Button asChild><a href={d.asset.url} download={d.file}><Download />{lang === "pt" ? "Baixar" : "Download"}</a></Button>
        </div>
      </article>)}
    </div>
  </section>;
}