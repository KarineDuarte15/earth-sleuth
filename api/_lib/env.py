import functools
import os
import pathlib


@functools.cache
def load_local_env() -> None:
    """Lê .env.local da raiz do projeto (só desenvolvimento local; na Vercel valem as variáveis do projeto)."""
    f = pathlib.Path(__file__).resolve().parents[2] / ".env.local"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1)
            os.environ.setdefault(k, v)
