## Earth Sleuths
- The statistics engine lives in `src/lib/engine/` (TypeScript port of the original Python engine) and runs server-side only; keep `src/test/stats-engine.test.ts` passing so results stay identical to the Python reference fixture.
- Public JSON endpoints `/api/health`, `/api/catalog`, `/api/analyze` are kept for external callers; the UI calls the `analyzeInvestigation` server function instead.
- `react-is` is pinned to the React version via `overrides`: recharts 2 draws no lines otherwise.
- tsconfig relaxes `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` to fit the imported code.

- The app has no Lovable, Supabase, database or sign-in. `vite.config.ts` wires TanStack Start, Nitro (build only), React and Tailwind directly; `npm run build` writes a Node server to `.output/` and `npm start` runs it.
- Brand imagery, the proposal PDFs (`public/docs/`) and the PDF report font (`public/fonts/report-unicode.ttf`) are plain files under `public/`.
- Use the plain/content Button variant for migrated controls that retain bespoke layouts, keeping shared control behavior without imposing fixed dimensions.

- The place step uses a 3D globe (`src/components/GlobeSelector.tsx`, three.js loaded on demand). Its texture is painted at runtime from `public/brand/world-50m.json` (Natural Earth 1:50m country outlines, public domain). It needs no API key. `MapSelector.tsx` (Google Maps) is only the fallback when WebGL is unavailable.
- The guided tutorial lives in `EarthSleuthsApp.tsx` (`picking` and `demo` state). Stopping it restores the case file from a snapshot; do not put `data-reveal` on an element whose `className` React rewrites, or it turns invisible after a re-render.
- The fallback map uses Google Maps JavaScript with a callback-based async loader and the optional VITE_GOOGLE_MAPS_BROWSER_KEY; preserve point selection and grid overlays without browser Places calls or an unconfigured map ID.
- Address lookup (src/lib/places.ts) calls the keyless Photon geocoder (OpenStreetMap data) from the browser with bounded, client-debounced queries; apply selected coordinates and labels only to the active scene.
- Comparison PDFs are generated from completed investigation results in the browser, preserving actual provenance and date-aligned monthly data; prepare the Blob before offering a synchronous download for mobile compatibility.
- Supplied interactive proposals are served unchanged from public/docs/ with top-level view and same-origin download links to preserve PDF annotations.
- AI comparison synthesis is off unless VITE_AI_SYNTHESIS=on; its server function calls an OpenAI-compatible endpoint (AI_BASE_URL, AI_API_KEY, AI_MODEL) with validated completed A/B evidence and JSON output. It has no sign-in in front of it, so anyone who can open the app can spend that key. It never changes statistics, fetches invented evidence, or automatically replays a failed inference.
