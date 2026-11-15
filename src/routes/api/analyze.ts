import { createFileRoute } from "@tanstack/react-router";
import { parseAnalyzeRequest, runAnalysis, ValidationError } from "@/lib/engine/analyze";

// Public JSON endpoint kept for existing callers of the original FastAPI /api/analyze. No private data.
export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => null);
          return Response.json(await runAnalysis(parseAnalyzeRequest(body)));
        } catch (e) {
          const status = e instanceof ValidationError ? 400 : 500;
          return Response.json({ detail: e instanceof Error ? e.message : String(e) }, { status });
        }
      },
    },
  },
});
