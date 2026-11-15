import { createFileRoute } from "@tanstack/react-router";
import EarthSleuthsApp from "@/components/EarthSleuthsApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Earth Sleuth — investigue o planeta com evidência" },
      { name: "description", content: "Investigação de tendências climáticas com dados abertos da NASA POWER, Seasonal Mann-Kendall, inclinação de Sen e carimbo estatístico auditável." },
      { property: "og:title", content: "Earth Sleuth — investigue o planeta com evidência" },
      { property: "og:description", content: "Tendências climáticas com dados da NASA POWER e evidência estatística auditável." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EarthSleuthsApp,
});
