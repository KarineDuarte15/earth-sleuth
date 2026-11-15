/**
 * NASA POWER monthly point client + bundled cache (port of api/_lib/nasa_power.py).
 * Modes: "live" (API only), "cache" (bundled demo_cases.json only), "auto" (live, cache on failure).
 */
import { CLUE_CATALOG } from "./catalog";
import type { MonthlyRecord } from "./stats";
import demoCases from "@/data/demo_cases.json";

const NASA_POWER_MONTHLY_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point";
const LIVE_TIMEOUT_MS = 7500;
export const LAST_COMPLETE_YEAR = 2025;
const UNIT_LABELS: Record<string, string> = { C: "°C", "mm/day": "mm/dia", "1": "fração 0–1" };

export const prettyUnit = (raw: string | null | undefined, fallback: string) => (raw ? UNIT_LABELS[raw] ?? raw : fallback);

/* eslint-disable @typescript-eslint/no-explicit-any */
type Payload = any;
export interface Fetched {
  records: MonthlyRecord[]; units_raw?: string | null; longname?: string | null; request_url?: string | null;
  extracted_at?: string | null; dataset_version?: string | null; cached_location?: string | null;
  data_mode?: "live" | "cache" | "fallback_cache"; fallback_triggered?: boolean; fallback_reason?: string | null;
}
export type FetchResult = Fetched | { error: string };

export function parsePowerJson(payload: Payload, pid: string): MonthlyRecord[] {
  const fill = Number(payload?.header?.fill_value ?? -999);
  const raw: Record<string, number | null> = payload.properties.parameter[pid];
  return Object.keys(raw).sort().flatMap((ym) => {
    if (!/^\d{6}$/.test(ym)) return [];
    const yr = Number(ym.slice(0, 4)), mo = Number(ym.slice(4));
    if (mo < 1 || mo > 12) return [];
    const val = raw[ym];
    const bad = val === null || val === undefined || Number(val) === fill || Number(val) <= -900;
    return [{ date: `${String(yr).padStart(4, "0")}-${String(mo).padStart(2, "0")}`, year: yr, month: mo, value: bad ? null : Number(val) }];
  });
}

function findCached(pid: string, lat: number, lon: number): Fetched | null {
  const locs = Object.values(((demoCases as Payload).locations ?? {}) as Record<string, Payload>);
  let best: Payload = null, bestD = 1e9;
  for (const loc of locs) {
    if (!loc.parameters?.[pid]) continue;
    const d = Math.max(Math.abs(loc.latitude - lat), Math.abs(loc.longitude - lon));
    if (d <= 0.35 && d < bestD) { best = loc; bestD = d; }
  }
  if (!best) return null;
  const p = best.parameters[pid];
  return {
    records: p.records, units_raw: p.units_raw, longname: p.longname,
    request_url: p.request_url ?? "local://demo_cases.json", extracted_at: best.extracted_at,
    dataset_version: best.dataset_version ?? "NASA POWER (cache)", cached_location: best.region_name,
  };
}

class HttpStatusError extends Error {}

async function callPower(params: string[], community: string, lat: number, lon: number, start: number, end: number) {
  const url = new URL(NASA_POWER_MONTHLY_URL);
  url.search = new URLSearchParams({
    parameters: params.join(","), community, longitude: String(Math.round(lon * 1e4) / 1e4),
    latitude: String(Math.round(lat * 1e4) / 1e4), start: String(start), end: String(end), format: "JSON",
  }).toString();
  const resp = await fetch(url, { signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) });
  if (!resp.ok) throw new HttpStatusError(`HTTPStatusError: ${resp.status}`);
  return { payload: (await resp.json()) as Payload, url: url.toString() };
}

const pack = (payload: Payload, pid: string, url: string): Fetched => {
  const meta = payload?.parameters?.[pid] ?? {};
  return {
    records: parsePowerJson(payload, pid), units_raw: meta.units ?? null, longname: meta.longname ?? null,
    request_url: url, extracted_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    dataset_version: String(payload?.header?.api?.version ?? "NASA POWER API"),
  };
};
const errText = (e: unknown) => (e instanceof Error ? `${e.name === "Error" ? "" : e.name + ": "}${e.message}` : String(e));

async function fetchLive(pids: string[], lat: number, lon: number, startYear: number, endYear: number) {
  const groups = new Map<string, { community: string; start: number; pids: string[] }>();
  for (const pid of pids) {
    const spec = CLUE_CATALOG[pid];
    const start = Math.max(spec.min_year, startYear);
    const key = `${spec.communities[0]}|${start}`;
    if (!groups.has(key)) groups.set(key, { community: spec.communities[0], start, pids: [] });
    groups.get(key)!.pids.push(pid);
  }
  const results: Record<string, FetchResult> = {};
  const errors: Record<string, string> = {};
  const end = Math.min(LAST_COMPLETE_YEAR, endYear);
  for (const { community, start, pids: gp } of groups.values()) {
    let todo: string[] = [];
    try {
      const { payload, url } = await callPower(gp, community, lat, lon, start, end);
      for (const pid of gp) {
        if (payload?.properties?.parameter?.[pid]) results[pid] = pack(payload, pid, url);
        else todo.push(pid);
      }
    } catch (e) {
      if (e instanceof HttpStatusError) todo = [...gp];
      else { for (const pid of gp) errors[pid] = errText(e); continue; }
    }
    for (const pid of todo) {
      for (const comm of CLUE_CATALOG[pid].communities.slice(1)) {
        try {
          const { payload, url } = await callPower([pid], comm, lat, lon, start, end);
          results[pid] = pack(payload, pid, url);
          break;
        } catch (e) { errors[pid] = errText(e); }
      }
    }
  }
  for (const pid of pids) if (!results[pid]) results[pid] = { error: errors[pid] ?? "parâmetro não retornado pela API" };
  return results;
}

export async function fetchScene(pids: string[], lat: number, lon: number, startYear: number, endYear: number, mode: string) {
  const fromCache = (pid: string, reason: string | null): FetchResult => {
    const c = findCached(pid, lat, lon);
    if (!c) return { error: `${pid}: sem dados em cache para este local${reason ? ` e a API falhou (${reason})` : ""}. Use o modo ao vivo.` };
    const start = Math.max(CLUE_CATALOG[pid].min_year, startYear), end = Math.min(LAST_COMPLETE_YEAR, endYear);
    return { ...c, records: c.records.filter((r) => r.year >= start && r.year <= end), data_mode: reason === null ? "cache" : "fallback_cache", fallback_triggered: reason !== null, fallback_reason: reason };
  };
  if (mode === "cache") return Object.fromEntries(pids.map((p) => [p, fromCache(p, null)]));
  const live = await fetchLive(pids, lat, lon, startYear, endYear);
  const out: Record<string, FetchResult> = {};
  for (const [pid, res] of Object.entries(live)) {
    if (!("error" in res)) out[pid] = { ...res, data_mode: "live", fallback_triggered: false };
    else if (mode === "auto") out[pid] = fromCache(pid, res.error);
    else out[pid] = { error: `${pid}: NASA POWER indisponível (${res.error})` };
  }
  return out;
}
