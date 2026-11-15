<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Earth Sleuths
- The statistics engine lives in `src/lib/engine/` (TypeScript port of the original Python engine) and runs server-side only; keep `src/test/stats-engine.test.ts` passing so results stay identical to the Python reference fixture.
- Public JSON endpoints `/api/health`, `/api/catalog`, `/api/analyze` are kept for external callers; the UI calls the `analyzeInvestigation` server function instead.
- `react-is` is pinned to the React version via `overrides`: recharts 2 draws no lines otherwise.
- tsconfig relaxes `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` to fit the imported code.

- Uploaded brand imagery is served through Lovable Assets pointers; the favicon is a resized local copy so browsers can load it directly.
- Use the plain/content Button variant for migrated controls that retain bespoke layouts, keeping shared control behavior without imposing fixed dimensions.

- The investigation map uses Google Maps JavaScript with a callback-based async loader and public connector key; preserve point selection and grid overlays without browser Places calls or an unconfigured map ID.
- Address lookup uses authenticated Places API (New) server functions with bounded results and client-debounced, session-token suggestions; never expose a public Maps proxy, and apply selected coordinates and labels only to the active scene.
- Comparison PDFs are generated from completed investigation results in the browser, preserving actual provenance and date-aligned monthly data; prepare the Blob before offering a synchronous download for mobile compatibility.
- Supplied interactive proposals are served unchanged through asset pointers with top-level view and same-origin download links to preserve PDF annotations.
- AI comparison synthesis uses an authenticated AI Gateway server function with validated completed A/B evidence and structured output; it never changes statistics, fetches invented evidence, or automatically replays a failed inference.
