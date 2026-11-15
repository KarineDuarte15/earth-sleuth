import { z } from "zod";
import type { ScenePoint } from "@/types/sleuth";

export const searchInput = z.object({
  query: z.string().trim().min(3).max(200),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export interface PlaceResult { id: string; label: string; point: ScenePoint; }
export function placeResult(place: { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }): PlaceResult | null {
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (!place.id || typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const label = place.formattedAddress || place.displayName?.text;
  if (!label) return null;
  return { id: place.id, label, point: { region_name: label, latitude, longitude } };
}

// Address lookup uses Photon (https://photon.komoot.io), the open search-as-you-type geocoder
// built on OpenStreetMap data. It needs no key or account and is called straight from the browser.
const PHOTON_URL = "https://photon.komoot.io/api/";
interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { osm_type?: string; osm_id?: number; name?: string; street?: string; housenumber?: string; district?: string; city?: string; county?: string; state?: string; country?: string };
}
export function photonPlace(feature: PhotonFeature): PlaceResult | null {
  const p = feature.properties ?? {};
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  const street = [p.street, p.housenumber].filter(Boolean).join(", ");
  const parts = [p.name, street, p.district, p.city, p.county, p.state, p.country].filter((part): part is string => !!part);
  return placeResult({
    id: p.osm_type && p.osm_id != null ? `${p.osm_type}${p.osm_id}` : undefined,
    formattedAddress: parts.filter((part, i) => parts.indexOf(part) === i).join(", "),
    location: { latitude, longitude },
  });
}
export async function findPlaces(input: z.input<typeof searchInput>, signal?: AbortSignal): Promise<PlaceResult[]> {
  const { query, latitude, longitude } = searchInput.parse(input);
  const params = new URLSearchParams({ q: query, limit: "5", lat: String(latitude), lon: String(longitude) });
  const response = await fetch(`${PHOTON_URL}?${params}`, { signal: signal ?? AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`A busca de locais não respondeu (${response.status}). Tente de novo em instantes.`);
  const features: PhotonFeature[] = (await response.json()).features ?? [];
  const places = features.flatMap(feature => { const place = photonPlace(feature); return place ? [place] : []; });
  return places.filter((place, i) => places.findIndex(other => other.id === place.id) === i).slice(0, 5);
}
