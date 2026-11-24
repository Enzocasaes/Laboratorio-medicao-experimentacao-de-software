# Lab05 — Base de dados experimental

Base consolidada de todas as coletas do Lab05 (issue #133). É **gerada** a
partir dos dados brutos por [`../consolidar_base.py`](../consolidar_base.py) e
**não se edita à mão**. Quem quiser mudar um número muda o bruto, com o motivo
documentado, e regenera.

**Situação em 24/11/2026:** a base tem o **piloto** da Sprint 01 (280 consultas)
e a coleta **provisória** da rede-c (1.500 consultas). Pela decisão **D13**, a
provisória é a base do experimento: não haverá coleta de 7 dias, e o lote
**definitivo** fica vazio (ProtocoloExperimental, 8.1).

**A análise lê a base validada, e não esta.** Esta pasta é a cópia fiel do
bruto, com tudo o que foi coletado. A verificação de integridade (ausentes,
duplicatas, tipos, valores inválidos, discrepantes) e as exclusões
documentadas ficam em [`../base_validada/`](../base_validada/README.md)
(issue #134).

## 1. Organização

```text
Lab5/
├── Sprint01/dados/              BRUTO · lote "piloto"
│   ├── piloto_c.csv                consultas
│   └── rede_piloto-c.json          ficha da rede
├── Sprint02/dados/              BRUTO · lote "definitiva" (rede-a, rede-b, rede-c)
│   ├── rede-X.csv                  consultas
│   ├── rede-X.log                  saída de erros do coletor
│   ├── rede-X_ficha_AAAAMMDD.json  uma ficha por dia
│   └── provisoria/              BRUTO · lote "provisoria" (mesmos nomes)
├── Sprint02/base/               GERADO · esta pasta
│   ├── arquivos_brutos.csv         manifesto com SHA-256 de cada bruto
│   ├── consultas.csv.gz            todas as consultas, de todos os lotes
│   ├── rodadas.csv                 uma linha por rodada
│   ├── execucoes.csv               uma linha por execução do coletor
│   └── fichas.csv                  uma linha por ficha e resolvedor padrão
└── Sprint02/base_validada/      GERADO · validar_base.py, a partir desta pasta
    ├── consultas.csv.gz            consultas válidas + `sinalizacoes`
    └── exclusoes.csv, ...          ver o README de lá
```

Os **três lotes** nunca se misturam numa análise:

| Lote | O que é | Entra na análise confirmatória? |
| --- | --- | --- |
| `piloto` | Sprint 01: 4 rodadas, prova de que o instrumento mede ([README](../../Sprint01/dados/README.md)) | Não |
| `provisoria` | Coleta curta da rede-c, fora do protocolo ([README](../dados/provisoria/README.md)) | **Sim**, pela decisão D13, com o alcance limitado descrito no README do lote |
| `definitiva` | Coleta de 7 dias, seção 6.5 do protocolo | Não foi feita (D13) |

O mesmo `rede_id` pode aparecer em dois lotes (a `rede-c` provisória e a
definitiva). Por isso a chave de uma consulta inclui o `lote` (seção 4).

## 2. Como usar

Todos os comandos rodam a partir de `Lab5/` e usam só a biblioteca padrão do Python.

```bash
# regenerar a base depois de acrescentar ou corrigir dados brutos
python Sprint02/consolidar_base.py

# conferir que o bruto não mudou e que a base está em dia (também roda na CI)
python Sprint02/consolidar_base.py --verificar

# validar a base (gera Sprint02/base_validada/)
python Sprint02/validar_base.py

# analisar um lote da base validada
python Sprint01/coleta/analise.py Sprint02/base_validada/consultas.csv.gz --lote definitiva
```

No Windows, a análise precisa de `PYTHONUTF8=1` para imprimir no terminal
(o relatório tem `Δ`). Com `--md`, o arquivo sai em UTF-8 e não precisa disso.

Sem `--lote`, o `analise.py` se recusa a ler a base, porque ela tem mais de um
lote. Os CSV brutos continuam sendo lidos como antes, sem `--lote`.

Ler em pandas, se preferir:

```python
import pandas as pd
consultas = pd.read_csv("Sprint02/base_validada/consultas.csv.gz", dtype=str, keep_default_na=False)
definitiva = consultas[consultas.lote == "definitiva"]
```

**Reprodutibilidade conferida:** o relatório versionado do piloto
([`analise_piloto_c.md`](../../Sprint01/dados/analise_piloto_c.md)) sai idêntico,
byte a byte, quando gerado a partir da base ou da base validada com `--lote piloto`.

## 3. Preservação dos dados brutos

1. **O bruto não é editado.** O coletor só acrescenta linhas, e ninguém abre o
   CSV num editor de planilha para salvá-lo de volta. O Excel reescreve números
   e datas. Erros se registram no README do lote e no log, nunca apagando linhas.
2. **O manifesto prova isso.** `arquivos_brutos.csv` guarda o SHA-256 de cada
   bruto. `--verificar` recalcula os hashes e falha se um bruto **mudou**, **sumiu**
   ou **apareceu** sem a base ser regenerada. A CI roda essa verificação a cada
   push. Durante a coleta definitiva o CSV cresce, então o hash muda a cada
   regeneração. O diff do manifesto no commit mostra exatamente quais arquivos
   cresceram.
3. **Hash com LF.** O SHA-256 é calculado com os finais de linha normalizados
   para LF. Com `core.autocrlf=true`, o Git entrega CRLF no Windows e LF no
   Linux, e sem a normalização o mesmo arquivo teria dois hashes.
4. **A base copia, não converte.** Os 30 campos brutos vão para
   `consultas.csv.gz` como texto, sem arredondar nem reformatar
   (`185.35530000008293` continua assim). Cada linha aponta o arquivo e a linha
   de onde veio (`arquivo_origem`, `linha_origem`).
5. **O bruto que viola o esquema é recusado.** A consolidação para sem gravar
   nada em qualquer um destes casos: cabeçalho diferente do coletor, número de
   campos errado, valor fora do domínio, número ou data ilegível, `rede_id`
   diferente do nome do arquivo, ou consulta repetida.

**Por que `.csv.gz`.** A coleta definitiva tem cerca de 340 consultas por rodada,
336 rodadas e 3 redes. São ~340 mil linhas e ~85 MB de CSV, perto do limite
de 100 MB por arquivo do GitHub, e a base duplicaria isso no repositório.
Comprimido, o arquivo fica cerca de 10 vezes menor e continua sendo CSV: o
pandas, o `analise.py` e o `zcat` leem direto. O gzip é gravado sem data
(`mtime=0`), então o mesmo conteúdo sempre dá os mesmos bytes. As tabelas
pequenas ficam em CSV simples, para o diff ser legível.

## 4. Convenções

- **Nomes de colunas:** `snake_case`, ASCII, sem acento, em português. O teste
  `test_colunas_em_snake_case_ascii` garante isso.
- **Unidade no sufixo:** `_ms` (milissegundos), `_s` (segundos), `_utc`
  (ISO 8601 em UTC). Contagens começam com `n_`.
  **Exceção herdada:** `s_desde_ultima_consulta`, em segundos, tem a unidade no
  prefixo. O nome vem do esquema da seção 9.6, está no coletor e nos três
  conjuntos de CSV brutos, e não foi renomeado para a base não divergir do bruto.
- **Esquema único nas três redes:** as 30 colunas do coletor
  (`medidor.COLUNAS`), na mesma ordem. A consolidação compara o cabeçalho de
  cada CSV bruto com essa lista, e o teste `test_esquema_igual_ao_do_coletor`
  garante que a cópia da lista em `consolidar_base.py` não diverge do coletor.
- **Valores lógicos:** `True` / `False`, como o Python grava.
- **Vazio** significa "não se aplica" ou "não medido", nunca zero. A tabela abaixo
  diz qual dos dois em cada coluna.
- **Caminhos** (`arquivo_origem`, `caminho`) são relativos a `Lab5/`, com `/`.
- **Codificação:** UTF-8, separador `,`, aspas só quando necessário, fim de linha LF.

## 5. Dicionário de dados

### 5.1 `consultas.csv.gz` — uma linha por consulta DNS

**Chave:** `lote` + `rede_id` + `rodada_id` + `ordem`.
**Bloco de pareamento** (seção 7.4): `lote` + `rede_id` + `rodada_id` + `posicao`.

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `lote` | texto | `piloto`, `provisoria` ou `definitiva` (seção 1). *Acrescentada na base* |
| `ts_utc` | data-hora | Fim da consulta, ISO 8601 em UTC com milissegundos |
| `rede_id` | texto | `rede-a`, `rede-b`, `rede-c` ou `piloto-c`. Nunca nome de pessoa ou cidade |
| `rodada_id` | texto | Início da rodada em UTC, `AAAAMMDDTHHMMSSZ` |
| `ordem` | inteiro | Posição da consulta na rodada, depois do sorteio (1 = primeira) |
| `experimento` | texto | `E-1` (resolvedores, Do53) ou `E-2` (protocolos) |
| `resolvedor` | texto | `1.1.1.1`, `8.8.8.8` ou o identificador do padrão da rede (`padrao`; no piloto, `padrao-gateway` e `padrao-configurado`) |
| `protocolo` | texto | `Do53`, `DoT` ou `DoH` |
| `conexao` | texto | `unica` (Do53), `nova` (handshake incluído) ou `reaproveitada` |
| `condicao_cache` | texto | `C1` (nome único, sem cache), `C2` (aquecido), `C3` (domínio real) |
| `nome` | texto | Nome consultado (tipo A) |
| `posicao` | texto | Unidade de pareamento: igual a `nome` em C2 e C3; `c1-0`, `c1-1`, … em C1 |
| `latencia_ms` | decimal, ms | **M1.** Do envio da consulta à resposta. Em conexão `nova` inclui TCP e TLS. Em timeout vale 2.000 (censura, seção 10.4) |
| `t_tcp_ms` | decimal, ms | Handshake TCP. Só em **DoT** com conexão `nova`; vazio nos demais. O DoH não separa os tempos (ProtocoloExperimental, seção 4) |
| `t_tls_ms` | decimal, ms | Handshake TLS. Idem |
| `tls_versao` | texto | Versão TLS negociada. Idem |
| `http_versao` | texto | Versão HTTP do DoH. **Sempre vazia hoje** (divergência V5) |
| `rcode` | texto | Código de resposta DNS (`NOERROR`, `NXDOMAIN`, `SERVFAIL`…). Vazio em falha de transporte |
| `erro` | texto | Vazio = sem erro de transporte. `timeout` ou o nome da exceção |
| `usou_tcp` | lógico | Do53: a resposta veio truncada e a consulta foi refeita em TCP. Vazio em DoT/DoH |
| `ttl` | inteiro, s | Menor TTL da seção de resposta |
| `ttl_autoritativo` | inteiro, s | TTL configurado na zona do grupo, para a M6. **Sempre vazio hoje**: depende da zona (D1) |
| `s_desde_ultima_consulta` | decimal, s | Tempo desde a consulta anterior ao mesmo par (resolvedor, nome), incluindo o aquecimento de C2. Vazio na primeira de cada execução (zera ao reiniciar o coletor, V10) |
| `pop_id` | texto | Ponto de presença (`id.server`, CHAOS) medido no início da rodada. Só a Cloudflare responde: no Google e no padrão fica vazio (DefinicaoDasMetricas, 2.4) |
| `rtt_ms` | decimal, ms | **M11.** RTT de conexão TCP ao resolvedor no início da rodada: porta 443 nos públicos, 53 no padrão. Não comparar entre resolvedores (DefinicaoDasMetricas, 2.3) |
| `interface` | texto | Interface de rede ativa. **Vazia no Windows** (V6); o meio (cabo ou Wi-Fi) está no README do lote |
| `versao_python` | texto | Versão do Python do coletor |
| `versao_openssl` | texto | Versão do OpenSSL |
| `versao_dnspython` | texto | Versão da dnspython |
| `versao_httpx` | texto | Versão do `httpx2` (cliente do DoH) |
| `reconectou` | lógico | **M12.** A medida foi refeita porque o servidor derrubou a conexão ociosa |
| `sucesso` | lógico | `erro` vazio **e** `rcode` = `NOERROR`. A mesma regra de `Medida.sucesso`. *Derivada na base* |
| `arquivo_origem` | texto | CSV bruto de onde veio a linha. *Acrescentada na base* |
| `linha_origem` | inteiro | Linha no CSV bruto (o cabeçalho é a 1). *Acrescentada na base* |

As colunas de `ts_utc` a `reconectou` são as 30 do coletor, na mesma ordem e
com o mesmo conteúdo do bruto.

### 5.2 `rodadas.csv` — uma linha por rodada

**Chave:** `lote` + `rede_id` + `rodada_id`. Derivada de `consultas` e do log.

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `lote`, `rede_id`, `rodada_id` | texto | Como em `consultas` |
| `execucao` | inteiro | Execução do coletor que fez a rodada (liga com `execucoes.csv`). Vazio sem log (piloto) |
| `inicio_utc` | data-hora | Menor `ts_utc` das consultas da rodada |
| `fim_utc` | data-hora | Maior `ts_utc` |
| `subconjunto_c3` | texto | Subconjunto de C3 consultado, `k/3` (rodízio V1), tirado do log. Vazio sem log |
| `n_consultas` | inteiro | Consultas gravadas |
| `n_falhas` | inteiro | Consultas com `sucesso` = `False` |
| `n_reconexoes` | inteiro | Consultas com `reconectou` = `True` |
| `duracao_s` | decimal, s | Duração da rodada segundo o log (inclui o aquecimento). Vazio sem log |
| `arquivo_origem` | texto | CSV bruto |

### 5.3 `execucoes.csv` — uma linha por execução do coletor

Cada vez que o coletor inicia (inclusive ao retomar depois de uma queda, 6.7),
o log ganha uma linha `rede=… interface=… semente=…`, e é ela que abre uma
execução. É esta tabela que torna a ordem dos tratamentos reprodutível (V9).

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `lote`, `rede_id` | texto | Como em `consultas` |
| `execucao` | inteiro | 1, 2, … na ordem do log |
| `semente` | inteiro | Semente do sorteio da ordem. `coletor.py --semente` repete a ordem |
| `interface` | texto | Interface informada pelo coletor (vazia no Windows) |
| `ambiente` | texto | `Python · OpenSSL · dnspython · httpx2` informado pelo coletor |
| `rodadas_previstas` | inteiro | `--rodadas` pedido |
| `rodadas_no_log` | inteiro | Rodadas que de fato terminaram. Menor que o previsto = queda |
| `n_avisos` | inteiro | Linhas `AVISO` (por exemplo, rodada mais longa que o intervalo) |
| `codigo_saida` | inteiro | Código de saída do coletor (linha `=== fim` do `coletar_rede.ps1`). Vazio = não registrado, provável queda |
| `arquivo_origem`, `linha_origem` | texto, inteiro | Log e linha da semente |

### 5.4 `fichas.csv` — classificação da rede

Uma linha por ficha (`validar_rede.py`, Passo 2 do protocolo) e resolvedor padrão
sondado. No lote definitivo há uma ficha por dia (6.6), e uma mudança de
classificação entre dias aparece aqui.

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `lote`, `rede_id` | texto | Como em `consultas` |
| `data` | texto | Dia da ficha, `AAAAMMDD` (do nome do arquivo, ou de `ts_utc` se o nome não trouxer) |
| `ts_utc` | data-hora | Momento da sondagem |
| `classificacao` | texto | `(a)`, `(b)` ou `(c)` (ProtocoloExperimental, 5.1) |
| `interceptacao_detectada` | lógico | A porta 53 dos públicos responde de outro AS |
| `padrao_id` | texto | Identificador do resolvedor padrão sondado |
| `padrao_endereco_privado` | lógico | O padrão é um endereço privado (roteador) |
| `padrao_upstream_asn` | texto | AS(s) dos upstreams observados, separados por `;` |
| `padrao_classificacao` | texto | Diagnóstico do padrão em texto livre |
| `id_server_1111` | texto | PoP da Cloudflare visto na sondagem |
| `arquivo_origem` | texto | Ficha bruta (JSON) |

### 5.5 `arquivos_brutos.csv` — manifesto

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `lote` | texto | Lote do arquivo |
| `tipo` | texto | `consultas`, `log` ou `ficha` |
| `caminho` | texto | Relativo a `Lab5/` |
| `bytes` | inteiro | Tamanho com finais de linha LF |
| `linhas` | inteiro | Número de quebras de linha (no CSV, inclui o cabeçalho) |
| `sha256` | texto | SHA-256 do conteúdo com finais de linha LF |

## 6. Limitações conhecidas

| Coluna ou dado | Limitação | Referência |
| --- | --- | --- |
| `http_versao` | Nunca preenchida | ProtocoloExperimental, V5 |
| `interface` | Vazia no Windows | V6 |
| `ttl_autoritativo` | Vazia até haver zona do grupo; M6 não verificável | D1, DefinicaoDasMetricas 2.6 |
| `s_desde_ultima_consulta` | Zera quando o coletor reinicia | V10 |
| `pop_id` | Só a Cloudflare; vazio no Google e no padrão | DefinicaoDasMetricas 2.4 |
| Piloto | Sem log: `execucao`, `subconjunto_c3` e `duracao_s` ficam vazios, e a semente não foi guardada | V9 |
| Provisória, log | A primeira ficha do log saiu `(c)` por falso positivo e foi refeita depois da coleta. Vale a ficha JSON, que é a da base | [README da provisória](../dados/provisoria/README.md) |

## 7. Privacidade

A base herda a regra da seção 9.6 do planejamento: nenhum IP público inteiro,
nenhum nome de pessoa. As consultas guardam o **identificador** do resolvedor,
e as fichas, o AS e endereços truncados. A consolidação não acrescenta nenhum
dado que não esteja no bruto. O log entra só pelos campos da seção 5.3, e os
nameservers do sistema que ele lista não vão para a base.
