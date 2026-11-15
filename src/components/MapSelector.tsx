"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Rectangle, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ScenePoint } from "@/types/sleuth";

const pin = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
const PIN_A = pin("#1a9bc7");
const PIN_B = pin("#f07c22");

function ClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClick(Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4))) });
  return null;
}

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([lat, lon], { animate: true });
  }, [lat, lon, map]);
  return null;
}

const cell = (p: ScenePoint, dLat: number, dLon: number): [[number, number], [number, number]] => [
  [p.latitude - dLat / 2, p.longitude - dLon / 2],
  [p.latitude + dLat / 2, p.longitude + dLon / 2],
];

interface Props {
  sceneA: ScenePoint;
  sceneB: ScenePoint | null;
  activeTarget: "A" | "B";
  latStep: number;
  lonStep: number;
  onSelectPoint: (target: "A" | "B", lat: number, lon: number) => void;
}

export default function MapSelector({ sceneA, sceneB, activeTarget, latStep, lonStep, onSelectPoint }: Props) {
  const focus = activeTarget === "B" && sceneB ? sceneB : sceneA;
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
    </div>
  );
}
