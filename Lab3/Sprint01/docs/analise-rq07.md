# RQ 07 — análise de sensibilidade das definições operacionais

> Arquivo **gerado** por `npm run analise:sensibilidade`. Não edite à mão.

- Amostra: **300 repositórios**. Janela: 2025-10-01 a 2026-09-30.
- Gerado em: 2026-10-20T21:41:37.742Z.

## As três combinações

| Combinação | Unidade de deploy | Lead time | CFR |
|---|---|---|---|
| **C1** | release publicada | (a) por release | (a) proxy de CI |
| **C2** | release + pre-release | (b) por commit | (b) proxy de entrega |
| **C3** | tag | (b) por commit | (a) proxy de CI |

O **tempo de recuperação (RQ 04) é o mesmo nas três**: ele vem dos workflow
runs e não depende da unidade de deploy. Manter essa métrica fixa isola o
efeito do que realmente muda entre as combinações.

## Distribuição das categorias

| Combinação | Elite | High | Medium | Low | Sem classificação |
|---|---|---|---|---|---|
| C1 | 25 | 132 | 129 | 14 | 0 |
| C2 | 8 | 128 | 152 | 12 | 0 |
| C3 | 20 | 146 | 122 | 12 | 0 |

## Quanto muda de uma definição para outra

| Par | n | Mudaram de categoria | Distância média | Máxima | Kappa ponderado | Concordância |
|---|---|---|---|---|---|---|
| C1 x C2 | 300 | **83** (27.7%) | 1.0843 | 2 | **0.5656** | moderada |
| C1 x C3 | 300 | **63** (21.0%) | 1.0159 | 2 | **0.7034** | substancial |
| C2 x C3 | 300 | **70** (23.3%) | 1 | 1 | **0.6525** | substancial |

O **kappa ponderado** (pesos lineares) leva em conta que as categorias são
ordenadas: trocar Elite por High pesa menos do que trocar Elite por Low. A
escala de interpretação é a de Landis & Koch, a mesma do kappa de Fleiss da
validação manual.

## Como refazer

```bash
cd Lab3/Sprint01
npm run coletar:tags
npm run analise:sensibilidade
```
