# Erro tipo I com os pressupostos violados (Q3)

**Lab04 — Issues #111 e #112: violação de pressupostos, metade da Q1**

> Arquivo **gerado** por `python src/violacao.py`. Não edite à mão:
> rode o comando de novo.

## Parâmetros

| Item | Valor |
|---|---|
| Repetições por célula | 10.000 |
| Nível de significância | 0.05 |
| Tamanhos de amostra | 5, 10, 30 |
| Desvio das diferenças | 0.3934 s (o das diferenças reais) |
| Semente base | 42 |

Todos os cenários são **simétricos em torno de zero**: as duas H0 valem, e
por isso as duas taxas são erro tipo I e podem ser comparadas. Quebrar a
simetria tornaria a H0 do Wilcoxon falsa — é o caso que a Q1 já cobriu no
bootstrap centralizado.

Se a taxa verdadeira fosse exatamente α, a estimada cairia entre 4,57% e 5,43% em 95% das simulações. Diferenças
menores que isso são ruído de Monte Carlo.

## Taxa de erro tipo I

| Cenário | n | t pareado | Wilcoxon | Diferença (W − t) | p (McNemar) |
|---|---|---|---|---|---|
| normal | 5 | 5,09% | 3,29% | -1,80 p,p, | 9,6 × 10^-31 |
| normal | 10 | 4,52% | 3,74% | -0,78 p,p, | 1,7 × 10^-10 |
| normal | 30 | 4,87% | 4,60% | -0,27 p,p, | 0,0556 |
| cauda_pesada | 5 | 4,47% | 3,07% | -1,40 p,p, | 1,1 × 10^-17 |
| cauda_pesada | 10 | 4,66% | 4,36% | -0,30 p,p, | 0,0313 |
| cauda_pesada | 30 | 4,95% | 4,80% | -0,15 p,p, | 0,3844 |
| contaminada | 5 | 4,05% | 3,32% | -0,73 p,p, | 4,3 × 10^-6 |
| contaminada | 10 | 4,14% | 4,36% | +0,22 p,p, | 0,1490 |
| contaminada | 30 | 4,54% | 4,82% | +0,28 p,p, | 0,1311 |

## Leitura

- **Referência (normal, n = 30).** Sem violação, os dois ficam perto de 5%.
- **Amostra pequena.** Com n = 5 o Wilcoxon exato fica preso à granularidade
  da distribuição: só existem 2⁵ = 32 somas de postos possíveis, e a cauda
  mais próxima de 5% por baixo vale 1/32 ≈ 3,1%. O teste não erra mais do
  que deveria — erra **menos**, e paga isso em poder.
- **Cauda pesada e outliers.** O Wilcoxon trabalha com postos, então o nível
  dele não depende da forma da distribuição, desde que ela seja simétrica.
  O do teste t depende: é aí que a violação de normalidade aparece.

## O que falta (Issues #109 e #110)

Este relatório é a metade da Q3 que repete a **Q1** (erro tipo I). A outra
metade repete a **Q2** — o poder nestes mesmos cenários — e entra no G4.
`gerar_diferencas(cenario, n, efeito, rng)` já aceita o efeito: basta rodar
com valores maiores que zero.
