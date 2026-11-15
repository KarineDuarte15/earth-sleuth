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
  const key = import.meta.env['VITE_GOOGLE_MAPS_BROWSER_KEY'];
  if (!key) return Promise.reject(new Error("Google Maps is not available."));
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
      reject(new Error("Google Maps could not load. Check the connection and reload the page."));
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
      key, loading: "async", callback: "initEarthSleuthMap", v: "weekly", language: "en",
    });
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.onerror = fail;
    document.head.append(script);
  });
  return mapsReady;
}

// The pointer over the map is a small compass; the click lands on its centre.
const COMPASS_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'><circle cx='22' cy='22' r='19' fill='#fff' stroke='#1b1440' stroke-width='3.5'/><path d='M22 6 27 22H17z' fill='#ff6b98' stroke='#1b1440' stroke-width='2' stroke-linejoin='round'/><path d='M22 38 17 22h10z' fill='#1b1440'/><circle cx='22' cy='22' r='3' fill='#ffc93c' stroke='#1b1440' stroke-width='2'/></svg>`,
)}") 22 22, crosshair`;

// Comic-style map: flat sticker colours, bold country outlines, no roads or points of interest.
const INK = "#1b1440";
const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#bff3d9" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: INK }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 4 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#3fd4ff" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#0b5c7a" }] },
  { featureType: "landscape.natural.terrain", elementType: "geometry", stylers: [{ color: "#a6ecc9" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#ffe9b8" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: INK }, { weight: 1.8 }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: INK }, { weight: 0.6 }, { lightness: 35 }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "road", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const LATITUDES = [
  { lat: 66.56, name: "Círculo Polar Ártico", en: "Arctic Circle" },
  { lat: 23.44, name: "Trópico de Câncer", en: "Tropic of Cancer" },
  { lat: 0, name: "Equador", en: "Equator" },
  { lat: -23.44, name: "Trópico de Capricórnio", en: "Tropic of Capricorn" },
  { lat: -66.56, name: "Círculo Polar Antártico", en: "Antarctic Circle" },
];
interface Props {
  sceneA: ScenePoint;
  sceneB: ScenePoint | null;
  activeTarget: "A" | "B";
  latStep: number;
  lonStep: number;
  onSelectPoint: (target: "A" | "B", lat: number, lon: number) => void;
  lang?: "pt" | "en";
}

export default function MapSelector(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { latest.current = props; }, [props]);

  useEffect(() => {
    // Without a browser key (for example a fresh local checkout) show a notice instead of a broken map.
    // For local development, put your own referrer-restricted key in .env.local (see .env.example).
    if (!import.meta.env['VITE_GOOGLE_MAPS_BROWSER_KEY']) {
      setError("Google Maps needs a browser key. Use the coordinates or the shortcuts above.");
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
        clickableIcons: false, disableDefaultUI: true, gestureHandling: "cooperative",
        styles: MAP_STYLE, backgroundColor: "#3fd4ff", draggableCursor: COMPASS_CURSOR,
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
    const { sceneA, sceneB, latStep, lonStep, activeTarget, lang } = props;
    const focus = activeTarget === "B" && sceneB ? sceneB : sceneA;
    map.panTo({ lat: focus.latitude, lng: focus.longitude });
    const overlays: (google.maps.Marker | google.maps.Rectangle | google.maps.Polyline)[] = [];
    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue("--brand").trim();
    const secondary = styles.getPropertyValue("--orange").trim();
    for (const { lat, name: namePt, en } of LATITUDES) {
      const name = lang === "pt" ? namePt : en;
      overlays.push(new google.maps.Polyline({ map,
        path: [{ lat, lng: -179.99 }, { lat, lng: 0 }, { lat, lng: 179.99 }],
        strokeColor: INK, strokeOpacity: lat === 0 ? 0.7 : 0.35, strokeWeight: lat === 0 ? 2 : 1.2,
        clickable: false,
      }));
      overlays.push(new google.maps.Marker({ map, position: { lat, lng: -28 },
        title: name, clickable: false,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
        label: { text: name, color: INK, fontSize: "11px", fontWeight: "700" },
      }));
    }
    for (const [point, label, color] of [[sceneA, "A", primary], [sceneB, "B", secondary]] as const) {
      if (!point) continue;
      overlays.push(new google.maps.Rectangle({ map, bounds: {
        south: Math.max(-90, point.latitude - latStep / 2), north: Math.min(90, point.latitude + latStep / 2),
        west: point.longitude - lonStep / 2, east: point.longitude + lonStep / 2,
      }, strokeColor: INK, strokeWeight: 2.5, fillColor: color, fillOpacity: 0.35, clickable: false }));
      overlays.push(new google.maps.Marker({ map,
        position: { lat: point.latitude, lng: point.longitude }, title: `${lang === "pt" ? "Cena" : "Scene"} ${label}: ${point.region_name}`,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 16, fillColor: color, fillOpacity: 1, strokeColor: INK, strokeWeight: 3 },
        label: { text: label, color: "#ffffff", fontWeight: "800", fontSize: "15px" }, clickable: false,
      }));
    }
    // A radar ping keeps pulsing around the place being chosen.
    const ping = new google.maps.Circle({ map, center: { lat: focus.latitude, lng: focus.longitude }, radius: 0,
      strokeColor: INK, strokeWeight: 2.5, fillColor: activeTarget === "B" && sceneB ? secondary : primary, clickable: false });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const began = performance.now();
    let frame = 0;
    const pulse = (now: number) => {
      const k = ((now - began) % 1800) / 1800;
      ping.setRadius(60000 + k * 420000);
      ping.setOptions({ strokeOpacity: 0.9 * (1 - k), fillOpacity: 0.28 * (1 - k) });
      frame = requestAnimationFrame(pulse);
    };
    if (still) ping.setMap(null); else frame = requestAnimationFrame(pulse);
    return () => { cancelAnimationFrame(frame); ping.setMap(null); overlays.forEach((overlay) => overlay.setMap(null)); };
  }, [map, props.sceneA, props.sceneB, props.activeTarget, props.latStep, props.lonStep, props.lang]);

  const zoom = (d: number) => map?.setZoom(Math.max(2, (map.getZoom() ?? 4) + d));
  const pt = props.lang === "pt";
  const ctl = "btn-pop grid h-11 w-11 place-items-center rounded-full bg-[var(--panel)] font-serif text-2xl font-bold leading-none text-foreground";
  return (
    <div className="relative h-[330px] w-full overflow-hidden bg-[#3fd4ff]">
      <div ref={container} className="h-full w-full" aria-label="Google Maps: investigation locations" />
      {!map && <div className="absolute inset-0 flex items-center justify-center px-6 text-center font-bold text-[#1b1440]" role="status">{error ?? "Loading map…"}</div>}
      {map && (
        <>
          <p className="outline-ink pointer-events-none absolute left-3 top-3 -rotate-1 rounded-full bg-[var(--sun)] px-3.5 py-1.5 text-sm font-extrabold text-[var(--on-color)] shadow-[3px_3px_0_0_var(--pop)]">
            👆 {pt ? "Toque no mapa para marcar o lugar" : "Tap the map to mark the place"} {props.activeTarget}
          </p>
          <p className="outline-ink pointer-events-none absolute bottom-3 left-3 rounded-full bg-[var(--panel)] px-3 py-1 font-mono text-[11px] font-semibold text-foreground">
            {pt ? "cada quadrado de dado tem ~55 km" : "each data square is ~55 km"}
          </p>
          <svg key={`${props.activeTarget}${props.sceneA.latitude}${props.sceneA.longitude}${props.sceneB?.latitude}${props.sceneB?.longitude}`} aria-hidden viewBox="0 0 80 80" className="pointer-events-none absolute right-3 top-3 h-20 w-20 drop-shadow-[3px_3px_0_#1b1440]">
            <circle cx="40" cy="40" r="36" fill="#fff" stroke={INK} strokeWidth="4" />
            <circle cx="40" cy="40" r="27" fill="#ffe9b8" stroke={INK} strokeWidth="2" strokeDasharray="2 5" />
            {["N", "E", "S", "W"].map((d, i) => (
              <text key={d} x={40 + [0, 30, 0, -30][i]} y={44 + [-27, 0, 27, 0][i]} textAnchor="middle" fontSize="10" fontWeight="800" fill={INK}>{pt && d === "W" ? "O" : pt && d === "E" ? "L" : d}</text>
            ))}
            <g className="compass-needle">
              <path d="M40 16 46 40H34z" fill="#ff6b98" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
              <path d="M40 64 34 40h12z" fill={INK} />
              <circle cx="40" cy="40" r="4" fill="#ffc93c" stroke={INK} strokeWidth="2" />
            </g>
          </svg>
          <div className="absolute bottom-6 right-3 flex flex-col gap-2">
            <button type="button" onClick={() => zoom(1)} aria-label={pt ? "Aproximar" : "Zoom in"} className={ctl}>+</button>
            <button type="button" onClick={() => zoom(-1)} aria-label={pt ? "Afastar" : "Zoom out"} className={ctl}>−</button>
          </div>
        </>
      )}
    </div>
  );
}
