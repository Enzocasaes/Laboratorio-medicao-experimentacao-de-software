# Descritiva dos resultados (Lab05, Sprint 02)

> Gerado por `python Sprint02/descritiva.py`. Não edite à mão.

Issue #135. Base validada, lote `provisoria` (decisão D13): 1500 consultas, 60 rodadas, rede rede-c, 9.8 minutos.

Complementa a seção 1 de [`analise_rede-c.md`](analise_rede-c.md), que já traz mediana, p95, IQR e falhas. Aqui não há teste de hipótese: a inferência está em [`testes_hipotese.md`](testes_hipotese.md).

## 1. Média e desvio como complemento da mediana (10.1)

O plano de análise pede a média **ao lado** da mediana, não no lugar dela. A razão média ÷ mediana e a assimetria dizem o quanto uma substituiria a outra.

| Exp. | Resolvedor | Protocolo | Conexão | n | Média | DP | Mediana | Média/med. | Assim. | Curtose | Máx. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E-1 | 1.1.1.1 | Do53 | unica | 300 | 26.3 | 42.5 | 14.3 | 1.83 | 3.81 | 14.5 | 282.5 |
| E-1 | 8.8.8.8 | Do53 | unica | 300 | 31.1 | 47.0 | 16.5 | 1.89 | 4.44 | 26.4 | 448.4 |
| E-1 | padrão | Do53 | unica | 300 | 9.2 | 19.6 | 3.4 | 2.74 | 5.95 | 39.4 | 159.9 |
| E-2 | 1.1.1.1 | Do53 | unica | 60 | 14.9 | 2.7 | 14.2 | 1.05 | 0.79 | 0.1 | 22.8 |
| E-2 | 1.1.1.1 | DoH | nova | 60 | 66.8 | 14.8 | 64.1 | 1.04 | 1.04 | 1.2 | 110.9 |
| E-2 | 1.1.1.1 | DoH | reaproveitada | 60 | 15.2 | 2.2 | 14.7 | 1.03 | 0.81 | -0.4 | 20.5 |
| E-2 | 1.1.1.1 | DoT | nova | 60 | 87.3 | 109.8 | 70.9 | 1.23 | 7.32 | 52.7 | 915.4 |
| E-2 | 1.1.1.1 | DoT | reaproveitada | 60 | 14.3 | 2.6 | 13.9 | 1.03 | 0.93 | 0.6 | 22.1 |
| E-2 | 8.8.8.8 | Do53 | unica | 60 | 23.8 | 25.6 | 15.0 | 1.59 | 2.96 | 8.5 | 131.5 |
| E-2 | 8.8.8.8 | DoH | nova | 60 | 132.2 | 31.2 | 122.4 | 1.08 | 1.10 | 0.3 | 225.5 |
| E-2 | 8.8.8.8 | DoH | reaproveitada | 60 | 28.4 | 27.8 | 17.3 | 1.64 | 2.98 | 10.8 | 173.4 |
| E-2 | 8.8.8.8 | DoT | nova | 60 | 144.2 | 32.8 | 131.1 | 1.10 | 1.22 | 0.4 | 228.1 |
| E-2 | 8.8.8.8 | DoT | reaproveitada | 60 | 19.5 | 13.8 | 14.7 | 1.33 | 2.66 | 6.0 | 71.1 |

**A média não descreve a consulta típica.** No E-1 ela é de 1.83 a 2.74 vezes a mediana — no padrão, 9.2 ms contra 3.4 ms. Quem reportasse só a média diria que uma consulta DNS nesta rede custa 9 ms, quando metade delas custou menos de 3.4 ms. O desvio-padrão tem o mesmo problema: nos três resolvedores ele é maior que a própria mediana.

## 2. A forma da distribuição

Assimetria positiva é cauda para a direita; curtose em excesso acima de 0 é cauda mais pesada que a da normal. Latência tem piso (o tempo mínimo de ida e volta) e não tem teto, então é esse o formato esperado — e é o que os números confirmam.

| Resolvedor | n | p50 | p75 | p90 | p95 | p99 | Máx. | p99/p50 |
|---|---|---|---|---|---|---|---|---|
| 1.1.1.1 | 300 | 14.3 | 17.1 | 21.6 | 144.8 | 195.1 | 282.5 | 13.6 |
| 8.8.8.8 | 300 | 16.5 | 20.1 | 66.6 | 133.8 | 209.9 | 448.4 | 12.8 |
| padrão | 300 | 3.4 | 6.4 | 20.6 | 25.1 | 130.7 | 159.9 | 38.9 |

Latências do E-1, em ms. Entre o p50 e o p75 o 1.1.1.1 varia 2.8 ms; entre o p90 e o p95, 123.2 ms. **A cauda não é um detalhe da distribuição: ela é a distribuição**, a partir do p90. São as consultas em que a resposta não estava em cache e o resolvedor teve de percorrer a hierarquia do DNS.

É isto que sustenta, com os dados desta coleta, as três escolhas que o desenho fez antes de medir: mediana como estatística principal, testes de postos em vez de teste t, e IQR ÷ mediana em vez de coeficiente de variação (DesenhoMetodologico, 5.2).

## 3. Por nome (E-1)

O `testes_hipotese.md` traz o Δ pareado de cada domínio. Aqui estão os níveis que produzem esse Δ: mediana, dispersão e forma de cada nome em cada resolvedor.

| Nome | n | 1.1.1.1 med. | IQR | 8.8.8.8 med. | IQR | padrão med. | IQR | Mais rápido |
|---|---|---|---|---|---|---|---|---|
| `amazon.com` | 20 | 13.1 | 3.6 | 14.4 | 2.7 | 3.2 | 1.7 | padrão |
| `cloudflare.com` | 20 | 13.0 | 3.0 | 16.3 | 3.8 | 2.6 | 1.0 | padrão |
| `github.com` | 20 | 14.2 | 2.4 | 18.5 | 7.0 | 5.5 | 14.0 | padrão |
| `globo.com` | 20 | 12.5 | 2.8 | 14.6 | 2.7 | 2.8 | 1.3 | padrão |
| `gnu.org` | 20 | 153.3 | 24.8 | 78.3 | 132.8 | 3.7 | 8.1 | padrão |
| `google.com` | 20 | 13.4 | 1.9 | 15.8 | 4.4 | 3.5 | 2.4 | padrão |
| `gov.br` | 20 | 13.2 | 4.2 | 17.3 | 17.2 | 2.9 | 1.5 | padrão |
| `ifood.com.br` | 20 | 14.9 | 5.7 | 23.4 | 102.9 | 7.5 | 20.5 | padrão |
| `mercadolivre.com.br` | 20 | 14.9 | 3.4 | 20.3 | 2.0 | 11.4 | 18.1 | padrão |
| `postgresql.org` | 20 | 14.1 | 4.1 | 14.5 | 3.1 | 2.9 | 3.5 | padrão |
| `rfc-editor.org` | 20 | 15.2 | 3.2 | 17.6 | 7.9 | 3.3 | 3.6 | padrão |
| `sqlite.org` | 20 | 16.7 | 6.2 | 16.0 | 3.1 | 2.6 | 3.1 | padrão |
| `unicode.org` | 20 | 15.6 | 3.4 | 16.9 | 3.1 | 2.8 | 1.8 | padrão |
| `uol.com.br` | 20 | 14.1 | 5.0 | 14.6 | 2.5 | 16.5 | 5.9 | 1.1.1.1 |
| `wikipedia.org` | 20 | 13.0 | 2.4 | 15.4 | 3.0 | 4.5 | 3.9 | padrão |

Medianas e IQR em ms, 20 observações por nome e resolvedor.

**O padrão é o mais rápido em 14 dos 15 nomes**, e o 1.1.1.1 em 1. Isso é o cache do roteador, não um resolvedor melhor (ver as ameaças à validade).

**`gnu.org` é o nome fora da curva**: mediana de 153.3 ms no 1.1.1.1 contra 78.3 ms no 8.8.8.8, com IQR de 24.8 e 132.8 ms. Os dois pagam recursão nesse domínio; o 8.8.8.8 paga menos vezes, e é por isso que ele ganha ali. Um nome assim, com mediana dez vezes maior que a dos vizinhos, move a média do conjunto e não move a mediana — é a razão de o teste ser por postos e a unidade de inferência ser o nome.

## 4. Onde está o custo do DNS cifrado (E-2)

Com conexão nova, a latência medida inclui os dois handshakes. As colunas `t_tcp_ms` e `t_tls_ms` estavam na base desde a coleta e não apareciam em relatório nenhum. O **resto** é calculado consulta a consulta (latência − TCP − TLS) e só depois resumido, porque medianas não somam.

| Resolvedor | Protocolo | n | TCP | TLS | Resto | Total | TLS/Total |
|---|---|---|---|---|---|---|---|
| 1.1.1.1 | DoH | 60 | — | — | — | 64.1 | — |
| 1.1.1.1 | DoT | 60 | 29.0 | 17.3 | 26.0 | 70.9 | 24% |
| 8.8.8.8 | DoH | 60 | — | — | — | 122.4 | — |
| 8.8.8.8 | DoT | 60 | 31.1 | 69.1 | 29.5 | 131.1 | 53% |

Medianas em ms, conexão nova.

**O custo extra do 8.8.8.8 não é distância.** No DoT, o handshake TCP — que é uma ida e volta de rede — custa 29.0 ms no 1.1.1.1 e 31.1 ms no 8.8.8.8, praticamente o mesmo. Já o handshake TLS custa 17.3 ms contra 69.1 ms, **4.0 vezes mais**. A diferença está no que o servidor faz para fechar o TLS, não no caminho até ele. Sozinho, esse handshake responde por 86% da diferença de 60.2 ms entre os dois no DoT com conexão nova.

**Limitação de instrumentação:** no DoH os tempos de handshake não foram registrados (120 consultas com `t_tcp_ms` e `t_tls_ms` vazios). O cliente HTTP não expõe esses tempos, e o coletor não tinha como separá-los. A mesma decomposição do DoT não existe para o DoH, e o custo dele aparece só como total. A versão do HTTP negociada, que a seção 9.4 do plano manda registrar, também ficou vazia.

### Conexão reaproveitada

O mesmo E-2 com a conexão já aberta — o regime em que navegadores operam —, e o Do53 ao lado, que é a referência da comparação.

| Resolvedor | Protocolo | Conexão | n | Mediana | IQR | Assim. |
|---|---|---|---|---|---|---|
| 1.1.1.1 | Do53 | unica | 60 | 14.2 | 4.0 | 0.79 |
| 1.1.1.1 | DoH | reaproveitada | 60 | 14.7 | 2.2 | 0.81 |
| 1.1.1.1 | DoT | reaproveitada | 60 | 13.9 | 3.5 | 0.93 |
| 8.8.8.8 | Do53 | unica | 60 | 15.0 | 3.4 | 2.96 |
| 8.8.8.8 | DoH | reaproveitada | 60 | 17.3 | 7.7 | 2.98 |
| 8.8.8.8 | DoT | reaproveitada | 60 | 14.7 | 4.9 | 2.66 |

## 5. Covariáveis ao longo da coleta

### 5.1 RTT de rede (M11)

Uma medida por rodada e por resolvedor: o tempo de abrir a conexão TCP. Serve para separar a distância do tempo gasto no servidor.

| Resolvedor | n (rodadas) | Mediana | IQR | Mín. | Máx. |
|---|---|---|---|---|---|
| 1.1.1.1 | 60 | 30.0 | 11.3 | 11.2 | 47.7 |
| 8.8.8.8 | 60 | 32.0 | 6.8 | 11.1 | 64.3 |
| padrão | 60 | 16.1 | 3.5 | 1.3 | 30.8 |

**O RTT varia mais do que a diferença que ele explica.** Rodada a rodada, o RTT até o 1.1.1.1 menos o RTT até o 8.8.8.8 tem mediana de -1.4 ms, mas IQR de [-12.0; +8.0] ms, e o 1.1.1.1 está mais perto em apenas 33 das 60 rodadas (55%). A vantagem de distância que a sensibilidade S2 usa existe **na mediana do conjunto**, e não em cada rodada. Esse é um argumento a mais para a unidade de inferência não ser a rodada.

### 5.2 Instância do ponto de presença (1.1.1.1)

O `id.server` do 1.1.1.1 foi consultado uma vez por rodada. Apareceram **12 instâncias distintas**, todas do sítio `gru` (São Paulo), e a instância mudou em 56 das 59 passagens de uma rodada para a seguinte.

| Instância | Rodadas | n (E-1) | Mediana |
|---|---|---|---|
| `gru11` | 11 | 55 | 14.3 |
| `gru19` | 8 | 40 | 13.6 |
| `gru20` | 7 | 35 | 14.4 |
| `gru13` | 6 | 30 | 15.8 |
| `gru17` | 5 | 25 | 13.8 |
| `gru21` | 5 | 25 | 14.4 |
| `gru02` | 4 | 20 | 15.6 |
| `gru08` | 4 | 20 | 14.5 |
| `gru18` | 3 | 15 | 13.4 |
| `gru22` | 3 | 15 | 15.0 |
| `gru23` | 3 | 15 | 15.2 |
| `gru07` | 1 | 5 | 13.1 |

**A instância que atende muda quase toda rodada, e isso vale alguns milissegundos.** Entre as instâncias com 20 ou mais observações, a mediana vai de 13.6 a 15.8 ms — uma amplitude de 2.2 ms, **da mesma ordem da diferença de 2 ms entre os dois resolvedores**. Com 20 observações por instância não dá para afirmar que a instância causa a diferença; dá para afirmar que as duas coisas não podem ser separadas nesta coleta.

Isso também delimita a sensibilidade S3. Ela exclui rodadas em que o **sítio** mudou, e o sítio nunca mudou: foi `gru` nas 60 rodadas. Por isso S3 não excluiu nada e repetiu o resultado principal. A troca de **instância**, que é o que de fato acontece aqui, fica fora do que ela testa.

## 6. O que a descritiva não decide

- **Nada sobre causa.** Esta seção mostra níveis, dispersão e forma; a atribuição a um ou outro fator está nas sensibilidades do `testes_hipotese.md` e nas ameaças à validade.
- **Nada sobre C1 e C2.** Sem a zona do grupo (D1) toda a coleta é C3, então não há descritiva de cache controlado.
- **Nada por faixa horária.** A coleta tem uma faixa só (M10 fica sem dados).
- **Nada sobre outras redes.** Uma rede, uma tarde.

