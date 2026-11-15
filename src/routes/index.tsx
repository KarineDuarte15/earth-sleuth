import { createFileRoute } from "@tanstack/react-router";
import EarthSleuthsApp from "@/components/EarthSleuthsApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Earth Sleuth: investigate the planet with evidence" },
      { name: "description", content: "Investigate climate trends with open NASA POWER data, the Seasonal Mann-Kendall test, Sen's slope and an auditable statistical verdict." },
      { property: "og:title", content: "Earth Sleuth: investigate the planet with evidence" },
      { property: "og:description", content: "Climate trends with NASA POWER data and auditable statistical evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EarthSleuthsApp,
});
