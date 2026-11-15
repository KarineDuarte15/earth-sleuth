"""
Teste: um LLM interpreta a pergunta usando SÓ o catálogo do app (enum fechado) e devolve a ficha.
Não faz parte do app; serve para comparar com o interpretador de palavras-chave.

    python scripts/llm_interpret_test.py                       # frases de teste
    python scripts/llm_interpret_test.py "a chuva em Belém diminuiu?"

Precisa de GROQ_API_KEY (variável de ambiente ou .env.local na raiz). Modelo: GROQ_MODEL (padrão abaixo).
"""
import json
import os
import pathlib
import ssl
import sys
import time

import httpx

sys.stdout.reconfigure(encoding="utf-8")
TLS = ssl.create_default_context()  # certificados do sistema (httpx usa o pacote próprio e falha atrás de proxy/antivírus)

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
from _lib.catalog import CLUE_CATALOG  # noqa: E402

MODEL = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b")
SAMPLES = [
    "As noites estão ficando mais quentes em Fortaleza desde 1990?",
    "A terra está ficando mais seca no Ceará?",
    "Está esfriando em Pelotas?",
    "As noites estão mais secas no sertão?",
    "Compare a chuva de Manaus e Belém nos últimos 20 anos",
    "Is it getting hotter in Lisbon since 2000?",
    "Are nights getting warmer in Phoenix over the last 30 years?",
    "Is the land drying out in Northeast Brazil?",
    "Compare rainfall trends in Fortaleza and Pelotas",
    "Is it going to rain tomorrow in London?",
    "O clima está mudando?",
    "Vai chover amanhã em Recife?",
    "Pq faz tanto calor em Salvador?",
    "Será que vai chover essa semana em Fortaleza?"
]

for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines() if (ROOT / ".env.local").exists() else []:
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        os.environ.setdefault(k, v)
KEY = os.environ.get("GROQ_API_KEY")
if not KEY:
    sys.exit("Faltou GROQ_API_KEY (preencha em .env.local).")
MODEL = os.environ.get("GROQ_MODEL", MODEL)

from _lib.interpret import SYSTEM, TOOL  # noqa: E402  (única cópia do prompt)


def interpret(question: str) -> dict:
    for _ in range(4):  # plano free: limite de tokens/min; espera e tenta de novo
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {KEY}"},
            json={"model": MODEL, "temperature": 0, "max_tokens": 3000,
                  **({"reasoning_effort": "low"} if "gpt-oss" in MODEL else {"reasoning_effort": "none"} if "qwen" in MODEL else {}),  # gpt-oss não desliga o raciocínio (mínimo: low); qwen aceita none
                  "tools": [TOOL], "tool_choice": {"type": "function", "function": {"name": "ficha"}},
                  "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": question}]},
            timeout=30, verify=TLS,
        )
        if r.status_code != 429:
            break
        time.sleep(min(float(r.headers.get("retry-after", 10)), 30))
    if r.status_code >= 400:
        sys.exit(f"Groq respondeu HTTP {r.status_code}: {r.text[:1500]}")
    body = r.json()
    ficha = json.loads(body["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"])
    ficha["_tokens"] = f"{body['usage']['prompt_tokens']} in / {body['usage']['completion_tokens']} out"
    # a Groq não garante o schema como a Anthropic: confere aqui o que o app precisaria confiar
    bad = [i for i in ficha.get("parameter_ids", []) if i not in CLUE_CATALOG]
    if bad:
        ficha["parameter_ids"] = [i for i in ficha["parameter_ids"] if i in CLUE_CATALOG]
        ficha["_problemas"] = f"IDs fora do catálogo descartados: {bad}"
    if not ficha.get("supported"):
        ficha["parameter_ids"] = []
    needs = ficha.get("needs", "").strip()
    if needs.lower() in {"nenhum", "nenhuma", "none", "n/a", "-"} or needs == question.strip():
        ficha["needs"] = ""
    if not 1981 <= ficha.get("start_year", 0) <= ficha.get("end_year", 0) <= 2025:
        ficha["_problemas"] = ficha.get("_problemas", "") + f" período inválido: {ficha.get('start_year')}–{ficha.get('end_year')}"
    return ficha


def geocode(place: str) -> str:
    """'Cidade, Estado, País': busca pela cidade e prefere o resultado cujo estado/país bate com o resto."""
    name, *quals = [x.strip() for x in place.split(",")]
    hits = httpx.get("https://geocoding-api.open-meteo.com/v1/search",
                     params={"name": name, "count": 10, "language": "pt"}, timeout=10, verify=TLS).json().get("results") or []
    low = [q.lower() for q in quals]
    hit = next((h for h in hits if any(q in (h.get("admin1", "") + " " + h.get("country", "")).lower() for q in low)), hits[0] if hits else None)
    return f"{hit['name']} ({hit.get('admin1', '')}, {hit.get('country', '')}) {hit['latitude']:.2f},{hit['longitude']:.2f}" if hit else "não achei"


for q in (sys.argv[1:] or SAMPLES):
    t0 = time.perf_counter()
    f = interpret(q)
    f['_tokens'] += f" | {time.perf_counter() - t0:.2f}s"
    print(f"\n» {q}")
    print(f"  suportado={f['supported']}  pistas={f['parameter_ids']}  duas_cenas={f['two_scenes']}  {f['start_year']}–{f['end_year']}  [{f['_tokens']}]")
    print(f"  porquê: {f['rationale']}")
    for p in f["places"]:
        print(f"  lugar '{p}' -> {geocode(p)}")
    if f.get("_problemas"):
        print(f"  ⚠ {f['_problemas']}")
    if f["needs"]:
        print(f"  falta: {f['needs']}")
