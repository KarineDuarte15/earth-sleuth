import { describe, expect, it } from "vitest";
import { photonPlace, placeResult, searchInput } from "@/lib/places";

describe("Places lookup", () => {
  it("preserves address and coordinates anywhere in the world", () => {
    expect(placeResult({ id: "abc", formattedAddress: "Tokyo, Japan", location: { latitude: 35.6762, longitude: 139.6503 } })?.point).toEqual({ region_name: "Tokyo, Japan", latitude: 35.6762, longitude: 139.6503 });
  });
  it("rejects missing or out-of-range coordinates instead of using zero", () => {
    expect(placeResult({ id: "abc", formattedAddress: "Unknown" })).toBeNull();
    expect(placeResult({ id: "abc", formattedAddress: "Unknown", location: { latitude: 91, longitude: 0 } })).toBeNull();
  });
  it("bounds lookup input", () => {
    expect(searchInput.safeParse({ query: "x".repeat(201), latitude: 0, longitude: 0 }).success).toBe(false);
    expect(searchInput.safeParse({ query: "Fortaleza", latitude: 0, longitude: 181 }).success).toBe(false);
  });
  it("reads a geocoder feature as longitude, latitude and builds a label without repeats", () => {
    expect(photonPlace({ geometry: { coordinates: [-38.5267, -3.7319] }, properties: { osm_type: "R", osm_id: 302635, name: "Fortaleza", city: "Fortaleza", state: "Ceará", country: "Brasil" } }))
      .toEqual({ id: "R302635", label: "Fortaleza, Ceará, Brasil", point: { region_name: "Fortaleza, Ceará, Brasil", latitude: -3.7319, longitude: -38.5267 } });
    expect(photonPlace({ properties: { osm_type: "N", osm_id: 1, name: "Nowhere" } })).toBeNull();
  });
});
