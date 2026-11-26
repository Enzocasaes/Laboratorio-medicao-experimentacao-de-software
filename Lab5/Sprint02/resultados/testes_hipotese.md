# Lab05 — Testes de hipótese e tamanho do efeito (Sprint 02)

> Gerado por `python Sprint02/inferencia.py` (issue #136). **Não editar à mão.**
> Base validada, lote `provisoria` (decisão D13): 1500 consultas, 60 rodadas, rede-c. Bootstrap por conglomerado com 10000 réplicas, semente 42.

Como ler as colunas: **Δ** = latência do primeiro tratamento − a do segundo, pareada no bloco (rodada × nome). **Δ relativo** = Δ ÷ mediana do segundo. **r** = |Z|/√n do Wilcoxon (Cohen: 0,1 / 0,3 / 0,5). **δ de Cliff** sobre as medianas por unidade, > 0 quando o primeiro tende a ser mais rápido (Romano: 0,147 / 0,33 / 0,474). **Vitórias** = blocos em que o primeiro foi mais rápido por mais de 1 ms, entre os decididos, com IC por bootstrap por conglomerado (M5).

## 1. Vereditos

Regra R1 (ProtocoloExperimental, 3.2): teste bilateral; a hipótese só é **sustentada** com p (Holm) < 0,05 **e** o sinal previsto. Regra R2 (H-c2): IC 95% de Δ inteiro dentro de ±5 ms.

| Hipótese | Papel | Critério | Resultado confirmatório | Leitura exploratória |
|---|---|---|---|---|
| **H-a** | Primária | R1 (Wilcoxon bilateral, Holm, sinal previsto Δ < 0) | **sustentada** | sensibilidade: mantida em S3, S4, S6; cai em S1, S2 (seção 4) |
| **H-b** | Exploratória (R3, modo B) | precisa de C1 e C2 | **não testável** | sem a zona (D1) não há C1 nem C2, e a lista não tem estratos; em C3 o padrão é o mais rápido (seção 2) |
| **H-c1** | Secundária | R1 por janela de 6 h, sinal previsto Δ > 0 | **não testável (1 janela de 6 h)** | 1.1.1.1 DoT nova: indício a favor; 1.1.1.1 DoH nova: indício a favor; 8.8.8.8 DoT nova: indício a favor; 8.8.8.8 DoH nova: indício a favor |
| **H-c2** | Primária | R2: IC 95% dentro de ±5 ms | **não testável (1 janela de 6 h)** | 1.1.1.1 DoT reaproveitada: indício a favor; 1.1.1.1 DoH reaproveitada: indício a favor; 8.8.8.8 DoT reaproveitada: indício a favor; 8.8.8.8 DoH reaproveitada: indício a favor |

## 2. E-1 — resolvedores em Do53, condição C3 (Q1)

**Friedman** sobre 15 nomes: Q = 20.933, gl = 2, p = 2.8e-05; **W de Kendall = 0.70** (concordância entre os nomes na ordem dos resolvedores). Postos médios (1 = mais rápido): 1.1.1.1 = 2.07, 8.8.8.8 = 2.80, padrão = 1.13.

Família de Holm: as duas comparações abaixo (ProtocoloExperimental, 3.2).

| Comparação | Unid. | Δ mediano (ms) | IC 95% | Δ relativo | p (Wilcoxon) | p (Holm) | r | δ de Cliff | Vitórias [IC 95%] |
|---|---|---|---|---|---|---|---|---|---|
| 1.1.1.1 − 8.8.8.8 | 15 | -2.0 | [-3.1; -1.2] | -12% | 0.0215 | 0.0215 | 0.59 grande | +0.64 grande | 71% (185/261) [61%; 80%] |
| 1.1.1.1 − padrão | 15 | +10.4 | [+9.3; +11.4] | +310% | 0.0001 | 0.0002 | 0.87 grande | -0.88 grande | 14% (42/294) [7%; 23%] |

Δ negativo = o 1.1.1.1 respondeu mais rápido.

### 2.1 Δ por nome

Mediana de Δ nas 20 rodadas de cada nome, com o intervalo interquartil. O agregado acima pode esconder nomes em que a ordem se inverte.

| Nome | TTL mediano (s) | 1.1.1.1 − 8.8.8.8 (ms) | [Q1; Q3] | V/D | 1.1.1.1 − padrão (ms) | [Q1; Q3] | V/D |
|---|---|---|---|---|---|---|---|
| `ifood.com.br` | 37 | -9.1 | [-100.7; -3.8] | 18/1 | +5.9 | [-3.5; +11.5] | 6/12 |
| `mercadolivre.com.br` | 30 | -6.0 | [-7.5; -3.4] | 17/3 | +4.3 | [-5.0; +10.6] | 7/10 |
| `github.com` | 18 | -4.1 | [-8.9; -1.2] | 15/4 | +9.2 | [+1.8; +12.3] | 5/15 |
| `gov.br` | 13668 | -3.6 | [-21.2; -1.7] | 16/2 | +10.6 | [+8.9; +13.4] | 0/20 |
| `google.com` | 194 | -2.4 | [-5.8; -0.3] | 13/3 | +9.9 | [+8.0; +11.2] | 1/19 |
| `cloudflare.com` | 160 | -2.4 | [-4.7; +0.1] | 13/3 | +10.2 | [+9.1; +12.7] | 2/18 |
| `wikipedia.org` | 100 | -2.1 | [-4.8; -0.3] | 14/2 | +8.8 | [+6.3; +9.8] | 2/18 |
| `unicode.org` | 300 | -1.8 | [-3.6; +1.3] | 12/6 | +12.4 | [+10.6; +14.0] | 1/19 |
| `globo.com` | 79378 | -1.5 | [-3.2; -0.4] | 12/4 | +9.3 | [+8.3; +11.0] | 0/20 |
| `rfc-editor.org` | 300 | -1.5 | [-5.7; -0.2] | 14/3 | +11.2 | [+10.2; +12.4] | 2/18 |
| `amazon.com` | 414 | -1.2 | [-2.1; +1.2] | 12/5 | +11.1 | [+9.1; +12.2] | 0/20 |
| `uol.com.br` | 40 | -0.4 | [-2.5; +2.4] | 9/8 | -1.9 | [-3.7; +4.0] | 11/8 |
| `postgresql.org` | 1254 | +0.8 | [-1.3; +3.3] | 6/10 | +11.1 | [+8.8; +13.5] | 1/19 |
| `sqlite.org` | 202 | +1.0 | [-3.2; +5.2] | 7/10 | +13.6 | [+11.0; +19.2] | 3/17 |
| `gnu.org` | 300 | +59.7 | [-29.4; +138.8] | 7/12 | +143.7 | [+125.9; +151.9] | 1/19 |

O 1.1.1.1 tem Δ mediano negativo contra o 8.8.8.8 em **12 de 15** nomes. V/D = vitórias/derrotas do 1.1.1.1 nas rodadas do nome (empate abaixo de 1 ms).

## 3. E-2 — custo do protocolo cifrado (Q3, H-c1 e H-c2)

### 3.1 Confirmatório: unidade = janela de 6 h

A coleta inteira cabe numa janela de 6 h, e com uma unidade não há o que reamostrar nem parear. **Nenhuma hipótese do E-2 pode ser confirmada.**

| Resolvedor | Condição | Unid. | Δ vs Do53 (ms) | IC 95% | p |
|---|---|---|---|---|---|
| 1.1.1.1 | DoT nova | 1 | +57.0 | — | — |
| 1.1.1.1 | DoT reaproveitada | 1 | -1.3 | — | — |
| 1.1.1.1 | DoH nova | 1 | +48.1 | — | — |
| 1.1.1.1 | DoH reaproveitada | 1 | +0.9 | — | — |
| 8.8.8.8 | DoT nova | 1 | +114.3 | — | — |
| 8.8.8.8 | DoT reaproveitada | 1 | -0.8 | — | — |
| 8.8.8.8 | DoH nova | 1 | +107.1 | — | — |
| 8.8.8.8 | DoH reaproveitada | 1 | +2.1 | — | — |

### 3.2 Exploratório: unidade = rodada (desvio declarado)

> **Não confirma nada.** A unidade pré-registrada é a janela de 6 h (Planejamento, 10.2). Aqui cada uma das 60 rodadas vira uma unidade. As rodadas estão a 10 s uma da outra e dividem o estado da rede, então não são independentes: o IC e o p saem mais estreitos do que deveriam. Serve para mostrar o tamanho e a direção do custo, e para planejar a coleta definitiva.

**1.1.1.1** (Holm sobre as 4 comparações)

| Comparação | Unid. | Δ mediano (ms) | IC 95% | Δ relativo | p (Wilcoxon) | p (Holm) | r | δ de Cliff | Vitórias [IC 95%] |
|---|---|---|---|---|---|---|---|---|---|
| DoT nova − Do53 | 60 | +57.0 | [+54.2; +62.1] | +401% | 1.7e-11 | 6.7e-11 | 0.87 grande | -1.00 grande | 0% (0/60) [0%; 0%] |
| DoT reaproveitada − Do53 | 60 | -1.3 | [-1.8; +0.5] | -9% | 0.1322 | 0.2644 | 0.19 pequeno | +0.12 desprezivel | 62% (31/50) [48%; 75%] |
| DoH nova − Do53 | 60 | +48.1 | [+45.2; +52.2] | +339% | 1.7e-11 | 6.7e-11 | 0.87 grande | -1.00 grande | 0% (0/60) [0%; 0%] |
| DoH reaproveitada − Do53 | 60 | +0.9 | [-0.5; +1.5] | +7% | 0.3750 | 0.3750 | 0.11 pequeno | -0.12 desprezivel | 38% (18/48) [24%; 51%] |

**8.8.8.8** (Holm sobre as 4 comparações)

| Comparação | Unid. | Δ mediano (ms) | IC 95% | Δ relativo | p (Wilcoxon) | p (Holm) | r | δ de Cliff | Vitórias [IC 95%] |
|---|---|---|---|---|---|---|---|---|---|
| DoT nova − Do53 | 60 | +114.3 | [+110.9; +119.7] | +763% | 1.7e-11 | 6.7e-11 | 0.87 grande | -0.97 grande | 0% (0/60) [0%; 0%] |
| DoT reaproveitada − Do53 | 60 | -0.8 | [-1.5; +0.3] | -5% | 0.4913 | 0.4913 | 0.09 desprezivel | +0.04 desprezivel | 58% (28/48) [44%; 72%] |
| DoH nova − Do53 | 60 | +107.1 | [+101.6; +112.4] | +715% | 1.8e-11 | 6.7e-11 | 0.87 grande | -0.95 grande | 2% (1/60) [0%; 5%] |
| DoH reaproveitada − Do53 | 60 | +2.1 | [-0.4; +4.2] | +14% | 0.0337 | 0.0674 | 0.27 pequeno | -0.36 medio | 38% (21/55) [25%; 51%] |

Δ positivo = o protocolo cifrado custou mais que o Do53. δ de Cliff < 0 = o protocolo cifrado tende a ser mais lento. Para a H-c2, o critério é o IC caber em ±5 ms.

## 4. Análises de sensibilidade (Planejamento, 10.6)

Cada cenário refaz a família E-1 (Holm dentro do cenário). Não há correção entre cenários: a pergunta é se a **conclusão** muda, não um teste novo.

| Cenário | Consultas E-1 | Comparação | Unid. | Δ (ms) | IC 95% | p (Holm) | r | Veredito H-a | Nota |
|---|---|---|---|---|---|---|---|---|---|
| P — Análise principal | 900 | 1.1.1.1 − 8.8.8.8 | 15 | -2.0 | [-3.1; -1.2] | 0.0215 | 0.59 | sustentada |  |
| P — Análise principal | 900 | 1.1.1.1 − padrão | 15 | +10.4 | [+9.3; +11.4] | 0.0002 | 0.87 |  |  |
| S1 — Sem consultas autoaquecidas | 168 | 1.1.1.1 − 8.8.8.8 | 15 | -1.1 | [-5.4; +1.3] | 0.4586 | 0.25 | não sustentada (sem diferença significativa) | TTL da consulta anterior no lugar do TTL autoritativo (D1) |
| S1 — Sem consultas autoaquecidas | 168 | 1.1.1.1 − padrão | 15 | -0.6 | [-4.3; +5.5] | 0.4586 | 0.32 |  |  |
| S2 — Descontando o RTT de rede (M11) | 900 | 1.1.1.1 − 8.8.8.8 | 15 | -0.7 | [-2.0; +2.2] | 0.9341 | 0.03 | não sustentada (sem diferença significativa) |  |
| S2 — Descontando o RTT de rede (M11) | 900 | 1.1.1.1 − padrão | 15 | -5.6 | [-8.3; -2.3] | 0.0205 | 0.65 |  |  |
| S3 — Sem rodadas com troca de sítio do 1.1.1.1 | 900 | 1.1.1.1 − 8.8.8.8 | 15 | -2.0 | [-3.1; -1.2] | 0.0215 | 0.59 | sustentada | 0 rodadas com troca de sítio |
| S3 — Sem rodadas com troca de sítio do 1.1.1.1 | 900 | 1.1.1.1 − padrão | 15 | +10.4 | [+9.3; +11.4] | 0.0002 | 0.87 |  |  |
| S4 — Timeouts como 2.000 ms | 900 | 1.1.1.1 − 8.8.8.8 | 15 | -2.0 | [-3.1; -1.2] | 0.0215 | 0.59 | sustentada | 0 falhas na base |
| S4 — Timeouts como 2.000 ms | 900 | 1.1.1.1 − padrão | 15 | +10.4 | [+9.3; +11.4] | 0.0002 | 0.87 |  |  |
| S5 — Sem o estrato sujeito ao viés da lista | — | — | — | — | — | — | — | — | não se aplica: a lista do piloto não tem estratos (L1 pendente) |
| S6 — Sem latências discrepantes | 840 | 1.1.1.1 − 8.8.8.8 | 15 | -1.7 | [-2.7; -1.2] | 0.0067 | 0.67 | sustentada | discrepantes sinalizados na validação (#134) |
| S6 — Sem latências discrepantes | 840 | 1.1.1.1 − padrão | 15 | +10.0 | [+9.2; +11.0] | 0.0002 | 0.87 |  |  |

