import { createFileRoute } from "@tanstack/react-router";
import { catalogPayload } from "@/lib/engine/analyze";

export const Route = createFileRoute("/api/catalog")({
  server: { handlers: { GET: async () => Response.json(catalogPayload()) } },
});
