import { createServerFn } from "@tanstack/react-start";
import { parseAnalyzeRequest, runAnalysis } from "./engine/analyze";
import type { InvestigationResponse } from "@/types/sleuth";

export const analyzeInvestigation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseAnalyzeRequest(data))
  .handler(async ({ data }) => (await runAnalysis(data)) as unknown as InvestigationResponse);
