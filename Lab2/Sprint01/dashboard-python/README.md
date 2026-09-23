# Lab02 — Passo 6: Dashboard (Pandas + Matplotlib/Seaborn)

Dashboard de visualização do experimento, na stack pedida pelo enunciado do
laboratório (Pandas + Matplotlib/Seaborn), consolidando os resultados de
quantos integrantes já tiverem trials em [`../data/`](../data/).

## Uso

```bash
cd Lab2/Sprint01/dashboard-python
pip install -r requirements.txt
python dashboard.py
```

Lê `../data/trials-com-metricas.csv` (gerado pelo instrumental em Node — ver
[`../README.md`](../README.md), `npm run metricas -- --juntar`) e grava em
`graficos/`:

| Arquivo | Conteúdo |
|---|---|
| `metrica_<campo>.png` | um gráfico de barras (mediana + IQR) por métrica, `com-ia` × `sem-ia` |
| `dashboard_resumo.png` | os 6 gráficos acima juntos, numa grade 2×3 |
| `tempo_por_kata.png` | tempo até verde pareado por kata (pequenos múltiplos) — a unidade de análise do Passo 4 |

O script também imprime no console a mediana + IQR por tratamento de cada
métrica, e avisa quando a coleta ainda está parcial (nem todos os 3
integrantes têm trials em `data/trials.csv`).

```bash
python dashboard.py --dados <outra pasta de data> --saida <outra pasta de graficos>
```

## Métricas cobertas

RQ1 (tempo até verde), RQ2 (taxa de sucesso dos testes), RQ3a (complexidade
ciclomática média), RQ3b (duplicação de código), RQ3 controle (LOC) e RQ3
exploratório (Índice de Manutenibilidade) — mesmas 6 métricas e mesma paleta
categórica (azul = `com-ia`, laranja = `sem-ia`, validada por
acessibilidade/CVD) do dashboard interativo em
[`../src/dashboard.js`](../src/dashboard.js) → [`../dashboard/index.html`](../dashboard/index.html),
para os dois lerem de forma consistente.

## Por que dois dashboards

O restante do instrumental (Passos 1–5) é Node puro, sem dependências — ver
[`../README.md`](../README.md#pré-requisito). Esta pasta é a exceção
deliberada: o enunciado do laboratório (Passo 6) pede a stack
Pandas/Matplotlib/Seaborn, então ela vive isolada aqui, com seu próprio
`requirements.txt`, sem misturar dependências Python no resto do projeto
Node.

## Limitações conhecidas

- Katas sem os dois tratamentos fechados aparecem no `tempo_por_kata.png` com
  a barra existente e um traço tracejado + "pendente" no lugar da que falta,
  em vez de sumirem do gráfico.
- A leitura estatística (Wilcoxon pareado + correção de Holm) fica com
  `npm run analise` no Node — este dashboard é só descritivo (mediana/IQR),
  como pede o enunciado do Passo 6.
