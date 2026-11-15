"""Endpoint /api/chat com o Gemini simulado (sem gastar cota)."""
import pathlib
import sys

from fastapi.testclient import TestClient

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

import index  # noqa: E402
from _lib import chat  # noqa: E402


class FakeClient:
    sent: dict = {}

    def __init__(self, *a, **k): ...
    async def __aenter__(self): return self
    async def __aexit__(self, *a): ...

    async def post(self, url, headers, json):
        FakeClient.sent = json

        class R:
            def raise_for_status(self): ...
            def json(self): return {"candidates": [{"content": {"parts": [{"text": " olá "}]}}]}
        return R()


def post(c, msgs):
    return c.post("/api/chat", json={"messages": msgs, "context": {"pistas": []}}).json()


def test_primeira_resposta_pede_resumo_completo_e_depois_e_direto(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setattr(chat.httpx, "AsyncClient", FakeClient)
    c = TestClient(index.app)

    assert post(c, [{"role": "user", "text": "explique"}]) == {"ok": True, "text": "olá"}
    assert "PRIMEIRA RESPOSTA" in FakeClient.sent["systemInstruction"]["parts"][0]["text"]

    post(c, [{"role": "user", "text": "a"}, {"role": "model", "text": "b"}, {"role": "user", "text": "c"}])
    assert "acompanhamento" in FakeClient.sent["systemInstruction"]["parts"][0]["text"]
    assert [m["role"] for m in FakeClient.sent["contents"]] == ["user", "model", "user"]


def test_sem_chave_nao_levanta_erro(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(chat, "load_local_env", lambda: None)
    assert post(TestClient(index.app), [{"role": "user", "text": "oi"}])["ok"] is False
