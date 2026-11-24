# Analise da coleta (Lab05)

> Gerado por `python3 Sprint01/coleta/analise.py`. Nao edite a mao.

| Item | Valor |
|---|---|
| Consultas | 1500 |
| Rodadas | 60 |
| Redes | rede-c |
| Periodo (UTC) | 2026-11-24T17:15:38.096+00:00 a 2026-11-24T17:25:29.066+00:00 |
| Falhas | 0 |

## 1. Descritiva por tratamento (secao 10.1)

O p95 so' aparece com 100 ou mais observacoes bem-sucedidas na celula;
abaixo disso ele e' instavel demais para ser reportado.

| Exp. | Resolvedor | Protocolo | Conexao | Cache | n | Mediana | p95 | IQR | IQR/med | Falhas |
|---|---|---|---|---|---|---|---|---|---|---|
| E-1 | 1.1.1.1 | Do53 | unica | C3 | 300 | 14.3 | 144.8 | 4.4 | 0.31 | 0 |
| E-1 | 8.8.8.8 | Do53 | unica | C3 | 300 | 16.5 | 133.8 | 5.7 | 0.34 | 0 |
| E-1 | padrao | Do53 | unica | C3 | 300 | 3.4 | 25.1 | 4.0 | 1.20 | 0 |
| E-2 | 1.1.1.1 | Do53 | unica | C3 | 60 | 14.2 | — | 4.0 | 0.28 | 0 |
| E-2 | 1.1.1.1 | DoH | nova | C3 | 60 | 64.1 | — | 15.3 | 0.24 | 0 |
| E-2 | 1.1.1.1 | DoH | reaproveitada | C3 | 60 | 14.7 | — | 2.2 | 0.15 | 0 |
| E-2 | 1.1.1.1 | DoT | nova | C3 | 60 | 70.9 | — | 16.4 | 0.23 | 0 |
| E-2 | 1.1.1.1 | DoT | reaproveitada | C3 | 60 | 13.9 | — | 3.5 | 0.25 | 0 |
| E-2 | 8.8.8.8 | Do53 | unica | C3 | 60 | 15.0 | — | 3.4 | 0.23 | 0 |
| E-2 | 8.8.8.8 | DoH | nova | C3 | 60 | 122.4 | — | 25.5 | 0.21 | 0 |
| E-2 | 8.8.8.8 | DoH | reaproveitada | C3 | 60 | 17.3 | — | 7.7 | 0.45 | 0 |
| E-2 | 8.8.8.8 | DoT | nova | C3 | 60 | 131.1 | — | 42.1 | 0.32 | 0 |
| E-2 | 8.8.8.8 | DoT | reaproveitada | C3 | 60 | 14.7 | — | 4.9 | 0.33 | 0 |

## 2. E-1 — resolvedores em Do53 (Q1, secao 10.3)

### Condicao C3

**Friedman** sobre 15 unidades de inferencia: Q = 20.933, gl = 2, p = 2.8e-05. Postos medios: 1.1.1.1 = 2.07, 8.8.8.8 = 2.80, padrao = 1.13.

| Comparacao | Unid. | Δ mediana (ms) | IC 95% | p (Wilcoxon) | p (Holm) | r | Vitorias |
|---|---|---|---|---|---|---|---|
| 1.1.1.1 − 8.8.8.8 | 15 | -2.0 | [-3.1; -1.2] | 0.0215 | 0.0215 | 0.59 | 71% (185/261) |
| 1.1.1.1 − padrao | 15 | +10.4 | [+9.3; +11.4] | 0.0001 | 0.0002 | 0.87 | 14% (42/294) |

Δ negativo = o 1.1.1.1 respondeu mais rapido.

## 3. E-2 — custo do protocolo cifrado (Q3, M7)

| Resolvedor | Condicao | Unid. | Δ vs Do53 (ms) | IC 95% | p (Wilcoxon) | p (Holm) |
|---|---|---|---|---|---|---|
| 1.1.1.1 | DoT nova | 1 | +57.0 | — | — | — |
| 1.1.1.1 | DoT reaproveitada | 1 | -1.3 | — | — | — |
| 1.1.1.1 | DoH nova | 1 | +48.1 | — | — | — |
| 1.1.1.1 | DoH reaproveitada | 1 | +0.9 | — | — | — |
| 8.8.8.8 | DoT nova | 1 | +114.3 | — | — | — |
| 8.8.8.8 | DoT reaproveitada | 1 | -0.8 | — | — | — |
| 8.8.8.8 | DoH nova | 1 | +107.1 | — | — | — |
| 8.8.8.8 | DoH reaproveitada | 1 | +2.1 | — | — | — |

Δ positivo = o protocolo cifrado custou mais que o Do53.

Traco (—) no IC e no p significa **uma unica unidade de inferencia**: a coleta nao durou o bastante para gerar duas janelas de 6 h, entao ha' descritiva mas nao ha' o que reamostrar nem o que parear entre unidades (secao 10.2).

## 4. Falhas (M8, secao 10.4)

| Resolvedor | Consultas | Falhas | Taxa | IC 95% (Wilson) | Tipos |
|---|---|---|---|---|---|
| 1.1.1.1 | 600 | 0 | 0.00% | [0.00%; 0.64%] | — |
| 8.8.8.8 | 600 | 0 | 0.00% | [0.00%; 0.64%] | — |
| padrao | 300 | 0 | 0.00% | [0.00%; 1.26%] | — |

## 5. Covariaveis (M11 e ponto de presenca)

| Resolvedor | RTT mediano (ms) | Pontos de presenca vistos |
|---|---|---|
| 1.1.1.1 | 30.0 | gru02, gru07, gru08, gru11, gru13, gru17, gru18, gru19, gru20, gru21, gru22, gru23 |
| 8.8.8.8 | 32.0 | — |
| padrao | 16.1 | — |

## 6. Reconexoes na conexao reaproveitada (M12)

0 reconexoes em 240 medidas com conexao reaproveitada.

O tratamento *conexao reaproveitada* **supoe** que a conexao sobrevive a rodada inteira. Se um resolvedor derrubasse conexoes ociosas mais que o outro, parte do custo dele reapareceria sem aviso e a comparacao do E-2 ficaria errada em silencio. Zero reconexoes sustenta a suposicao; qualquer numero diferente de zero precisa entrar na leitura do E-2.

