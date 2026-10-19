# RQ 01 a RQ 04 — descritiva e classificação DORA

> Arquivo **gerado** por `npm run analise:dora`. Não edite à mão.

- Amostra: **300 repositórios** (amostra final da S02).
- Janela: **2025-10-01 a 2026-09-30**.
- Gerado em: 2026-10-18T02:40:56.290Z.

Mediana e IQR, e não média e desvio-padrão: as distribuições são muito
assimétricas e a média seria puxada por poucos repositórios extremos
(seção 5 do enunciado).

## Descritiva por métrica

| RQ | Métrica | n | Mediana | IQR (Q1–Q3) | Mín | Máx |
|---|---|---|---|---|---|---|
| RQ 01 | Deployment frequency (releases/semana) | 300 | **0.537** | 0.2493 – 1.2274 | 0.0959 | 28.1726 |
| RQ 02 | Lead time for changes (a) (dias) | 299 | **10.529** | 3.0175 – 39.2105 | 0 | 2109.741 |
| RQ 03 | Change failure rate (a) (proporcao 0-1) | 300 | **0.0485** | 0.0234 – 0.1129 | 0 | 0.9334 |
| RQ 04 | Tempo de recuperacao (horas) | 283 | **2.429** | 0.949 – 6.277 | 0.065 | 181.768 |

## Variantes obrigatórias e censura (fora da classificação)

O enunciado exige duas variantes em RQ 02 e RQ 03, e a proporção de
episódios censurados em RQ 04. A tabela DORA é aplicada apenas sobre a
combinação C1 (release + lead time (a) + CFR (a)); estas entram na
descritiva e na discussão.

| RQ | Métrica | n | Mediana | IQR (Q1–Q3) | Mín | Máx |
|---|---|---|---|---|---|---|
| RQ 02 | Lead time for changes (b), por commit (dias) | 299 | **7.761** | 2.694 – 25.3845 | 0 | 929.236 |
| RQ 03 | Change failure rate (b), proxy de entrega (proporcao 0-1) | 298 | **0.1875** | 0.0242 – 0.4 | 0 | 0.9808 |
| RQ 04 | Proporcao de episodios censurados (proporcao 0-1) | 284 | **0** | 0 – 0.0075 | 0 | 1 |

## Distribuição das categorias por métrica

| RQ | Métrica | Elite | High | Medium | Low | Não medida |
|---|---|---|---|---|---|---|
| RQ 01 | Deployment frequency | 8 (2.7%) | 83 (27.7%) | 144 (48.0%) | 65 (21.7%) | 0 |
| RQ 02 | Lead time for changes (a) | 46 (15.3%) | 76 (25.3%) | 90 (30.0%) | 87 (29.0%) | 1 |
| RQ 03 | Change failure rate (a) | 247 (82.3%) | 36 (12.0%) | 10 (3.3%) | 7 (2.3%) | 0 |
| RQ 04 | Tempo de recuperacao | 75 (25.0%) | 182 (60.7%) | 24 (8.0%) | 2 (0.7%) | 17 |

## Categoria geral (combinação C1)

Mediana dos quatro pontos (Elite 4, High 3, Medium 2, Low 1), arredondada
para baixo. Repositórios sem alguma métrica medida são classificados pelas
que têm, e a coluna `metricas_classificadas` registra quantas foram.

| Categoria | Repositórios | % |
|---|---|---|
| Elite | 25 | 8.3% |
| High | 132 | 44.0% |
| Medium | 129 | 43.0% |
| Low | 14 | 4.7% |

## Como refazer

```bash
cd Lab3/Sprint01
npm run analise:dora
```
