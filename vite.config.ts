import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => {
  // Vite only exposes VITE_* to the browser. Server code (server functions, API routes) reads
  // process.env, so copy the rest of .env there for `vite dev` without overriding real env vars.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    process.env[key] ??= value;
  }

  return {
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      // src/server.ts wraps the TanStack Start server entry with the SSR error page.
      tanstackStart({ server: { entry: "server" } }),
      // Nitro packages the production server into .output/ (Node by default; it auto-detects
      // Vercel, Netlify and Cloudflare, or set NITRO_PRESET).
      ...(command === "build" ? [nitro()] : []),
      viteReact(),
    ],
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
