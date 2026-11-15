import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PlaceSearch from "@/components/PlaceSearch";

const focus = { region_name: "Start", latitude: 0, longitude: 0 };
const feature = { geometry: { coordinates: [-38.5218, -3.7305] }, properties: { osm_type: "R", osm_id: 302635, name: "Fortaleza", state: "Ceará", country: "Brasil" } };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PlaceSearch", () => {
  it("searches without a sign-in and applies the chosen place to the active scene", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ features: [feature] })));
    vi.stubGlobal("fetch", fetchMock);
    const onSelect = vi.fn();
    render(<PlaceSearch target="B" focus={focus} onSelect={onSelect} />);

    const input = screen.getByRole("combobox");
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "Fortaleza" } });
    fireEvent.click(await screen.findByRole("option", { name: /Fortaleza, Ceará, Brasil/ }, { timeout: 3000 }));

    expect(String(fetchMock.mock.calls[0][0])).toContain("q=Fortaleza");
    expect(onSelect).toHaveBeenCalledWith("B", { region_name: "Fortaleza, Ceará, Brasil", latitude: -3.7305, longitude: -38.5218 });
    expect(screen.queryByRole("option")).toBeNull();
  });
});
