# Consistência metodológica dos dados coletados (Lab05, Sprint 02)

> Gerado por `python Sprint02/conformidade.py`. Não edite à mão.

Issue #130. Base validada, lote `provisoria`: 1500 consultas em 60 rodadas.

A issue #134 já verificou **qualidade e integridade**: se os arquivos batem, se há lacuna, se há valor impossível. Aqui a pergunta é outra, e é a do desenho: **os dados coletados são os dados que o experimento pedia?**

**Conformes: 3. Divergentes: 10. Não exercitadas: 1.** Divergência não é erro: a decisão D13 trocou, de propósito, a coleta de 7 dias por uma de 10 minutos, para a sprint ter dado. O que não pode é a divergência ficar implícita quando os resultados forem lidos.

| # | Item | Onde | Veredito |
|---|---|---|---|
| C1 | Pontos de coleta | D2 | **divergente** |
| C2 | Duração da coleta | D5 | **divergente** |
| C3 | Intervalo entre rodadas | D4 | **divergente** |
| C4 | Nomes por rodada e no total | D3 e 9.7 | **divergente** |
| C5 | Condições de cache | 9.3 e D1 | **divergente** |
| C6 | Cadência de consultas a serviço de terceiro | 7.2 e enunciado | **divergente** |
| C7 | Dados que não podem ser versionados | 7.5 | **conforme** |
| C8 | Blocos completos | 6.1 | **conforme** |
| C9 | Ordem dos tratamentos sorteada por rodada | 6.3 | **conforme** |
| C10 | Distância entre os tratamentos de um bloco | 7.1 e 7.2 | **divergente** |
| C11 | Base do E-2 | 9.2 | **divergente** |
| C12 | Registro completo do esquema por consulta | 9.4 e 9.6 | **divergente** |
| C13 | Regras de exclusão e censura | 7.4 e 10.4 | **não exercitado** |
| C14 | Sensibilidade 3, troca de ponto de presença | 10.6 e 10.2 | **divergente** |

---

## C1. Pontos de coleta

**Veredito: divergente** · desenho: D2

- **O desenho pede:** 3 redes, uma por integrante, no mesmo período
- **A base mostra:** 1 (rede-c)

Sem réplica entre redes, não há como saber se a direção do efeito se repete. Cada rede era uma réplica do mesmo experimento (6.1); com uma só, o estudo perde o único controle que tinha sobre a particularidade da rede.

## C2. Duração da coleta

**Veredito: divergente** · desenho: D5

- **O desenho pede:** 7 dias no mínimo, 10 recomendados
- **A base mostra:** 9.8 minutos

A unidade de inferência de C1, C2 e E-2 é a janela de 6 h (10.2). Em 10 minutos existe **uma** janela, então o E-2 não tem teste confirmatório — é exatamente o que o `testes_hipotese.md` reporta como *não testável*. Também não há faixa horária (M10) nem dia útil contra fim de semana.

## C3. Intervalo entre rodadas

**Veredito: divergente** · desenho: D4

- **O desenho pede:** 30 minutos
- **A base mostra:** 10 s (mín. 10, máx. 10), 60 rodadas

Rodadas a cada 10 s multiplicam o autoaquecimento: a consulta de uma rodada ainda está no cache do resolvedor quando a próxima chega. É a causa do que a sensibilidade S1 mede, e por que ela derruba a H-a.

## C4. Nomes por rodada e no total

**Veredito: divergente** · desenho: D3 e 9.7

- **O desenho pede:** 80 por rodada (60 de C3 + 10 de C1 + 10 de C2); 180 domínios estratificados
- **A base mostra:** 5 por rodada; 15 domínios, sem estratos

A unidade de inferência de C3 é o nome, então o n do teste primário é 15, e não 180. Com 15 unidades o Wilcoxon exato chega a p = 0,022 no melhor caso observado: dois ou três nomes a mais do outro lado derrubariam a H-a. É a ameaça de conclusão mais forte desta coleta.

## C5. Condições de cache

**Veredito: divergente** · desenho: 9.3 e D1

- **O desenho pede:** C1, C2, C3
- **A base mostra:** C3

Sem C1 e C2 não há cache controlado: a Q2 e a H-b ficam sem dado, e o estado de cache de cada consulta passa a ser desconhecido. A causa é a pendência D1 (zona DNS do grupo), não a coleta.

## C6. Cadência de consultas a serviço de terceiro

**Veredito: divergente** · desenho: 7.2 e enunciado

- **O desenho pede:** no máximo 1 consulta por segundo, por serviço
- **A base mostra:** média de 1.02/s; **pico de 10 consultas no mesmo segundo**

| Serviço | Consultas | Média (/s) | Pico em 1 s |
|---|---|---|---|
| `1.1.1.1` | 600 | 1.02 | 10 |
| `8.8.8.8` | 600 | 1.02 | 10 |

A regra do enunciado é sobre o ritmo, e a média respeitá-la não basta: a rodada inteira dispara em pouco mais de um segundo e depois fica parada. O desenho (7.2) previa espaçar os **blocos** em 1 s — as três consultas de um bloco vão para três serviços diferentes, então basta isso. A correção é no coletor, não na análise, e precisa entrar antes da coleta definitiva.

## C7. Dados que não podem ser versionados

**Veredito: conforme** · desenho: 7.5

- **O desenho pede:** sem IP público da rede, sem sub-rede ECS, identificador opaco por rede
- **A base mostra:** colunas com nome de IP ou ECS: 0; células com endereço IPv4 fora da coluna `resolvedor`: 0; identificadores de rede: `rede-c`

A base versionada não carrega endereço que identifique a rede de ninguém. O único endereço presente é o do serviço medido, que é público.

## C8. Blocos completos

**Veredito: conforme** · desenho: 6.1

- **O desenho pede:** todo bloco recebe todos os tratamentos; bloco incompleto sai inteiro (7.4)
- **A base mostra:** E-1: 300 blocos, todos com 3 resolvedores; E-2: 120 blocos, todos com 5 condições

O pareamento vale: nenhuma comparação atravessa blocos, e nenhum bloco precisou ser descartado por falta de tratamento.

## C9. Ordem dos tratamentos sorteada por rodada

**Veredito: conforme** · desenho: 6.3

- **O desenho pede:** nenhum tratamento sistematicamente primeiro ou último; posição média perto de 13, dentro do que o sorteio explica
- **A base mostra:** posição média entre 11.2 e 14.4 (de 1 a 25), afastamento máximo de 2.1 desvios do centro; 0 rodadas com lacuna na `ordem`

A aleatorização funcionou. É o único controle experimental que sobreviveu integralmente à coleta curta, e é o que separa este estudo de uma observação.

## C10. Distância entre os tratamentos de um bloco

**Veredito: divergente** · desenho: 7.1 e 7.2

- **O desenho pede:** milissegundos: o bloco precisa ver a mesma condição de rede
- **A base mostra:** mediana de 604 ms, máximo de 1794 ms

A ordem é sorteada sobre a **rodada inteira**, e não dentro do bloco, então as três consultas de um nome caem em pontos distantes da rodada — até 1.8 s de intervalo, e não os milissegundos que o desenho escreveu. O efeito prático é pequeno, porque a rodada inteira dura menos de dois segundos, mas as duas coisas se resolvem juntas: espaçar os blocos em 1 s (C6) e sortear a ordem **dentro** do bloco mantém o bloco compacto e a cadência respeitada.

## C11. Base do E-2

**Veredito: divergente** · desenho: 9.2

- **O desenho pede:** 10 nomes de cache quente (C2), para o tempo de recursão não se misturar ao custo de transporte
- **A base mostra:** 1 nome (`google.com`) em C3

Sem a zona (D1) o E-2 roda num domínio real, de cache natural. Com um nome só, não há variação entre nomes para separar o custo do protocolo do comportamento daquele domínio. Como a comparação é dentro da mesma rodada e do mesmo nome, o viés é pequeno — mas o E-2 não mede o que o desenho dizia que ele mediria.

## C12. Registro completo do esquema por consulta

**Veredito: divergente** · desenho: 9.4 e 9.6

- **O desenho pede:** versão do TLS e do HTTP negociadas e tempos de handshake registrados
- **A base mostra:** `tls_versao` no DoT (120 de 240); `tls_versao` no DoH (240 de 240); `http_versao` no DoH (240 de 240); `t_tcp_ms`/`t_tls_ms` no DoH (120 de 120)

A pilha do cliente é um fator de confusão conhecido (9.8). Sem a versão do HTTP não dá para afirmar que o DoH rodou em HTTP/2, e sem os handshakes o custo do DoH não pode ser decomposto como o do DoT (`descritiva.md`, 4).

## C13. Regras de exclusão e censura

**Veredito: não exercitado** · desenho: 7.4 e 10.4

- **O desenho pede:** falha da rede local e falha do domínio saem da conta; timeout censurado em 2.000 ms
- **A base mostra:** 0 falhas em 1500 consultas

Sem falha nenhuma, as regras de exclusão não chegaram a rodar sobre dado real. Elas continuam não testadas em campo, e as sensibilidades S4 (timeouts como 2.000 ms) e a comparação de falhas (M8) ficam sem conteúdo.

## C14. Sensibilidade 3, troca de ponto de presença

**Veredito: divergente** · desenho: 10.6 e 10.2

- **O desenho pede:** excluir as rodadas em que o ponto de presença do 1.1.1.1 mudou
- **A base mostra:** 12 instâncias, 1 sítio; 0 trocas de sítio e 56 de instância em 59 transições

A implementação compara o **sítio** (as letras de `gru22`), e o sítio nunca mudou: S3 não excluiu nada e repetiu o resultado principal. A troca de **instância**, que acontece quase toda rodada, fica fora do que S3 testa. Não é defeito de código — é o alcance da sensibilidade, e precisa estar escrito ao lado do resultado dela.

---

## O que isso muda na leitura dos resultados

As divergências não se somam: elas atingem partes diferentes do estudo.

| Divergência | Atinge | Resultado afetado |
|---|---|---|
| C1, C2, C3, C4 (escala e ritmo da coleta) | poder e independência | o n do teste primário é 15 nomes; o E-2 não tem teste confirmatório; S1 derruba a H-a |
| C5, C11 (sem a zona do grupo) | o que foi medido | Q2 e H-b ficam sem dado; o E-2 mede transporte em cache natural |
| C6 (cadência) | ética e método | a regra do enunciado não foi cumprida no pico; não afeta os números, afeta a conduta |
| C12 (esquema incompleto) | rastreabilidade | o custo do DoH não pode ser decomposto |
| C14 (alcance de S3) | interpretação | a sensibilidade testa menos do que o nome dela sugere |

**O que sobreviveu intacto:** o pareamento por bloco (C8), a aleatorização da ordem (C9), a proximidade temporal dentro do bloco (C10) e a privacidade (C7). São os quatro pontos que fazem deste um experimento, e não uma observação — e eles valem para os 10 minutos coletados.

## Para a coleta definitiva

Em ordem de impacto:

1. **C1 — Pontos de coleta.** 3 redes, uma por integrante, no mesmo período.
2. **C2 — Duração da coleta.** 7 dias no mínimo, 10 recomendados.
3. **C3 — Intervalo entre rodadas.** 30 minutos.
4. **C4 — Nomes por rodada e no total.** 80 por rodada (60 de C3 + 10 de C1 + 10 de C2); 180 domínios estratificados.
5. **C5 — Condições de cache.** C1, C2, C3.
6. **C6 — Cadência de consultas a serviço de terceiro.** no máximo 1 consulta por segundo, por serviço.
7. **C10 — Distância entre os tratamentos de um bloco.** milissegundos: o bloco precisa ver a mesma condição de rede.
8. **C11 — Base do E-2.** 10 nomes de cache quente (C2), para o tempo de recursão não se misturar ao custo de transporte.
9. **C12 — Registro completo do esquema por consulta.** versão do TLS e do HTTP negociadas e tempos de handshake registrados.
10. **C14 — Sensibilidade 3, troca de ponto de presença.** excluir as rodadas em que o ponto de presença do 1.1.1.1 mudou.

A C6 é a única que não depende de tempo nem da zona: é uma mudança no coletor, de espaçar os blocos em um segundo, e pode ser feita agora.

