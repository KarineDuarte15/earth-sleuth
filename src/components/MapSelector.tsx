/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import type { ScenePoint } from "@/types/sleuth";

declare global {
  interface Window { initEarthSleuthMap?: () => void; }
}

let mapsReady: Promise<void> | undefined;
function loadMaps(): Promise<void> {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (mapsReady) return mapsReady;
  const key = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'];
  if (!key) return Promise.reject(new Error("A conexão com o Google Maps não está disponível."));
  mapsReady = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.remove();
      delete window.initEarthSleuthMap;
      mapsReady = undefined;
      reject(new Error("Não foi possível carregar o Google Maps. Confira a conexão e tente recarregar a página."));
    };
    const timeout = window.setTimeout(fail, 20000);
    window.initEarthSleuthMap = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      delete window.initEarthSleuthMap;
      resolve();
    };
    const params = new URLSearchParams({
      key, loading: "async", callback: "initEarthSleuthMap", v: "weekly", language: "pt-BR", region: "BR",
      channel: import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID'] ?? "",
    });
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.onerror = fail;
    document.head.append(script);
  });
  return mapsReady;
}

const LATITUDES = [
  { lat: 66.56, name: "Círculo Polar Ártico" },
  { lat: 23.44, name: "Trópico de Câncer" },
  { lat: 0, name: "Equador" },
  { lat: -23.44, name: "Trópico de Capricórnio" },
  { lat: -66.56, name: "Círculo Polar Antártico" },
];
interface Props {
  sceneA: ScenePoint;
  sceneB: ScenePoint | null;
  activeTarget: "A" | "B";
  latStep: number;
  lonStep: number;
  onSelectPoint: (target: "A" | "B", lat: number, lon: number) => void;
}

export default function MapSelector(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { latest.current = props; }, [props]);

  useEffect(() => {
    // Referrer-restricted Maps cannot be validated in the agent sandbox.
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      setError("Google Maps disponível no endereço publicado do aplicativo.");
      return;
    }
    let disposed = false;
    let instance: google.maps.Map | undefined;
    const listeners: google.maps.MapsEventListener[] = [];
    loadMaps().then(() => {
      if (disposed || !container.current) return;
      const p = latest.current;
      const focus = p.activeTarget === "B" && p.sceneB ? p.sceneB : p.sceneA;
      instance = new google.maps.Map(container.current, {
        center: { lat: focus.latitude, lng: focus.longitude }, zoom: 4, minZoom: 2,
        clickableIcons: false, streetViewControl: false, mapTypeControl: true,
        fullscreenControl: true, gestureHandling: "cooperative",
      });
      listeners.push(instance.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (!event.latLng) return;
        latest.current.onSelectPoint(latest.current.activeTarget,
          Number(event.latLng.lat().toFixed(4)), Number(event.latLng.lng().toFixed(4)));
      }));
      setMap(instance);
    }).catch((e: unknown) => {
      if (!disposed) setError(e instanceof Error ? e.message : "Google Maps indisponível.");
    });
    return () => {
      disposed = true;
      listeners.forEach((l) => l.remove());
      if (instance) google.maps.event.clearInstanceListeners(instance);
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    const { sceneA, sceneB, latStep, lonStep, activeTarget } = props;
    const focus = activeTarget === "B" && sceneB ? sceneB : sceneA;
    map.panTo({ lat: focus.latitude, lng: focus.longitude });
    const overlays: (google.maps.Marker | google.maps.Rectangle | google.maps.Polyline)[] = [];
    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue("--brand").trim();
    const secondary = styles.getPropertyValue("--orange").trim();
    const muted = styles.getPropertyValue("--muted").trim();
    const white = styles.getPropertyValue("--primary-foreground").trim();
    for (const { lat, name } of LATITUDES) {
      overlays.push(new google.maps.Polyline({ map,
        path: [{ lat, lng: -179.99 }, { lat, lng: 0 }, { lat, lng: 179.99 }],
        strokeColor: lat === 0 ? primary : muted, strokeOpacity: 0.45, strokeWeight: 1,
        clickable: false,
      }));
      overlays.push(new google.maps.Marker({ map, position: { lat, lng: -28 },
        title: name, clickable: false,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
        label: { text: name, color: muted, fontSize: "10px" },
      }));
    }
    for (const [point, label, color] of [[sceneA, "A", primary], [sceneB, "B", secondary]] as const) {
      if (!point) continue;
      overlays.push(new google.maps.Rectangle({ map, bounds: {
        south: Math.max(-90, point.latitude - latStep / 2), north: Math.min(90, point.latitude + latStep / 2),
        west: point.longitude - lonStep / 2, east: point.longitude + lonStep / 2,
      }, strokeColor: color, strokeWeight: 2, fillColor: color, fillOpacity: 0.18, clickable: false }));
      overlays.push(new google.maps.Marker({ map,
        position: { lat: point.latitude, lng: point.longitude }, title: `Cena ${label}: ${point.region_name}`,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: color, fillOpacity: 1, strokeColor: white, strokeWeight: 3 },
        label: { text: label, color: white, fontWeight: "700" }, clickable: false,
      }));
    }
    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [map, props.sceneA, props.sceneB, props.activeTarget, props.latStep, props.lonStep]);

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-inner">
      <MapContainer center={[focus.latitude, focus.longitude]} zoom={4} scrollWheelZoom className="h-full w-full z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onClick={(lat, lon) => onSelectPoint(activeTarget, lat, lon)} />
        <Recenter lat={focus.latitude} lon={focus.longitude} />
        <Rectangle bounds={cell(sceneA, latStep, lonStep)} pathOptions={{ color: "#1a9bc7", weight: 2, fillOpacity: 0.18 }} />
        <Marker position={[sceneA.latitude, sceneA.longitude]} icon={PIN_A}>
          <Popup>Cena A: {sceneA.region_name}</Popup>
        </Marker>
        {sceneB && (
          <>
            <Rectangle bounds={cell(sceneB, latStep, lonStep)} pathOptions={{ color: "#f07c22", weight: 2, fillOpacity: 0.18 }} />
            <Marker position={[sceneB.latitude, sceneB.longitude]} icon={PIN_B}>
              <Popup>Cena B: {sceneB.region_name}</Popup>
            </Marker>
          </>
        )}
      </MapContainer>
      <p className="absolute bottom-2 left-2 right-2 z-[400] rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs text-slate-700 sm:right-auto">
        O retângulo é a célula real do dado ({latStep}° × {lonStep}°), não um bairro. Clique no mapa para mover a Cena {activeTarget}.
      </p>
    <div className="relative h-[380px] w-full overflow-hidden rounded-lg border border-border bg-secondary">
      <div ref={container} className="h-full w-full" aria-label="Google Maps — locais da investigação" />
      {!map && <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground" role="status">{error ?? "Carregando Google Maps…"}</div>}
      {map && <p className="pointer-events-none absolute left-3 right-16 top-14 rounded-md bg-background/95 px-3 py-1.5 text-xs text-foreground">
        Cena <strong className={props.activeTarget === "A" ? "text-primary" : "text-scene-b"}>{props.activeTarget}</strong>
        <span className="text-muted-foreground"> · célula do dado {props.latStep}° × {props.lonStep}°</span>
      </p>}
    </div>
  );
}
