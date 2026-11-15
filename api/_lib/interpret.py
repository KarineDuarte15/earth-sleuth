"""
Interpretação da pergunta por LLM (Groq): o modelo só escolhe entre as pistas do catálogo (enum fechado)
e devolve a ficha. Ele nunca decide o carimbo: isso continua sendo do motor estatístico.

Provedores em ordem: Groq e, se ela falhar (sem chave, 429, timeout, resposta inválida), Gemini. Se os dois
falharem, o resultado é {"fallback": True} e o front usa o interpretador de palavras-chave.
Nada aqui levanta exceção para quem chama.
"""
from __future__ import annotations

import asyncio
import json
import os
import ssl
from typing import Any

import httpx

from .catalog import CLUE_CATALOG
from .env import load_local_env

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MODEL = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
TIMEOUT_S = 6.0
TLS = ssl.create_default_context()  # certificados do sistema (o pacote do httpx falha atrás de proxy/antivírus)

CLUES = "\n".join(f"- {k}: {c['label_pt']}. {c['simple_def_pt']} (desde {c['min_year']})" for k, c in CLUE_CATALOG.items())
SYSTEM = f"""Você traduz perguntas sobre o clima numa ficha de investigação de TENDÊNCIA (1981–2025) com dados da NASA POWER.
Você NÃO responde a pergunta e NÃO decide resultado: só escolhe entre as pistas do catálogo abaixo. Seja preciso e econômico.

Catálogo de pistas:
{CLUES}

REGRAS DE PISTAS (escolha o MENOR conjunto que responde a pergunta; mais pistas = mais testes para o usuário ler):
1. Calor, esquentando, hotter, warming, temperatura, sem mais detalhe -> só T2M.
2. Noites, noturna, night -> só T2M_MIN. Dias quentes, máximas, hot days, daytime -> só T2M_MAX. Frio/esfriando/cooling -> só T2M.
3. Nunca junte T2M com T2M_MIN/T2M_MAX, nem T2M_MIN com T2M_MAX, salvo se a pergunta pedir dia E noite explicitamente.
4. Chuva, rain, precipitação -> só PRECTOTCORR. Não adicione umidade do solo nem evapotranspiração a uma pergunta só de chuva.
5. IMERG_PRECTOT só se a pergunta citar satélite, IMERG ou GPM. Se citar satélite e pedir para comparar com outra fonte/reanálise, use IMERG_PRECTOT + PRECTOTCORR.
6. "Mais seco", seca, aridez, drier, drought, drying -> PRECTOTCORR + GWETROOT + EVPTRNS. Só umidade do solo -> GWETROOT. Só evapotranspiração -> EVPTRNS.
7. Dois fenômenos distintos na pergunta -> uma pista por fenômeno (ex.: máximas e umidade do solo -> T2M_MAX + GWETROOT).
8. Pergunta sobre "o clima" de um lugar, sem variável -> T2M + PRECTOTCORR. Sem lugar e sem variável -> supported=false.
9. Pergunta de causa ("por que faz calor?") -> escolha a pista da tendência e avise em needs que o app mostra a tendência, não a causa.

REGRAS DE LUGAR:
10. places: cada item é uma CIDADE no formato "Cidade, Estado, País". Nunca estado, país, bioma ou região no lugar da cidade.
11. Se o usuário citar estado, região ou bioma (Ceará, semiárido, Cerrado, Mato Grosso, Nordeste), escolha UMA cidade representativa dentro dele e diga em needs: "Usei <cidade> como ponto representativo de <região>; ajuste no mapa se quiser outro."
12. Sem lugar na pergunta: places vazio e needs pedindo o lugar. Não invente lugar.
13. Comparação entre duas regiões: two_scenes=true e exatamente 2 lugares. Só um lugar citado: two_scenes=true, 1 lugar, e needs pedindo o segundo.

REGRAS DE PERÍODO:
14. start_year/end_year entre 1981 e 2025. Sem menção: 1981 e 2025. O último ano completo é 2025: "últimos 20 anos" = 2006–2025; "desde 1995" = 1995–2025. Uma década = 10 anos: "últimas 3 décadas" / "last three decades" = 1996–2025; "últimas décadas" sem número = período todo.
15. Se a pista só existe a partir de um ano (campo "desde"), start_year não pode ser anterior; avise em needs que o período foi ajustado.
16. O motor exige 15 anos ou mais. Se a pergunta pedir menos, mantenha o pedido e avise em needs que sairá como "dados insuficientes" e sugira um período maior.

REGRAS DE RESPOSTA:
17. supported=false para previsão do tempo (amanhã, esta semana), assuntos sem relação com tendência climática, ou pergunta vaga sem lugar e sem tema. Nesse caso parameter_ids=[], e needs explica em uma frase o que o app faz e sugere como reformular.
18. needs é "" quando não há nada a avisar. Nunca escreva "Nenhum" nem repita a pergunta. Não peça confirmação de interpretações razoáveis (ex.: "últimas duas décadas").
19. rationale: uma frase curta. rationale e needs no idioma da pergunta (português ou inglês).

EXEMPLOS (pergunta -> pistas | lugares | período | needs):
- "O calor em Petrolina está aumentando desde 2000?" -> T2M | Petrolina, Pernambuco, Brasil | 2000–2025 | ""
- "As chuvas diminuíram em Foz do Iguaçu?" -> PRECTOTCORR | Foz do Iguaçu, Paraná, Brasil | 1981–2025 | ""
- "Is the Cerrado getting drier?" -> PRECTOTCORR, GWETROOT, EVPTRNS | Goiânia, Goiás, Brasil | 1981–2025 | "Used Goiânia as a representative point of the Cerrado; adjust on the map if you prefer another."
- "Vai chover amanhã em Recife?" -> supported=false | [] | - | "O app analisa tendências climáticas de longo prazo (1981–2025), não previsão do tempo. Tente: 'A chuva em Recife diminuiu nas últimas décadas?'"
"""

TOOL = {"type": "function", "function": {
    "name": "ficha",
    "description": "Ficha da investigação.",
    "parameters": {
        "type": "object",
        "properties": {
            "supported": {"type": "boolean"},
            "parameter_ids": {"type": "array", "items": {"type": "string", "enum": list(CLUE_CATALOG)}},
            "places": {"type": "array", "items": {"type": "string"}, "maxItems": 2},
            "two_scenes": {"type": "boolean"},
            "start_year": {"type": "integer", "minimum": 1981, "maximum": 2025},
            "end_year": {"type": "integer", "minimum": 1981, "maximum": 2025},
            "rationale": {"type": "string"},
            "needs": {"type": "string"},
        },
        "required": ["supported", "parameter_ids", "places", "two_scenes", "start_year", "end_year", "rationale", "needs"],
    },
}}


async def _call_groq(client: httpx.AsyncClient, key: str, question: str) -> dict[str, Any]:
    r = await client.post(
        GROQ_URL, headers={"Authorization": f"Bearer {key}"},
        json={"model": MODEL, "temperature": 0, "max_tokens": 3000,
              **({"reasoning_effort": "low"} if "gpt-oss" in MODEL else {"reasoning_effort": "none"} if "qwen" in MODEL else {}),
              "tools": [TOOL], "tool_choice": {"type": "function", "function": {"name": "ficha"}},
              "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": question}]})
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"])


def _gemini_schema(node: Any) -> Any:
    """Schema da ferramenta sem as chaves que o Gemini não aceita (a validação de faixa fica em _clean)."""
    if isinstance(node, dict):
        return {k: _gemini_schema(v) for k, v in node.items() if k not in {"minimum", "maximum", "maxItems"}}
    return node


async def _call_gemini(client: httpx.AsyncClient, key: str, question: str) -> dict[str, Any]:
    r = await client.post(
        GEMINI_URL.format(model=GEMINI_MODEL), headers={"x-goog-api-key": key},
        json={"systemInstruction": {"parts": [{"text": SYSTEM}]},
              "contents": [{"role": "user", "parts": [{"text": question}]}],
              "tools": [{"functionDeclarations": [_gemini_schema(TOOL["function"])]}],
              "toolConfig": {"functionCallingConfig": {"mode": "ANY", "allowedFunctionNames": ["ficha"]}},
              "generationConfig": {"temperature": 0, "maxOutputTokens": 3000}})
    r.raise_for_status()
    parts = r.json()["candidates"][0]["content"]["parts"]
    return next(p["functionCall"]["args"] for p in parts if "functionCall" in p)


async def _geocode(client: httpx.AsyncClient, place: str) -> dict[str, Any] | None:
    """'Cidade, Estado, País': busca pela cidade e prefere o resultado cujo estado/país bate com o resto."""
    name, *quals = [x.strip() for x in place.split(",")]
    try:
        r = await client.get(GEOCODE_URL, params={"name": name, "count": 10, "language": "pt"})
        hits = r.json().get("results") or []
    except Exception:
        return None  # lugar não achado: o front pergunta onde fica
    low = [q.lower() for q in quals]
    hit = next((h for h in hits if any(q in (h.get("admin1", "") + " " + h.get("country", "")).lower() for q in low)),
               hits[0] if hits else None)
    if hit is None:
        return None
    admin = hit.get("admin1")
    return {"region_name": f"{hit['name']} ({admin})" if admin and admin != hit["name"] else hit["name"],
            "latitude": hit["latitude"], "longitude": hit["longitude"]}


async def _clean(client: httpx.AsyncClient, ficha: dict[str, Any], question: str) -> dict[str, Any]:
    """O modelo não é confiável por contrato: o que o app aceita é conferido aqui."""
    ids = [i for i in ficha.get("parameter_ids", []) if i in CLUE_CATALOG]
    supported = bool(ficha.get("supported")) and bool(ids)
    start, end = ficha.get("start_year"), ficha.get("end_year")
    if not (isinstance(start, int) and isinstance(end, int) and 1981 <= start <= end <= 2025):
        start, end = 1981, 2025
    needs = str(ficha.get("needs") or "").strip()
    if needs.lower() in {"nenhum", "nenhuma", "none", "n/a", "-"} or needs == question.strip():
        needs = ""
    places = await asyncio.gather(*[_geocode(client, p) for p in ficha.get("places", [])[:2]])
    return {
        "fallback": False,
        "supported": supported,
        "parameter_ids": ids if supported else [],
        "places": [p for p in places if p],
        "two_scenes": supported and bool(ficha.get("two_scenes")),
        "start_year": start,
        "end_year": end,
        "needs": needs,
    }


async def interpret(question: str) -> dict[str, Any]:
    load_local_env()
    providers = [("groq", "GROQ_API_KEY", _call_groq), ("gemini", "GEMINI_API_KEY", _call_gemini)]
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=TIMEOUT_S, verify=TLS) as client:
        for name, env_key, call in providers:
            key = os.environ.get(env_key)
            if not key:
                errors.append(f"{name}: sem chave")
                continue
            try:
                return {**await _clean(client, await call(client, key, question), question), "provider": name}
            except Exception as exc:  # 429, timeout, JSON inválido, rede: tenta o próximo provedor
                status = f" {exc.response.status_code}" if isinstance(exc, httpx.HTTPStatusError) else ""
                errors.append(f"{name}: {type(exc).__name__}{status}")
    return {"fallback": True, "reason": "; ".join(errors)}
