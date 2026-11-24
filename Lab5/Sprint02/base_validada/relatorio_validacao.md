# Lab05 — Relatório de validação da base

> Gerado por `python Sprint02/validar_base.py`. **Não editar à mão.** As regras e o tratamento estão em [`README.md`](README.md).

## 1. Entrada

Base consolidada de [`../base/`](../base/README.md), lida sem alteração:

| Arquivo | SHA-256 (LF) |
| --- | --- |
| `consultas.csv.gz` | `0a6af735150fe40f787dc75c20cba2ae6d2f633e6c3f813604db6e264d811781` |
| `rodadas.csv` | `f198c988d86314acdd2e24f902eac7b522ff22293be00415bf1ab3c2f5e9257e` |
| `execucoes.csv` | `8072c54cd57f5364f12103f8f4c8f4acd81195915e56f285e434923a05910ad8` |
| `fichas.csv` | `98a34560cda0e956f73007549d139bd6bef4f5df26a3fcfd781f51ffa2053ace` |

## 2. Resultado por lote

| Lote | Consultas na base | Excluídas | Na base validada | Com sinalização |
| --- | --- | --- | --- | --- |
| piloto | 280 | 0 | 280 | 22 |
| provisoria | 1500 | 0 | 1500 | 75 |

Base validada + exclusões = 1780 + 0 = 1780 consultas, as mesmas 1780 da base (conferido a cada execução).

## 3. Verificações realizadas

Toda regra do catálogo roda sobre toda a base; zero quer dizer que a verificação rodou e não achou nada.

| Regra | Nível | Tratamento | Escopo | Ocorrências | O que verifica |
| --- | --- | --- | --- | --- | --- |
| `campo_obrigatorio_vazio` | erro | exclui | consulta | 0 | Campo que o coletor sempre preenche esta' vazio |
| `tipo_invalido` | erro | exclui | consulta | 0 | Valor que nao e' do tipo da coluna (numero, inteiro, data UTC, rodada_id, logico) |
| `valor_fora_da_faixa` | erro | exclui | consulta | 0 | Numero fisicamente impossivel: latencia ou RTT <= 0, tempo ou TTL negativo, ordem < 1 |
| `campo_deveria_estar_vazio` | erro | exclui | consulta | 0 | Campo preenchido onde nao se aplica (handshake fora de DoT nova, usou_tcp fora de Do53, rcode junto com erro...) |
| `combinacao_invalida` | erro | exclui | consulta | 0 | Combinacao fora do desenho (5.2): Do53 sem conexao unica, E-1 fora de Do53, E-2/DoT/DoH fora dos publicos, posicao incoerente com a condicao |
| `sucesso_inconsistente` | erro | exclui | consulta | 0 | A coluna `sucesso` nao segue a regra erro vazio e rcode NOERROR |
| `ts_antes_da_rodada` | erro | exclui | consulta | 0 | Carimbo da consulta anterior ao inicio da rodada |
| `duplicata_exata` | erro | exclui | consulta | 0 | As 30 colunas do coletor repetem outra consulta (mesmo carimbo ao milissegundo); fica a primeira |
| `duplicata_de_tratamento` | erro | exclui | consulta | 0 | O mesmo tratamento na mesma posicao aparece duas vezes na rodada; fica a de menor ordem |
| `falha_rede_local` | aviso | exclui | rodada | 0 | Todas as consultas da rodada falharam: falha da rede local (Planejamento, 10.4) |
| `falha_dominio` | aviso | exclui | consulta | 0 | O nome falhou em todos os resolvedores na rodada: falha do dominio (Planejamento, 10.4) |
| `rede_interceptada` | aviso | exclui | consulta | 0 | Do53 num dia em que a ficha classificou a rede como (c): a porta 53 nao chega ao resolvedor nominal |
| `campo_esperado_vazio` | aviso | sinaliza | consulta | 0 | Campo que deveria vir preenchido esta' vazio, sem invalidar a medida (TTL sem resposta, handshake de DoT, pop_id do 1.1.1.1, usou_tcp) |
| `timeout_fora_da_censura` | aviso | sinaliza | consulta | 0 | Timeout com latencia diferente de 2.000 ms (a censura da 10.4) |
| `latencia_acima_do_timeout` | aviso | sinaliza | consulta | 0 | Sucesso com latencia acima de 2.000 ms |
| `ttl_acima_de_7_dias` | aviso | sinaliza | consulta | 0 | TTL acima de 7 dias (RFC 8767) |
| `ts_alem_da_rodada` | aviso | sinaliza | consulta | 0 | Carimbo mais de 30 min depois do inicio da rodada |
| `latencia_discrepante` | info | sinaliza | consulta | 97 | Latencia fora das cercas de 3 IQR (escala log) do seu tratamento, na rede e no lote |
| `rodada_discrepante` | info | sinaliza | rodada | 0 | A rodada inteira esta' deslocada: mediana dos residuos fora das cercas de 3 IQR das rodadas |
| `pop_mudou` | info | sinaliza | rodada | 0 | O sitio do 1.1.1.1 (letras do pop_id, `gru` em `gru22`) mudou em relacao a rodada anterior (sensibilidade 3, secao 10.6) |
| `rodada_incompleta` | aviso | sinaliza | rodada | 0 | Menos consultas que as outras rodadas da mesma execucao, ou `ordem` com lacuna |
| `ordem_fora_do_tempo` | aviso | registra | rodada | 0 | Os carimbos nao crescem com a `ordem` dentro da rodada |
| `pop_varia_na_rodada` | aviso | sinaliza | rodada | 0 | Mais de um pop_id do 1.1.1.1 na mesma rodada (o pop e' medido uma vez por rodada) |
| `lacuna_entre_rodadas` | aviso | registra | rodada | 1 | Intervalo ate' a rodada seguinte maior que 1,5 vez a mediana dos intervalos |
| `rodada_sem_execucao` | aviso | registra | rodada | 0 | Rodada de um lote com log que nao aparece no log |
| `execucao_interrompida` | aviso | registra | execucao | 0 | O coletor terminou antes das rodadas previstas ou sem codigo de saida 0 |
| `rodadas_divergem_do_log` | aviso | registra | execucao | 0 | Numero de rodadas no CSV diferente do numero de rodadas que o log registra |
| `ambiente_misto` | aviso | registra | rede | 0 | Mais de uma combinacao de versoes (Python, OpenSSL, dnspython, httpx) na mesma rede e lote |
| `mais_de_um_padrao` | aviso | registra | rede | 1 | Mais de um resolvedor padrao na mesma rede (R6 exige exatamente um) |
| `dia_sem_ficha` | aviso | registra | dia | 0 | Dia com consultas e sem ficha de rede (6.6 pede uma por dia) |
| `classificacao_mudou` | aviso | registra | rede | 0 | A classificacao da rede mudou entre fichas |
| `ip_publico_exposto` | erro | bloqueia | base | 0 | Endereco IP publico inteiro em algum campo (Planejamento, 9.6) |

## 4. Valores ausentes

Vazio **esperado** é o que o dicionário prevê para aquela linha (por exemplo, handshake em Do53); **inesperado** é o vazio num campo que deveria vir preenchido. Só colunas com algum vazio aparecem.

| Coluna | Lote | Vazios | Esperados | Inesperados | Por que fica vazio |
| --- | --- | --- | --- | --- | --- |
| `t_tcp_ms` | piloto | 272 de 280 | 272 | 0 | so' DoT com conexao nova; o DoH nao separa os tempos |
| `t_tcp_ms` | provisoria | 1380 de 1500 | 1380 | 0 | so' DoT com conexao nova; o DoH nao separa os tempos |
| `t_tls_ms` | piloto | 272 de 280 | 272 | 0 | so' DoT com conexao nova; o DoH nao separa os tempos |
| `t_tls_ms` | provisoria | 1380 de 1500 | 1380 | 0 | so' DoT com conexao nova; o DoH nao separa os tempos |
| `tls_versao` | piloto | 272 de 280 | 272 | 0 | so' DoT com conexao nova |
| `tls_versao` | provisoria | 1380 de 1500 | 1380 | 0 | so' DoT com conexao nova |
| `http_versao` | piloto | 280 de 280 | 280 | 0 | nunca gravada (V5) |
| `http_versao` | provisoria | 1500 de 1500 | 1500 | 0 | nunca gravada (V5) |
| `erro` | piloto | 280 de 280 | 280 | 0 | vazio = sem erro de transporte |
| `erro` | provisoria | 1500 de 1500 | 1500 | 0 | vazio = sem erro de transporte |
| `usou_tcp` | piloto | 32 de 280 | 32 | 0 | so' Do53 |
| `usou_tcp` | provisoria | 480 de 1500 | 480 | 0 | so' Do53 |
| `ttl_autoritativo` | piloto | 280 de 280 | 280 | 0 | depende da zona do grupo (D1) |
| `ttl_autoritativo` | provisoria | 1500 de 1500 | 1500 | 0 | depende da zona do grupo (D1) |
| `s_desde_ultima_consulta` | piloto | 120 de 280 | 120 | 0 | primeira consulta do par em cada execucao (V10) |
| `s_desde_ultima_consulta` | provisoria | 45 de 1500 | 45 | 0 | primeira consulta do par em cada execucao (V10) |
| `pop_id` | piloto | 200 de 280 | 200 | 0 | so' o 1.1.1.1 responde id.server (DefinicaoDasMetricas 2.4) |
| `pop_id` | provisoria | 900 de 1500 | 900 | 0 | so' o 1.1.1.1 responde id.server (DefinicaoDasMetricas 2.4) |
| `interface` | provisoria | 1500 de 1500 | 1500 | 0 | vazia no Windows (V6) |

## 5. Exclusões

Nenhuma consulta excluída.

## 6. Discrepantes (investigados, não removidos)

Cercas de Tukey com 3 IQR sobre o log da latência dos sucessos, por lote, rede e tratamento (experimento, resolvedor, protocolo, conexão, condição). Avaliados 17 tratamentos; 10 ficaram de fora por terem menos de 20 sucessos.

| Lote | Rede | Exp. | Resolvedor | Protocolo | Conexão | Cond. | Discrepantes | Sucessos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| piloto | piloto-c | E-1 | 1.1.1.1 | Do53 | unica | C3 | 8 | 60 |
| piloto | piloto-c | E-1 | 8.8.8.8 | Do53 | unica | C3 | 1 | 60 |
| piloto | piloto-c | E-1 | padrao-configurado | Do53 | unica | C3 | 9 | 60 |
| piloto | piloto-c | E-1 | padrao-gateway | Do53 | unica | C3 | 4 | 60 |
| provisoria | rede-c | E-1 | 1.1.1.1 | Do53 | unica | C3 | 22 | 300 |
| provisoria | rede-c | E-1 | 8.8.8.8 | Do53 | unica | C3 | 34 | 300 |
| provisoria | rede-c | E-1 | padrao | Do53 | unica | C3 | 4 | 300 |
| provisoria | rede-c | E-2 | 1.1.1.1 | DoT | nova | C3 | 1 | 60 |
| provisoria | rede-c | E-2 | 8.8.8.8 | Do53 | unica | C3 | 8 | 60 |
| provisoria | rede-c | E-2 | 8.8.8.8 | DoH | reaproveitada | C3 | 2 | 60 |
| provisoria | rede-c | E-2 | 8.8.8.8 | DoT | reaproveitada | C3 | 4 | 60 |

Os mais distantes da mediana do tratamento:

| Lote | Rodada | Resolvedor | Protocolo | Nome | Latência (ms) | Mediana do trat. (ms) | TTL | RTT (ms) | Origem |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| provisoria | 20261124T171957Z | padrao | Do53/unica | gnu.org | 159.9 | 3.4 | 300 | 17.1 | Sprint02/dados/provisoria/rede-c.csv:662 |
| provisoria | 20261124T172457Z | padrao | Do53/unica | gnu.org | 159.4 | 3.4 | 300 | 14.8 | Sprint02/dados/provisoria/rede-c.csv:1410 |
| provisoria | 20261124T172417Z | padrao | Do53/unica | mercadolivre.com.br | 152.6 | 3.4 | 60 | 2.7 | Sprint02/dados/provisoria/rede-c.csv:1315 |
| piloto | 20261119T024408Z | 1.1.1.1 | Do53/unica | gnu.org | 375.7 | 8.8 | 300 | 60.1 | Sprint01/dados/piloto_c.csv:200 |
| provisoria | 20261124T171947Z | padrao | Do53/unica | sqlite.org | 130.5 | 3.4 | 6 | 16.9 | Sprint02/dados/provisoria/rede-c.csv:649 |
| piloto | 20261119T024408Z | padrao-configurado | Do53/unica | postgresql.org | 268.5 | 7.0 | 1800 | 59.4 | Sprint01/dados/piloto_c.csv:193 |
| piloto | 20261119T024714Z | padrao-configurado | Do53/unica | postgresql.org | 221.1 | 7.0 | 1800 | 8.1 | Sprint01/dados/piloto_c.csv:248 |
| provisoria | 20261124T172347Z | 8.8.8.8 | Do53/unica | postgresql.org | 448.4 | 16.5 | 1800 | 17.3 | Sprint02/dados/provisoria/rede-c.csv:1238 |
| piloto | 20261119T024408Z | 1.1.1.1 | Do53/unica | sqlite.org | 202.8 | 8.8 | 283 | 60.1 | Sprint01/dados/piloto_c.csv:183 |
| piloto | 20261119T023725Z | padrao-configurado | Do53/unica | sqlite.org | 154.1 | 7.0 | 300 | 6.2 | Sprint01/dados/piloto_c.csv:17 |
| piloto | 20261119T024408Z | padrao-gateway | Do53/unica | gnu.org | 197.3 | 9.1 | 300 | 134.4 | Sprint01/dados/piloto_c.csv:154 |
| provisoria | 20261124T171557Z | 1.1.1.1 | Do53/unica | gnu.org | 282.5 | 14.3 | 300 | 27.1 | Sprint02/dados/provisoria/rede-c.csv:58 |
| provisoria | 20261124T172357Z | 8.8.8.8 | Do53/unica | gnu.org | 318.1 | 16.5 | 300 | 35.5 | Sprint02/dados/provisoria/rede-c.csv:1255 |
| provisoria | 20261124T172057Z | 1.1.1.1 | Do53/unica | gnu.org | 276.4 | 14.3 | 300 | 32.8 | Sprint02/dados/provisoria/rede-c.csv:820 |
| provisoria | 20261124T172047Z | 1.1.1.1 | Do53/unica | sqlite.org | 261.7 | 14.3 | 300 | 14.9 | Sprint02/dados/provisoria/rede-c.csv:784 |

Rodadas inteiras deslocadas (`rodada_discrepante`, mínimo de 10 rodadas por rede): 0.

## 7. Ponto de presença do 1.1.1.1

Uma linha por rede. `pop_mudou` compara o **sítio** (as letras do `pop_id`); a troca de **instância** dentro do mesmo sítio (`gru11` → `gru19`) só é contada aqui, sem sinalizar a rodada.

| Lote | Rede | Rodadas | Sítios | Mudanças de sítio | Instâncias | Trocas de instância | Instâncias (rodadas) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| piloto | piloto-c | 4 | cnf | 0 | 1 | 0 | cnf01 (4) |
| provisoria | rede-c | 60 | gru | 0 | 12 | 56 | gru11 (11), gru19 (8), gru20 (7), gru13 (6), gru21 (5), gru17 (5), gru02 (4), gru08 (4), gru23 (3), gru22 (3), gru18 (3), gru07 (1) |

## 8. Rodadas, execuções, dias e redes

| Regra | Lote | Rede | Rodada | Detalhe |
| --- | --- | --- | --- | --- |
| `lacuna_entre_rodadas` | piloto | piloto-c | 20261119T023925Z | 283 s ate' 20261119T024408Z (mediana 186 s) |
| `mais_de_um_padrao` | piloto | piloto-c | — | padrao-configurado;padrao-gateway |
