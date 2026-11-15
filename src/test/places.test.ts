import { describe, expect, it } from "vitest";
import { detailsInput, placeResult, searchInput } from "@/lib/places";

describe("Places lookup", () => {
  it("preserves address and coordinates anywhere in the world", () => {
    expect(placeResult({ id: "abc", formattedAddress: "Tokyo, Japan", location: { latitude: 35.6762, longitude: 139.6503 } })?.point).toEqual({ region_name: "Tokyo, Japan", latitude: 35.6762, longitude: 139.6503 });
  });
  it("rejects missing or out-of-range coordinates instead of using zero", () => {
    expect(placeResult({ id: "abc", formattedAddress: "Unknown" })).toBeNull();
    expect(placeResult({ id: "abc", formattedAddress: "Unknown", location: { latitude: 91, longitude: 0 } })).toBeNull();
  });
  it("bounds lookup input and never accepts an upstream URL as a place ID", () => {
    expect(detailsInput.safeParse({ placeId: "https://example.com/private" }).success).toBe(false);
    expect(searchInput.safeParse({ query: "x".repeat(201), sessionToken: "b0cf3eb7-0c5f-4cf4-a36d-2d5e2922dc6e", latitude: 0, longitude: 0 }).success).toBe(false);
  });
});