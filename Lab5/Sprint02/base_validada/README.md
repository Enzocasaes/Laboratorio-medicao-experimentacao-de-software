# Lab05 — Base validada

Versão validada da [base consolidada](../base/README.md) (issue #134). É
**gerada** por [`../validar_base.py`](../validar_base.py) e **não se edita à
mão**. Os números desta rodada estão em
[`relatorio_validacao.md`](relatorio_validacao.md), que é gerado junto.

**Situação em 24/11/2026:** 1.780 consultas verificadas (piloto e provisória),
**nenhuma excluída**, nenhum erro. Restam 97 latências discrepantes
(sinalizadas e investigadas na seção 5) e 2 avisos já conhecidos do piloto.

**Esta é a base validada do experimento.** Pela decisão D13, o lote
`provisoria` (1.500 consultas da rede-c) é o dado da análise, que fica em
[`../resultados/analise_rede-c.md`](../resultados/analise_rede-c.md). Nele:
0 exclusões, 0 erros, 0 avisos; 75 latências discrepantes sinalizadas
(cache frio, seção 5) e nenhuma mudança de sítio do 1.1.1.1.

## 1. Onde fica no fluxo

```text
bruto (Sprint01/dados, Sprint02/dados)      nunca editado; SHA-256 no manifesto
   │  consolidar_base.py                     recusa o que viola o esquema
   ▼
Sprint02/base/                               cópia fiel do bruto, todos os lotes
   │  validar_base.py                        só lê a base
   ▼
Sprint02/base_validada/                      ESTA PASTA: o que a análise lê
   ├── consultas.csv.gz       consultas que ficam + coluna `sinalizacoes`
   ├── exclusoes.csv          consultas que saem, com regra e justificativa
   ├── rodadas.csv            rodadas + n_excluidas, pop_1111, sinalizacoes
   ├── ocorrencias.csv        tudo o que as verificações acharam
   └── relatorio_validacao.md resumo gerado (contagem de cada regra)
```

```bash
# a partir de Lab5/, só biblioteca padrão
python Sprint02/consolidar_base.py          # 1. base a partir do bruto
python Sprint02/validar_base.py             # 2. base validada a partir da base
python Sprint02/validar_base.py --verificar # confere se está em dia (roda na CI)

python Sprint01/coleta/analise.py Sprint02/base_validada/consultas.csv.gz --lote definitiva
```

## 2. Como os originais se preservam

1. **Nada a montante é tocado.** O bruto continua protegido pelo manifesto da
   base. A validação **lê** `Sprint02/base/` e grava só nesta pasta. Se
   `--saida` apontar para a pasta da base, o script se recusa a rodar.
2. **Nada some.** Cada consulta da base está em **exatamente um** dos dois
   arquivos, `consultas.csv.gz` ou `exclusoes.csv`. O script confere isso a
   cada execução e para se a conta não fechar.
3. **Nada é convertido.** As 34 colunas da base vão para `consultas.csv.gz`
   como texto, iguais ao original. A única coluna nova é `sinalizacoes`.
   `arquivo_origem` e `linha_origem` levam de qualquer linha, validada ou
   excluída, de volta à linha do CSV bruto.
4. **A entrada fica registrada.** O relatório guarda o SHA-256 dos quatro
   arquivos da base que foram validados. Se a base mudar sem a validação ser
   refeita, `--verificar` falha na CI.
5. **Mesma entrada, mesmos bytes.** A saída é determinística (gzip sem data),
   então o diff do commit mostra só o que mudou de fato.

## 3. Política de tratamento

Cada regra tem um **nível**, que diz quão grave é o achado, e um
**tratamento**, que diz o que acontece com o dado:

| Tratamento | O que acontece | Quando se usa |
| --- | --- | --- |
| `exclui` | A consulta sai e vai para `exclusoes.csv`, com a regra e a justificativa | Só em dois casos: **registro inválido**, quando o número não é uma medida, e as **regras de exclusão pré-registradas** no planejamento (10.4) e no protocolo (ficha (c)) |
| `sinaliza` | A consulta fica e ganha o código em `sinalizacoes` | Avisos sobre a consulta ou a rodada, e os **discrepantes**, que nunca são removidos automaticamente |
| `registra` | Só entra em `ocorrencias.csv` e no relatório | Achados sobre rodada, execução, dia ou rede que não mudam nenhuma linha |
| `bloqueia` | Nada é gravado | Dado pessoal: IP público inteiro (Planejamento, 9.6) |

Uma consulta que se encaixa em mais de uma regra de exclusão sai uma vez só, e
`exclusoes.csv` lista todas as regras dela. As sinalizações de rodada, como
`pop_mudou`, vão para todas as consultas da rodada, para que uma análise de
sensibilidade filtre direto em `consultas.csv.gz`.

**Uma regra nova de exclusão só entra antes da coleta definitiva.** Inventar
uma regra depois de ver os dados é escolher resultado. Uma regra que surgir
depois entra como `sinaliza` e vira análise de sensibilidade.

## 4. Catálogo de verificações

A lista completa, com a contagem da última execução, está na seção 3 do
[relatório](relatorio_validacao.md). Abaixo, o porquê de cada grupo.

### 4.1 Registro inválido (`erro` · `exclui`)

| Regra | O que pega | Por que exclui |
| --- | --- | --- |
| `campo_obrigatorio_vazio` | Vazio em campo que o coletor sempre preenche (`latencia_ms`, `nome`, versões…) | Sem o valor, a linha não entra em nenhuma comparação |
| `tipo_invalido` | Número ilegível ou não finito (`nan`, `inf`), data sem fuso UTC, `rodada_id` fora de `AAAAMMDDTHHMMSSZ`, lógico diferente de `True`/`False` | A análise corta as janelas de 6 h pelo carimbo, e um carimbo fora de UTC cairia na janela errada |
| `valor_fora_da_faixa` | `latencia_ms` ou `rtt_ms` ≤ 0; handshake, `s_desde_ultima_consulta` ou TTL negativos; `ordem` < 1 | Fisicamente impossível |
| `campo_deveria_estar_vazio` | Campo preenchido onde não se aplica: handshake fora de DoT com conexão nova, `usou_tcp` fora de Do53, `rcode` junto com `erro`, `pop_id` no padrão | Mostra que a linha não é o que a combinação diz ser |
| `combinacao_invalida` | Fora do desenho (5.2): Do53 sem conexão `unica`, E-1 fora de Do53, E-2/DoT/DoH fora dos dois públicos, `posicao` incoerente com a condição de cache | Não pertence a nenhum tratamento |
| `sucesso_inconsistente` | `sucesso` diferente de "`erro` vazio e `rcode` = `NOERROR`" | A coluna é derivada, e divergir significa que a base foi editada |
| `ts_antes_da_rodada` | Carimbo anterior ao início da rodada | Impossível: a rodada começa antes da primeira consulta |
| `duplicata_exata` | As 30 colunas do coletor iguais às de outra linha, inclusive o carimbo ao milissegundo. Pega um CSV copiado para outro lote | É a mesma medida contada duas vezes. Fica a primeira na ordem dos lotes (piloto → provisória → definitiva) |
| `duplicata_de_tratamento` | O mesmo tratamento na mesma `posicao`, duas vezes na rodada | O desenho mede cada um uma vez por rodada. Fica a de menor `ordem` |

A chave repetida (`lote`, `rede_id`, `rodada_id`, `ordem`) nem chega aqui:
a consolidação já a recusa.

### 4.2 Exclusões pré-registradas (`aviso` · `exclui`)

| Regra | Fonte | Critério operacional |
| --- | --- | --- |
| `falha_rede_local` | Planejamento 10.4 | **Todas** as consultas da rodada falharam. A rodada sai de M8 (numerador e denominador) e é reportada à parte, aqui |
| `falha_dominio` | Planejamento 10.4 | Na rodada, **todas** as consultas a um nome falharam em **mais de um** resolvedor. Saem as consultas desse nome nessa rodada, e o domínio fica marcado em `ocorrencias.csv` para reavaliação |
| `rede_interceptada` | ProtocoloExperimental 5.1 e ficha | Do53 num dia em que a ficha da rede deu **(c)**: a porta 53 não chega ao resolvedor nominal, e a rede só entra com DoT e DoH |

Falha num resolvedor enquanto os outros respondem **não** é excluída: é o que
a M8 mede.

### 4.3 Avisos sobre a consulta (`aviso` · `sinaliza`)

`campo_esperado_vazio` (por exemplo, TTL vazio num NOERROR, que pode ser uma
resposta sem registros), `timeout_fora_da_censura`,
`latencia_acima_do_timeout`, `ttl_acima_de_7_dias` (RFC 8767) e
`ts_alem_da_rodada`. Nenhum invalida a medida. Todos ficam visíveis para quem
for analisar.

### 4.4 Valores ausentes

A regra de preenchimento de cada coluna fica numa função só
(`preenchimento()`), e as verificações e o relatório usam essa mesma função:

| Valor | Significado | Exemplo |
| --- | --- | --- |
| `obrigatorio` | Vazio invalida a linha | `latencia_ms`, `nome` |
| `esperado` | Vazio vira aviso | `ttl` num sucesso; `t_tls_ms` em DoT nova com sucesso; `pop_id` do 1.1.1.1 |
| `vazio` | Preenchido invalida a linha | handshake em Do53 ou DoH; `usou_tcp` em DoT/DoH |
| `livre` | Os dois são aceitos | `rtt_ms` (ausência é informação), `interface` (V6), `ttl_autoritativo` (D1) |

A seção 4 do relatório separa, por coluna e lote, o vazio **esperado** do
**inesperado** e dá o motivo de cada vazio esperado.

**Correção no dicionário da base:** o dicionário dizia que `t_tcp_ms`,
`t_tls_ms` e `tls_versao` existem "em DoT/DoH com conexão nova". Os dados e o
medidor mostram que **só o DoT** os preenche, porque o DoH não separa os
tempos de handshake (ProtocoloExperimental, seção 4). O README da base foi
corrigido.

### 4.5 Rodadas, execuções, dias e redes (`aviso` · `sinaliza` ou `registra`)

| Regra | O que pega |
| --- | --- |
| `rodada_incompleta` | Menos consultas que a rodada típica da mesma execução, ou `ordem` com lacuna |
| `ordem_fora_do_tempo` | Carimbos que não crescem com a `ordem` |
| `pop_varia_na_rodada` | Mais de um `pop_id` do 1.1.1.1 na rodada (o PoP é medido uma vez por rodada) |
| `lacuna_entre_rodadas` | Intervalo até a próxima rodada maior que 1,5 vez a mediana: queda ou atraso (6.7) |
| `rodada_sem_execucao` | Rodada de um lote com log que não aparece no log |
| `execucao_interrompida` | Menos rodadas que o `--rodadas` pedido, ou código de saída diferente de 0 |
| `rodadas_divergem_do_log` | Número de rodadas no CSV diferente do número registrado no log |
| `ambiente_misto` | Mais de uma combinação de versões na mesma rede e lote |
| `mais_de_um_padrao` | Mais de um resolvedor padrão na rede (R6, V8) |
| `dia_sem_ficha` | Dia com consultas e sem ficha (6.6 pede uma por dia) |
| `classificacao_mudou` | A classificação da rede mudou entre fichas |

### 4.6 Privacidade (`erro` · `bloqueia`)

`ip_publico_exposto` procura IPv4 global inteiro em **todos** os campos das
quatro tabelas. 1.1.1.1, 1.0.0.1, 8.8.8.8 e 8.8.4.4 são permitidos, assim
como os endereços privados. Se achar algum, nada é gravado, e a mensagem
mostra o endereço truncado (`177.10.20.x`), nunca inteiro. A correção é na
origem.

## 5. Discrepantes: como se detectam e o que se fez com eles

**Método.** Cercas de Tukey **extremas** (Q1 − 3·IQR, Q3 + 3·IQR) sobre o
**log** da latência, só com os sucessos. O cálculo é por lote, rede e
tratamento (experimento, resolvedor, protocolo, conexão, condição), e
tratamentos com menos de 20 sucessos ficam de fora. Os quartis usam a mesma
interpolação linear da análise (`statistics.quantiles`).

- **Por que log.** A latência de DNS é assimétrica: um acerto de cache e uma
  recursão completa diferem por uma ordem de grandeza. Na escala linear, toda
  recursão viraria discrepante.
- **Por que 3 IQR.** Com 1,5 IQR, numa distribuição de cauda longa, a cerca
  marca a própria cauda que o p95 quer medir.
- **Por que por tratamento.** Comparar Do53 com DoT com conexão nova marcaria
  o handshake como anomalia.

Há uma segunda verificação, por rodada (`rodada_discrepante`): uma rodada
cujas consultas estão, na mediana, longe da mediana dos seus tratamentos
indica um evento de rede, e não um resolvedor lento. Ela exige pelo menos 10
rodadas por rede.

**Tratamento: sinalizar, investigar, não remover.** O discrepante fica na base
validada com `latencia_discrepante` em `sinalizacoes`. A análise primária usa
mediana, que já é robusta a ele, e uma análise de sensibilidade pode filtrar
pelo código.

**O que a investigação mostrou na base atual (97 discrepantes, todos acima):**

- **São recursões, não erros.** 87 dos 97 (90%) chegaram com o **TTL cheio**,
  o maior TTL que aquele resolvedor deu para aquele nome. Ou seja, a resposta
  tinha acabado de ser buscada no autoritativo. Entre as consultas não
  discrepantes do E-1, a proporção é de 23%. É a falta de cache que C3
  (domínios reais) existe para capturar. Remover esses pontos deixaria o
  resolvedor mais rápido do que é.
- **Concentram-se em nomes de TTL curto ou pouco populares:** `gnu.org` (32),
  `google.com` (20, o nome do E-2), `sqlite.org` (11).
- **O padrão da rede-c** tem mediana de 3,4 ms, porque o roteador responde do
  cache. Com cache frio, a latência sobe para 130–160 ms. É a maior razão
  entre discrepante e mediana da base, e é coerente com um encaminhador local.
- **No piloto, 16 dos 22** estão numa só rodada (`20261119T024408Z`). Nela o
  RTT subiu de 7–10 ms para 60 ms no 1.1.1.1 e de 4–6 ms para 134 ms no
  gateway, enquanto no 8.8.8.8 ficou em 16 ms: um evento de rede local. Com 4 rodadas, a regra `rodada_discrepante` não pode
  ser avaliada, então isso fica registrado aqui. O piloto não entra na análise
  confirmatória.

## 6. Ponto de presença: sítio, não instância

O `pop_id` do 1.1.1.1 vem como `gru22`. **[Hipótese]** As letras são o sítio
(código IATA, São Paulo) e o número é a máquina dentro dele. Na provisória, o
`id.server` passou por **12 instâncias de `gru` em 60 rodadas**, mudando em 56
delas, num intervalo de 10 minutos. A latência mediana do 1.1.1.1 ficou entre
13 e 16 ms em todas as instâncias. Isso é balanceamento de carga dentro do
mesmo ponto de presença, e não troca de rota.

Por isso `pop_mudou` compara o **sítio**. Comparado o valor inteiro, a análise
de sensibilidade 3 (Planejamento 10.6, "excluir as rodadas em que o ponto de
presença mudou") descartaria 93% das rodadas sem que nenhuma rota tivesse
mudado. As trocas de instância continuam contadas na seção 7 do relatório, e
`rodadas.csv` guarda o `pop_1111` de cada rodada, para quem quiser refazer a
análise com o critério estrito.

## 7. Avisos conhecidos na base atual

| Regra | Onde | Situação |
| --- | --- | --- |
| `mais_de_um_padrao` | piloto | Conhecido (V8): o piloto mediu dois padrões. Resolvido para a definitiva por R6 |
| `lacuna_entre_rodadas` | piloto | As rodadas do piloto foram disparadas à mão, sem intervalo fixo |

## 8. Dicionário das colunas novas

| Arquivo | Coluna | Descrição |
| --- | --- | --- |
| `consultas.csv.gz` | `sinalizacoes` | Códigos das regras `sinaliza` que a consulta ou a rodada dela dispararam, separados por `;`, na ordem do catálogo. Vazio = nenhuma |
| `exclusoes.csv` | `lote`, `rede_id`, `rodada_id`, `ordem` | Chave da consulta excluída (a mesma da base) |
| | `regra` | Regra(s) `exclui` que a tiraram, separadas por `;` |
| | `justificativa` | Descrição da regra, com o campo, o valor e o detalhe que a dispararam |
| | `arquivo_origem`, `linha_origem` | Linha do CSV bruto |
| `rodadas.csv` | `n_excluidas` | Consultas da rodada que foram para `exclusoes.csv` |
| | `pop_1111` | `pop_id` do 1.1.1.1 na rodada (vazio sem 1.1.1.1) |
| | `sinalizacoes` | Regras `sinaliza` de escopo rodada |
| `ocorrencias.csv` | `regra`, `nivel`, `tratamento`, `escopo` | A regra e como ela é tratada (seção 3) |
| | `lote`, `rede_id`, `rodada_id`, `ordem` | Onde: a consulta, ou só a rodada, ou só a rede |
| | `coluna`, `valor`, `detalhe` | O que disparou a regra. Um IP é gravado truncado |

As demais colunas de `consultas.csv.gz` e `rodadas.csv` são as da base
([dicionário](../base/README.md#5-dicionário-de-dados)).
