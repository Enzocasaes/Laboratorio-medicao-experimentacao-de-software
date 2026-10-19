# RQ 08 (bônus) — rework rate

> Arquivo **gerado** por `npm run analise:rq08`. Não edite à mão.

- Amostra: **300 repositórios** (amostra final da S02).
- Janela: **2025-10-01 a 2026-09-30**.
- Gerado em: 2026-10-19T20:49:18.654Z.
- Heurística de release corretiva: `v3-patch-e-commits` (coluna `corrective_heuristic`).

> **Atenção:** esta versão da heurística ainda **não foi validada** pela
> amostra-ouro (ver `docs/validacao-manual.md`). O rework rate depende
> inteiramente dela; trate os números abaixo como provisórios.

**Rework rate** = `corrective_releases / releases_classified`: a proporção de
deploys da janela classificados como corretivos. Ao contrário do CFR (b), não
exige que a correção saia em até 7 dias. Campo vazio = não medido (nenhuma
release classificada), nunca zero: esses repositórios ficam fora do cálculo.

## Descritiva

| Recorte | Repositórios | n medido | Sem medida | Mediana | IQR (Q1 – Q3) | Mín | Máx |
|---|---|---|---|---|---|---|---|
| Todos | 300 | 292 | 8 | **48,9%** | 22,2% – 75,1% | 0,0% | 100,0% |
| Robustez: ≥ 10 releases classificadas | 240 | 240 | 0 | **50,0%** | 22,7% – 75,6% | 0,0% | 100,0% |

Correlação de **Spearman** (por postos). IC de 95% pela transformação de
Fisher (erro-padrão de Bonett e Wright, 2000). Os quatro pares formam uma
família, corrigida por **Holm** (α = 0,05). Magnitude de |ρ|:
< 0,1 nula, < 0,3 fraca, < 0,5 moderada, ≥ 0,5 forte. Cada par usa os
repositórios em que as duas métricas foram medidas.

## Correlações

| Rework rate × … | n | ρ | IC 95% | p | p (Holm) | Leitura |
|---|---|---|---|---|---|---|
| CFR (b), proxy de entrega | 291 | **0,515** | 0,419 a 0,600 | < 0,0001 | < 0,0001 | forte positiva, significativa após Holm |
| CFR (a), proxy de CI | 292 | **0,012** | -0,103 a 0,127 | 0,8337 | 1 | nula, não significativa após Holm |
| Deployment frequency (releases/semana) | 292 | **0,043** | -0,072 a 0,157 | 0,4606 | 1 | nula, não significativa após Holm |
| Tempo de recuperacao (horas) | 277 | **-0,020** | -0,138 a 0,098 | 0,7403 | 1 | nula, não significativa após Holm |

## Rework rate por quartil de frequência

| Quartil | Frequência (releases/semana) | n | n medido | Rework mediana | Rework IQR |
|---|---|---|---|---|---|
| Q1 | 0,096 a 0,249 | 77 | 73 | 50,0% | 22,2% – 80,0% |
| Q2 | 0,249 a 0,537 | 76 | 76 | 47,6% | 21,4% – 71,4% |
| Q3 | 0,537 a 1,227 | 73 | 72 | 45,0% | 20,4% – 71,1% |
| Q4 | 1,227 a 28,173 | 74 | 71 | 52,6% | 25,0% – 77,7% |

Kruskal-Wallis entre os quartis: H = 1,075 (3 gl), p = 0,7831, ε² = 0,004 (desprezivel). Leitura complementar, fora da família de Holm: repete, por grupos, o par frequência × rework.

## CFR (b) − rework rate

Por repositório com as duas taxas medidas. Valores negativos indicam releases
corretivas que o CFR (b) não conta como falha — em geral porque saíram mais de
7 dias depois da release anterior. Os denominadores diferem (releases
avaliadas no CFR (b) × classificadas no rework), então a diferença é uma
aproximação.

| n | Mediana | IQR (Q1 – Q3) | Mín | Máx | < 0 | = 0 | > 0 |
|---|---|---|---|---|---|---|---|
| 291 | **-14,2 p.p.** | -36,9 p.p. – -2,7 p.p. | -100,0 p.p. | +5,0 p.p. | 255 | 25 | 11 |

## Como refazer

```bash
cd Lab3/Sprint01
npm run analise:rq08
python scripts/conferir_rq08.py   # opcional: confere com o scipy
```
