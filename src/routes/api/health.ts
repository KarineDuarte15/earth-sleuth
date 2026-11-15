import { createFileRoute } from "@tanstack/react-router";
import { healthPayload } from "@/lib/engine/analyze";

export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: async () => Response.json(healthPayload()) } },
});
