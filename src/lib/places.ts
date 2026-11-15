import { z } from "zod";
import type { ScenePoint } from "@/types/sleuth";

export const searchInput = z.object({
  query: z.string().trim().min(3).max(200),
  sessionToken: z.string().uuid(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export const detailsInput = z.object({ placeId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/), sessionToken: z.string().uuid().optional() });
export interface PlaceResult { id: string; label: string; point: ScenePoint; }
export function placeResult(place: { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }): PlaceResult | null {
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (!place.id || typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const label = place.formattedAddress || place.displayName?.text;
  if (!label) return null;
  return { id: place.id, label, point: { region_name: label, latitude, longitude } };
}