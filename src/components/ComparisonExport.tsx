import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canExportComparison } from "@/lib/comparison-report";
import { deliverFile } from "@/lib/download";
import type { InvestigationResponse, Lang } from "@/types/sleuth";

export default function ComparisonExport({ result, lang }: { result: InvestigationResponse; lang: Lang }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setBlob(null); setError(""); }, [result, lang]);
  if (!canExportComparison(result)) return null;
  return <div className="space-y-2">
    <Button variant="outline" disabled={busy} onClick={async () => {
      setError("");
      if (blob) { await deliverFile(blob, `earth-sleuth-${result.case_id.replace(/[^a-z0-9_-]/gi, "-")}-${lang}.pdf`); return; }
      setBusy(true);
      try { const { createComparisonPdf } = await import("@/lib/comparison-pdf"); setBlob(await createComparisonPdf(result, lang)); }
      catch (e) { setError(e instanceof Error ? e.message : "Falha ao gerar PDF."); }
      finally { setBusy(false); }
    }}>{busy ? <Loader2 className="animate-spin" /> : blob ? <Download /> : <FileText />}{lang === "pt" ? busy ? "Preparando relatório…" : blob ? "Baixar relatório PDF" : "Exportar comparação em PDF" : busy ? "Preparing report…" : blob ? "Download PDF report" : "Export comparison to PDF"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}