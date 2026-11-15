import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detailsInput, searchInput } from "./places";

export const suggestPlaces = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchInput.parse(input)).handler(async ({ data }) => {
    const { mapsRequest } = await import("./places.server");
    const result = await mapsRequest("/places/v1/places:autocomplete", "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text", {
      input: data.query, sessionToken: data.sessionToken, languageCode: "pt-BR",
      locationBias: { circle: { center: { latitude: data.latitude, longitude: data.longitude }, radius: 50000 } },
    });
    const suggestions: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }> = result.suggestions ?? [];
    return suggestions.flatMap(({ placePrediction: p }) => p?.placeId && p.text?.text ? [{ id: p.placeId, label: p.text.text }] : []).slice(0, 5);
  });

export const searchPlaces = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchInput.parse(input)).handler(async ({ data }) => {
    const { mapsRequest, placeResult } = await import("./places.server");
    const result = await mapsRequest("/places/v1/places:searchText", "places.id,places.displayName,places.formattedAddress,places.location", {
      textQuery: data.query, pageSize: 5, languageCode: "pt-BR",
      locationBias: { circle: { center: { latitude: data.latitude, longitude: data.longitude }, radius: 50000 } },
    });
    return (result.places ?? []).slice(0, 5).flatMap((p: Parameters<typeof placeResult>[0]) => { const place = placeResult(p); return place ? [place] : []; });
  });

export const selectPlace = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => detailsInput.parse(input)).handler(async ({ data }) => {
    const { mapsRequest, placeResult } = await import("./places.server");
    const result = placeResult(await mapsRequest(`/places/v1/places/${encodeURIComponent(data.placeId)}${data.sessionToken ? `?sessionToken=${encodeURIComponent(data.sessionToken)}` : ""}`, "id,displayName,formattedAddress,location"));
    if (!result) throw new Error("Este local não tem coordenadas disponíveis. Escolha outro resultado.");
    return result;
  });