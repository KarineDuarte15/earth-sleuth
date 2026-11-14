# Earth Sleuths — NASA Space Apps Challenge 2026

Aplicação web que transforma perguntas sobre o ambiente em investigações de tendência com dados da NASA POWER: o que muda, onde, quanto por década e com que evidência estatística — inclusive comparando duas regiões (Duas Cenas).

Front-end Next.js 15 + React 19 + Tailwind 4 + Leaflet + Recharts. Back-end FastAPI (Python 3.12) com motor estatístico só em NumPy.

## Rodar no Windows (Python do PC, sem venv)

Pré-requisitos: Python 3.11+ e Node.js 20+ instalados.

1. `windows\1_instalar.bat` — instala as dependências Python e npm.
2. `windows\2_baixar_dados_nasa.bat` — baixa as séries reais da NASA POWER para a cópia de reserva e mostra, no terminal, o resultado de cada pista em cada local (use isso para escolher o par do modo Duas Cenas).
3. `windows\3_iniciar_app.bat` — sobe a API (porta 8000) e o site (porta 3000) e abre o navegador.
4. `windows\4_testar_motor.bat` — roda os testes do motor estatístico.

Equivalente manual: `python -m pip install -r requirements-dev.txt`, `npm install`, `python scripts/fetch_nasa_cases.py`, depois `python -m uvicorn api.index:app --reload --port 8000` num terminal e `npm run dev` em outro.

## Publicar na Vercel

```
npx vercel          # cria um preview
npx vercel --prod   # produção
```

O `vercel.json` encaminha `/api/*` para `api/index.py` (FastAPI). Os módulos internos ficam em `api/_lib/` porque a Vercel transforma cada `.py` solto em `api/` numa função separada; pastas que começam com `_` são ignoradas. Teste primeiro no preview: abra `/api/health` e rode os três casos. Se o `/api/analyze` responder 404 no preview, o roteamento da Vercel para Python precisa de ajuste — me mande o erro.

Rode o `fetch_nasa_cases.py` **antes** do deploy e faça commit do `api/_lib/data/demo_cases.json`: é ele que garante a demo se a API da NASA cair durante a apresentação.

## O que mudou em relação à versão anterior do código

Correções que afetavam o resultado científico:

- **Correção de autocorrelação.** O código anterior calculava um fator de Hamed & Rao (1998) sobre a série mensal de anomalias e aplicava esse fator à variância do Seasonal Mann-Kendall — são estruturas diferentes. Agora usamos a correção de covariância entre meses de Hirsch & Slack (1984), que é a feita para o Seasonal MK, com a postura conservadora de nunca deixar a variância menor que a de independência. Em simulação com ruído AR(1) φ=0,6 sem tendência, o teste sem correção dá falso positivo em ~32% das vezes; com a correção, ~8% (nominal 5%).
- **Validação contra referência.** S, variâncias e inclinação de Sen batem com a biblioteca `pymannkendall` (teste automatizado).
- **Unidades vêm da API.** O catálogo dizia `MJ/m²/dia` para EVPTRNS; a unidade agora é lida da própria resposta da NASA POWER (`parameters.<ID>.units`).
- **Comunidades.** A API aceita AG, RE e SB (não existe "HY" como comunidade). IMERG é tentado em SB e o cliente cai para as outras se o parâmetro não existir.
- **Duas Cenas honesto.** "Tendências opostas" só aparece quando os dois sinais são opostos **e** os dois são significativos; se não, o laudo diz que não dá para afirmar.
- **FDR.** Com várias pistas/cenas testadas juntas, cada laudo mostra também o q-valor de Benjamini-Hochberg (recomendação da proposta estratégica).

Correções técnicas:

- Faltava `postcss.config.mjs` — sem ele o Tailwind 4 não aplica nenhuma classe.
- Recharts 2 + React 19 não desenha as linhas sem fixar `react-is` na versão do React (adicionado em `package.json`).
- Next.js 15.1.0 tinha falhas de segurança conhecidas; atualizado para 15.5.28.
- SciPy removido (só era usado para a normal e postos): pacote serverless bem menor e cold start mais rápido.
- Uma única chamada à NASA por cena com todas as pistas (limite de 20 parâmetros), e as duas cenas em paralelo — antes eram chamadas em série que estouravam o tempo da Vercel.
- O link do mural agora reabre a ficha; antes ele era gerado mas não lido.
- O cache inicial com 8 meses inventados foi removido. Sem rodar o script, o modo "cópia salva" avisa que não há dados em vez de mostrar números falsos.

## Regras do laudo (DRS)

| Carimbo | Regra |
| --- | --- |
| Tendência real (RN01) | p < 0,05 **e** IC 95% da inclinação não cruza zero |
| Pode ser ruído (RN02) | p ≥ 0,05 ou IC 95% cruza zero |
| Dados insuficientes (RN03) | < 15 anos, > 20% de meses ausentes ou < 144 meses válidos; o teste não roda |
| RN04 | Todo número da narrativa é conferido contra o JSON; número sem lastro bloqueia a resposta |

## Antes de submeter

- Rodar `fetch_nasa_cases.py` e conferir no terminal se Quixeramobim × Pelotas realmente tem sinais opostos significativos. Se não tiver, escolher outro par da lista impressa ou dizer na demo que a evidência não sustenta o contraste.
- Todo número que aparecer no vídeo/slides deve sair do app rodando com dados reais.
- Página de submissão e materiais em inglês (o app tem botão English).
- Declarar o uso de ferramentas de IA no desenvolvimento.

Dados: NASA Langley Research Center (LaRC) POWER Project, NASA Earth Science/Applied Science Program. Projeto independente, sem endosso da NASA.
