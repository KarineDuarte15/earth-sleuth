"""
Baixa séries mensais REAIS da NASA POWER para os locais de demonstração, grava o cache
em api/_lib/data/demo_cases.json e imprime o resultado estatístico de cada pista em
cada local — para escolher o par do modo "Duas Cenas" com base em dados reais
(regra da proposta: só mostrar tendências opostas se os dados confirmarem).

Uso (Python instalado no PC, sem venv):
    python scripts/fetch_nasa_cases.py
"""
from __future__ import annotations

import itertools
import json
import pathlib
import sys
import time
from datetime import datetime, timezone

import httpx

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from _lib.catalog import CLUE_CATALOG  # noqa: E402
from _lib.nasa_power import (  # noqa: E402
    CACHE_FILE, LAST_COMPLETE_YEAR, NASA_POWER_MONTHLY_URL, param_meta, parse_power_json, pretty_unit,
)
from _lib.stats_engine import analyze_monthly_series  # noqa: E402

LOCATIONS = {
    "quixeramobim_ce": ("Quixeramobim / Sertão Central (CE)", -5.198, -39.295),
    "fortaleza_ce": ("Fortaleza (CE)", -3.7319, -38.5267),
    "petrolina_pe": ("Petrolina / Vale do São Francisco (PE)", -9.3891, -40.5027),
    "manaus_am": ("Manaus / Amazônia Central (AM)", -3.119, -60.0217),
    "foz_iguacu_pr": ("Foz do Iguaçu / Oeste do Paraná (PR)", -25.5469, -54.5882),
    "pelotas_rs": ("Pelotas / Costa Sul (RS)", -31.765, -52.337),
}


def fetch(client: httpx.Client, params: list[str], community: str, lat: float, lon: float, start: int):
    for attempt in range(3):
        try:
            r = client.get(NASA_POWER_MONTHLY_URL, params={
                "parameters": ",".join(params), "community": community,
                "longitude": lon, "latitude": lat,
                "start": str(start), "end": str(LAST_COMPLETE_YEAR), "format": "JSON",
            })
            r.raise_for_status()
            return r.json(), str(r.url)
        except httpx.HTTPStatusError:
            raise
        except Exception as exc:
            print(f"   tentativa {attempt + 1} falhou: {exc}")
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("NASA POWER não respondeu após 3 tentativas")


def main() -> None:
    groups: dict[tuple[str, int], list[str]] = {}
    for pid, spec in CLUE_CATALOG.items():
        groups.setdefault((spec["communities"][0], spec["min_year"]), []).append(pid)

    cache = {"version": 2, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "locations": {}}
    summary: dict[str, dict[str, dict]] = {}

    with httpx.Client(timeout=60.0) as client:
        for key, (name, lat, lon) in LOCATIONS.items():
            print(f"\n>> {name} ({lat}, {lon})")
            loc = {"region_name": name, "latitude": lat, "longitude": lon,
                   "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "dataset_version": None, "parameters": {}}
            for (community, start), pids in groups.items():
                pending = list(pids)
                for comm in [community] + [c for c in ("AG", "SB", "RE") if c != community]:
                    if not pending:
                        break
                    try:
                        payload, url = fetch(client, pending, comm, lat, lon, start)
                    except httpx.HTTPStatusError as exc:
                        print(f"   {','.join(pending)} em {comm}: HTTP {exc.response.status_code}")
                        continue
                    loc["dataset_version"] = str(payload.get("header", {}).get("api", {}).get("version", "NASA POWER"))
                    got = payload.get("properties", {}).get("parameter", {})
                    for pid in list(pending):
                        if pid in got:
                            meta = param_meta(payload, pid)
                            loc["parameters"][pid] = {**meta, "community": comm, "request_url": url,
                                                      "records": parse_power_json(payload, pid)}
                            pending.remove(pid)
                    time.sleep(1)  # gentileza com o servidor
                for pid in pending:
                    print(f"   AVISO: {pid} não disponível em nenhuma comunidade")
            cache["locations"][key] = loc

            summary[key] = {}
            for pid, p in loc["parameters"].items():
                unit = pretty_unit(p.get("units_raw"), CLUE_CATALOG[pid]["unit_fallback"])
                res = analyze_monthly_series(p["records"], unit=unit)
                st = res["statistics"]
                summary[key][pid] = {"status": res["status"], "dir": st["direction"],
                                     "slope": st["slope_per_decade"], "p": st["p_value"], "unit": unit}
                slope = "—" if st["slope_per_decade"] is None else f"{st['slope_per_decade']:+.3f}"
                print(f"   {pid:<14} {res['status']:<20} {slope:>8} {unit}/déc  p={st['p_value']}")

    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"\nCache salvo em {CACHE_FILE} ({CACHE_FILE.stat().st_size / 1024:.0f} KB)")

    print("\n=== Candidatos ao modo Duas Cenas (sinais opostos E ambos significativos) ===")
    found = False
    for pid in CLUE_CATALOG:
        for a, b in itertools.combinations(summary, 2):
            ra, rb = summary[a].get(pid), summary[b].get(pid)
            if not ra or not rb:
                continue
            if {ra["dir"], rb["dir"]} == {"increasing", "decreasing"} and \
                    ra["status"] == rb["status"] == "TENDENCIA_REAL":
                found = True
                print(f"  {pid}: {LOCATIONS[a][0]} ({ra['slope']:+.3f}) x "
                      f"{LOCATIONS[b][0]} ({rb['slope']:+.3f}) {ra['unit']}/déc")
    if not found:
        print("  Nenhum par confirmado. Na demo, diga isso com honestidade ou teste outros locais.")


if __name__ == "__main__":
    main()
