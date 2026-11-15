"""
Chat sobre os resultados (Gemini). O modelo só explica os números que o motor estatístico já calculou:
o contexto vem do front, o carimbo continua sendo do código. Falha de rede/cota vira {"ok": False}, nunca exceção.
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

from .env import load_local_env
from .interpret import GEMINI_MODEL, GEMINI_URL, TLS

TIMEOUT_S = 45.0

SYSTEM = """Você é o "Sleuth", cientista do clima que conversa com estudantes do ensino médio e de faculdade.
Tom: um cientista explicando de forma simples e curiosa. Frases curtas, analogias do dia a dia, termos técnicos só com a explicação logo ao lado. Sem jargão solto, sem tom professoral.

Você só pode usar os DADOS DA INVESTIGAÇÃO abaixo (NASA POWER, calculados pelo motor estatístico do app). Regras:
- Nunca invente números, lugares, anos ou fontes. Se a resposta não está nos dados, diga isso com franqueza e sugira como investigar (outra pista, outro período, outro lugar).
- Os carimbos são do motor: TENDENCIA_REAL = o sinal se destaca do ruído (IC 95% não inclui zero e p baixo); PODE_SER_RUIDO = não dá para distinguir de variação natural; DADOS_INSUFICIENTES = menos de 15 anos ou dados demais ausentes. Não contradiga o carimbo.
- Tendência não prova causa. Se perguntarem "por quê", explique o que os dados mostram e deixe claro o que eles não mostram.
- Se houver validação cruzada, ela só aparece quando o aluno a rodou; não a invente.
- Responda no idioma da pergunta. Use markdown leve: **negrito** para o essencial e listas curtas.
- Perguntas fora do tema clima/dados: redirecione com gentileza para a investigação.

{first}

DADOS DA INVESTIGAÇÃO (JSON):
{context}
"""

FIRST = """ESTA É A PRIMEIRA RESPOSTA DA CONVERSA e ela será o contexto de todas as seguintes. Por isso, responda de forma COMPLETA e bem estruturada, nesta ordem:
1. **Resumo em uma frase** do que os dados dizem.
2. **Resultado por pista e por cena**: lugar, período, tendência por década com intervalo de confiança, carimbo e o que isso significa em linguagem simples (com uma analogia).
3. **Confiança**: quantos anos/meses, dados ausentes, alertas de qualidade e a origem dos dados (ao vivo ou cópia salva).
4. **Comparação entre cenas**, se houver.
5. **O que isso NÃO prova** (limites e cuidados).
6. **Para ir além**: 2 ou 3 perguntas que o aluno poderia fazer em seguida.
Depois dessa visão geral, responda também a pergunta do aluno, se ela pedir algo específico."""

NEXT = "Esta é uma pergunta de acompanhamento: seja direto e proporcional à pergunta (em geral 1 a 3 parágrafos curtos), apoiando-se no histórico e nos dados."


async def chat(messages: list[dict[str, str]], context: dict[str, Any]) -> dict[str, Any]:
    load_local_env()
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return {"ok": False, "reason": "sem chave"}
    first = len(messages) == 1
    system = SYSTEM.format(first=FIRST if first else NEXT, context=json.dumps(context, ensure_ascii=False))
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S, verify=TLS) as client:
            r = await client.post(
                GEMINI_URL.format(model=GEMINI_MODEL), headers={"x-goog-api-key": key},
                json={"systemInstruction": {"parts": [{"text": system}]},
                      "contents": [{"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["text"]}]} for m in messages],
                      "generationConfig": {"temperature": 0.4, "maxOutputTokens": 4000 if first else 1500}})
            r.raise_for_status()
            parts = r.json()["candidates"][0]["content"]["parts"]
            return {"ok": True, "text": "".join(p.get("text", "") for p in parts).strip()}
    except Exception as exc:  # 429, timeout, bloqueio de segurança, rede
        status = f" {exc.response.status_code}" if isinstance(exc, httpx.HTTPStatusError) else ""
        return {"ok": False, "reason": f"{type(exc).__name__}{status}"}
