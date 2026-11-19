# Analise da coleta (Lab05)

> Gerado por `python3 Sprint01/coleta/analise.py`. Nao edite a mao.

| Item | Valor |
|---|---|
| Consultas | 280 |
| Rodadas | 4 |
| Redes | piloto-c |
| Periodo (UTC) | 2026-11-19T02:37:25.359+00:00 a 2026-11-19T02:47:16.722+00:00 |
| Falhas | 0 |

## 1. Descritiva por tratamento (secao 10.1)

O p95 so' aparece com 100 ou mais observacoes bem-sucedidas na celula;
abaixo disso ele e' instavel demais para ser reportado.

| Exp. | Resolvedor | Protocolo | Conexao | Cache | n | Mediana | p95 | IQR | IQR/med | Falhas |
|---|---|---|---|---|---|---|---|---|---|---|
| E-1 | 1.1.1.1 | Do53 | unica | C3 | 60 | 8.8 | — | 3.1 | 0.35 | 0 |
| E-1 | 8.8.8.8 | Do53 | unica | C3 | 60 | 24.7 | — | 12.7 | 0.51 | 0 |
| E-1 | padrao-configurado | Do53 | unica | C3 | 60 | 7.0 | — | 2.9 | 0.41 | 0 |
| E-1 | padrao-gateway | Do53 | unica | C3 | 60 | 9.1 | — | 5.4 | 0.59 | 0 |
| E-2 | 1.1.1.1 | Do53 | unica | C3 | 4 | 7.7 | — | 13.2 | 1.72 | 0 |
| E-2 | 1.1.1.1 | DoH | nova | C3 | 4 | 43.8 | — | 26.0 | 0.59 | 0 |
| E-2 | 1.1.1.1 | DoH | reaproveitada | C3 | 4 | 11.0 | — | 1.4 | 0.12 | 0 |
| E-2 | 1.1.1.1 | DoT | nova | C3 | 4 | 35.9 | — | 27.3 | 0.76 | 0 |
| E-2 | 1.1.1.1 | DoT | reaproveitada | C3 | 4 | 8.2 | — | 15.2 | 1.84 | 0 |
| E-2 | 8.8.8.8 | Do53 | unica | C3 | 4 | 16.7 | — | 2.2 | 0.13 | 0 |
| E-2 | 8.8.8.8 | DoH | nova | C3 | 4 | 136.1 | — | 18.6 | 0.14 | 0 |
| E-2 | 8.8.8.8 | DoH | reaproveitada | C3 | 4 | 17.4 | — | 15.2 | 0.88 | 0 |
| E-2 | 8.8.8.8 | DoT | nova | C3 | 4 | 123.9 | — | 63.5 | 0.51 | 0 |
| E-2 | 8.8.8.8 | DoT | reaproveitada | C3 | 4 | 14.6 | — | 0.4 | 0.02 | 0 |

## 2. E-1 — resolvedores em Do53 (Q1, secao 10.3)

### Condicao C3

**Friedman** sobre 15 unidades de inferencia: Q = 21.960, gl = 3, p = 6.6e-05. Postos medios: 1.1.1.1 = 2.40, 8.8.8.8 = 3.80, padrao-configurado = 1.80, padrao-gateway = 2.00.

| Comparacao | Unid. | Δ mediana (ms) | IC 95% | p (Wilcoxon) | p (Holm) | r | Vitorias |
|---|---|---|---|---|---|---|---|
| 1.1.1.1 − 8.8.8.8 | 15 | -14.6 | [-16.2; -8.2] | 6.1e-05 | 0.0002 | 0.88 | 88% (52/59) |
| 1.1.1.1 − padrao-configurado | 15 | +1.3 | [+1.0; +2.0] | 0.0730 | 0.1460 | 0.47 | 17% (8/46) |
| 1.1.1.1 − padrao-gateway | 15 | +1.6 | [-1.2; +2.8] | 0.1354 | 0.1460 | 0.40 | 38% (21/56) |

Δ negativo = o 1.1.1.1 respondeu mais rapido.

## 3. E-2 — custo do protocolo cifrado (Q3, M7)

| Resolvedor | Condicao | Unid. | Δ vs Do53 (ms) | IC 95% | p (Wilcoxon) | p (Holm) |
|---|---|---|---|---|---|---|
| 1.1.1.1 | DoT nova | 1 | +28.3 | — | — | — |
| 1.1.1.1 | DoT reaproveitada | 1 | -1.2 | — | — | — |
| 1.1.1.1 | DoH nova | 1 | +36.1 | — | — | — |
| 1.1.1.1 | DoH reaproveitada | 1 | +2.5 | — | — | — |
| 8.8.8.8 | DoT nova | 1 | +106.2 | — | — | — |
| 8.8.8.8 | DoT reaproveitada | 1 | -2.5 | — | — | — |
| 8.8.8.8 | DoH nova | 1 | +117.5 | — | — | — |
| 8.8.8.8 | DoH reaproveitada | 1 | +1.2 | — | — | — |

Δ positivo = o protocolo cifrado custou mais que o Do53.

Traco (—) no IC e no p significa **uma unica unidade de inferencia**: a coleta nao durou o bastante para gerar duas janelas de 6 h, entao ha' descritiva mas nao ha' o que reamostrar nem o que parear entre unidades (secao 10.2).

## 4. Falhas (M8, secao 10.4)

| Resolvedor | Consultas | Falhas | Taxa | IC 95% (Wilson) | Tipos |
|---|---|---|---|---|---|
| 1.1.1.1 | 80 | 0 | 0.00% | [0.00%; 4.58%] | — |
| 8.8.8.8 | 80 | 0 | 0.00% | [0.00%; 4.58%] | — |
| padrao-configurado | 60 | 0 | 0.00% | [0.00%; 6.02%] | — |
| padrao-gateway | 60 | 0 | 0.00% | [0.00%; 6.02%] | — |

## 5. Covariaveis (M11 e ponto de presenca)

| Resolvedor | RTT mediano (ms) | Pontos de presenca vistos |
|---|---|---|
| 1.1.1.1 | 9.1 | cnf01 |
| 8.8.8.8 | 15.3 | — |
| padrao-configurado | 8.2 | — |
| padrao-gateway | 5.7 | — |

## 6. Reconexoes na conexao reaproveitada (M12)

0 reconexoes em 16 medidas com conexao reaproveitada.

O tratamento *conexao reaproveitada* **supoe** que a conexao sobrevive a rodada inteira. Se um resolvedor derrubasse conexoes ociosas mais que o outro, parte do custo dele reapareceria sem aviso e a comparacao do E-2 ficaria errada em silencio. Zero reconexoes sustenta a suposicao; qualquer numero diferente de zero precisa entrar na leitura do E-2.

