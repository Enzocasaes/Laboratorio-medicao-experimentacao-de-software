# Lab05 — Sprint 01 · Participante C: Plano de Instrumentação

**Responsabilidade:** viabilidade técnica e coleta piloto.
**Escopo deste documento:** valida as seções 9.4, 9.5 e 9.6 de
[`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md) e fecha as decisões
**D6** (configuração dos protocolos) e **D7** (ambiente de coleta).
**Data:** 19/11/2026.

> **Convenção.** **[Validado]** = eu refiz a medição e confirmei.
> **[Ajustado]** = a proposta do Participante A muda, com o motivo.
> **[Novo]** = ponto que não estava no documento dele.
> **[Pendente]** = continua dependendo do grupo.

Os scripts estão em [`../Sprint01/coleta/`](../Sprint01/coleta/) e os dados do
piloto em [`../Sprint01/dados/`](../Sprint01/dados/). A definição operacional
das métricas está em [`DefinicaoDasMetricas.md`](DefinicaoDasMetricas.md) e o
plano de análise em [`PlanoDeAnalise.md`](PlanoDeAnalise.md).

---

## 1. O que eu validei, e como

Não aceitei a seção 9.4 por leitura: refiz as medições em **outra rede e outro
Python** (3.13.7 com OpenSSL 3.6.2, contra o 3.11.18 do piloto 2). Um achado
que só aparece num ambiente é artefato; um que aparece em dois é instrumento.

| # | Afirmação da seção 9.4 | Resultado |
| --- | --- | --- |
| 1 | Sem `TCP_NODELAY`, a primeira consulta DoT depois do handshake atrasa dezenas de ms | **[Validado]** ver 2.1 |
| 2 | O Python do sistema no macOS não oferece TLS 1.3 | **[Validado]** aqui o Python com OpenSSL negociou TLS 1.3 em 100% das conexões |
| 3 | O cliente HTTP do DoH já liga `TCP_NODELAY` | **[Validado]** ver 2.2 |
| 4 | O ponto de presença muda entre execuções | **[Validado]** o piloto 2 viu `gru22` e `gru02`; aqui o mesmo código devolveu `cnf01` — outra cidade |
| 5 | Consultar o IP configurado pode medir um encaminhador, não um resolvedor | **[Validado]** ver 3 |
| 6 | Somente IPv4 | **[Ajustado]** ver 3.2 |

---

## 2. As duas decisões de instrumentação que mudam o número

### 2.1 `TCP_NODELAY`: a correção que mais muda o número

Medi a primeira consulta DoT depois do handshake, 8 conexões em cada condição,
com TLS 1.3 nos dois casos:

| Resolvedor | Sem `TCP_NODELAY` | Com `TCP_NODELAY` | Diferença |
| --- | --- | --- | --- |
| 1.1.1.1 | 51,4 ms | 5,6 ms | **−45,8 ms** |
| 8.8.8.8 | 31,5 ms | 14,5 ms | −17,0 ms |

Com a opção ligada, a consulta ao 1.1.1.1 custa 5,6 ms — praticamente o RTT de
rede medido na mesma máquina (≈ 7 ms). Sem ela, custa nove vezes isso.

A magnitude no 1.1.1.1 (≈ 46 ms) é compatível com o temporizador de ACK
retardado, de 40 ms, somado ao RTT. **[Hipótese]** O mecanismo provável é o
algoritmo de Nagle retendo a consulta até a confirmação do último segmento do
handshake, como a seção 9.4 já levantava.

**Por que isso não é detalhe.** O `dns.query.tls` do dnspython não liga a
opção; o cliente HTTP do DoH liga. Sem a correção, o experimento cobraria do
DoT um custo que é do cliente, e **favoreceria o DoH** numa comparação que é
justamente entre os dois. A correção entra em
[`medidor.py`](../Sprint01/coleta/medidor.py), na função `abrir_tcp`, e não em
cada chamador: assim não existe caminho no projeto que abra um socket TCP sem
ela.

### 2.2 A afirmação sobre o cliente do DoH, conferida

A seção 9.4 afirma que o cliente HTTP do DoH liga `TCP_NODELAY` sozinho.
Conferir isso importa porque é exatamente o que dispensa uma correção do nosso
lado — e, se fosse falso, o DoH estaria pagando a mesma penalidade do DoT sem
ninguém saber.

Confirmei de **três** formas, na versão instalada (`httpcore2` 2.16.2):

1. **No código-fonte.** `httpcore2/_backends/sync.py`, linha 212:
   `sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)`, chamada
   incondicionalmente logo depois do `create_connection`.
2. **Em execução.** Interceptando `socket.setsockopt` durante uma consulta DoH
   real, a chamada aparece com valor 1.
3. **Na medida.** O DoH reaproveitado ficou em 6,7 ms, no mesmo patamar do
   Do53 (7,1 ms), sem nenhuma correção nossa.

> **Cuidado com a sonda.** A primeira tentativa de verificar isso lia a opção
> do socket logo após o `connect` e devolvia 0 — o que parecia provar o
> contrário. O `httpcore` liga a opção **depois** de conectar, então a leitura
> estava no instante errado. Registro aqui porque quem repetir a verificação
> vai cair na mesma armadilha.

---

## 3. O resolvedor padrão da rede

### 3.1 O procedimento funciona e discrimina **[Validado]**

Rodei o procedimento da seção 9.5 nesta rede
([`validar_rede.py`](../Sprint01/coleta/validar_rede.py), 20 repetições por
sonda). Resultado:

| Verificação | Resultado |
| --- | --- |
| Quem chega ao autoritativo | **AS28573 — Claro NXT Telecomunicações, BR** |
| `id.server` do 1.1.1.1 | `cnf01` (Confins/BH) |
| `whoami` via 1.1.1.1 | AS13335 (Cloudflare) — bate |
| `whoami` via 8.8.8.8 | AS15169 (Google) — bate |
| Classificação | **(a) resolvedor padrão independente** — entra no experimento completo |

Isso é diferente do que o piloto 2 encontrou, em que o padrão encaminhava ao
Google. Duas redes, duas classificações: o procedimento **discrimina**, que é
o que se queria dele. A ficha está em
[`../Sprint01/dados/rede_piloto-c.json`](../Sprint01/dados/rede_piloto-c.json),
sem nenhum endereço IP, conforme a regra de privacidade da seção 9.6.

### 3.2 "Somente IPv4" quebra nesta rede **[Ajustado]**

A seção 9.4 decidiu medir **somente IPv4**. Nesta rede isso elimina o
resolvedor padrão inteiro, porque a máquina **não tem nenhum nameserver IPv4
configurado**: o provedor anuncia só IPv6 (`2804:…`). O que existe em IPv4 é
o gateway (192.168.0.1), que também atende DNS — mas é **outro** resolvedor,
um encaminhador local.

Ou seja, "o resolvedor padrão da rede" não é um objeto único. Nesta rede são
dois, com latências diferentes:

| Alvo | Protocolo de transporte | Mediana Do53 no piloto |
| --- | --- | --- |
| `padrao-configurado` (provedor, IPv6) | IPv6 | 7,1 ms |
| `padrao-gateway` (encaminhador local, IPv4) | IPv4 | 9,7 ms |

**Decisão [Ajustado].** O coletor aceita `--padrao id=ip`, **repetível**, e
grava o identificador em cada linha. Quem analisa sabe qual foi medido. O
medidor aceita endereços IPv6 sem mudança (confirmado). A restrição "somente
IPv4" continua valendo para **1.1.1.1 e 8.8.8.8**, que é onde ela serve para
manter a comparação justa; para o resolvedor padrão, cada rede declara na
ficha o que mediu e por quê.

**Consequência para o grupo [Pendente].** Cada integrante precisa rodar
`validar_rede.py` **antes** de coletar e dizer qual alvo usou. Se as três
redes medirem coisas diferentes (uma o provedor, outra o roteador), a
comparação "padrão × público" não se agrega entre redes — e isso precisa
aparecer no relatório, não ser descoberto na análise.

---

## 4. Decisão D6 — configuração dos protocolos

Fechada como abaixo. O que não estiver aqui está no código, que é a fonte
normativa: [`medidor.py`](../Sprint01/coleta/medidor.py).

| Item | Decisão | Motivo |
| --- | --- | --- |
| Mensagem | Tipo A, classe IN, EDNS0 com payload 1.232, **sem** o bit DO | Mensagem idêntica em todos os tratamentos; se mudasse entre protocolos, a diferença medida não seria só do protocolo |
| Timeout | 2 s, **uma** tentativa | Uma segunda tentativa transformaria falha em latência alta e contaminaria as duas métricas |
| Do53 | `udp_with_fallback`, registrando `usou_tcp` | A queda para TCP custa um RTT a mais e precisa ser identificável |
| DoT | Socket próprio, `TCP_NODELAY`, verificação de certificado e SNI, socket não bloqueante em `sock=` | Seção 2.1 |
| DoH | `httpx2.Client(http2=True)`, **POST**, URL por IP | POST não carrega o corpo na URL e evita cache de intermediários; a URL por IP evita uma resolução DNS escondida dentro da medida e mantém o mesmo endereço anycast do Do53 |
| Conexão nova | Socket ou cliente novo por consulta; cronômetro começa **antes** do socket | É o custo completo que o usuário paga |
| Conexão reaproveitada | Uma conexão por resolvedor e protocolo na rodada; **primeira consulta descartada**; reconexões contadas | A primeira sobre uma conexão nova ainda carrega efeito de início |
| Timeouts | Censurados em 2.000 ms | Seção 10.4 |

---

## 5. Decisão D7 — ambiente de coleta

| Item | Decisão |
| --- | --- |
| Python | ≥ 3.10 **com OpenSSL** e `ssl.HAS_TLSv1_3` verdadeiro |
| Bibliotecas | Versões fixadas em [`requirements.txt`](../Sprint01/coleta/requirements.txt) — `dnspython[doh]==2.9.2` e a pilha HTTP/2 que vem com ela |
| Verificação | [`ambiente.py`](../Sprint01/coleta/ambiente.py) roda na inicialização e **aborta** a coleta se algo não bater |
| Registro | Versões de Python, OpenSSL, dnspython e httpx vão em **cada linha** do CSV |
| Máquina | Dedicada no período, de preferência no cabo, sem hibernar (`caffeinate -i` no macOS), relógio por NTP |

**O coletor aborta em vez de avisar.** Um aviso no terminal de uma coleta de
sete dias não é lido. Dado ruim que parece bom é pior que coleta que não
começou.

---

## 6. Esquema de registro (seção 9.6) **[Validado, com três acréscimos]**

As 27 colunas propostas estão implementadas, e cada linha é uma consulta.
Acrescentei **três**:

| Coluna | Por que entrou |
| --- | --- |
| `versao_httpx` | **[Novo]** A pilha do DoH é o `httpx2`, e foi exatamente uma troca de versão dessa biblioteca (httpx → httpx2 na dnspython 2.9) que mudou o cliente medido. Registrar Python e dnspython sem registrar essa versão deixaria o DoH sem rastro |
| `reconectou` | **[Novo]** Marca a consulta refeita porque o servidor derrubou a conexão ociosa. Sem ela a reconexão sumia do dado: a medida que falhava era descartada e a refeita entrava como qualquer outra (métrica M12) |
| `posicao` | **[Novo]** A unidade de pareamento do bloco. Ver 6.1 |

### 6.1 Por que `posicao` precisou existir **[Novo]**

A seção 7.4 define o bloco como **rede × rodada × posição consultada**, e diz
que "em C3 e C2, a posição é o próprio nome; em C1, é uma posição sorteada da
rodada". Minha primeira implementação pareava os blocos **pelo nome**, nos três
casos.

Em C1 isso não funciona, e o motivo é o próprio desenho: ali cada resolvedor
recebe um **nome único diferente**, de propósito, para que um não aqueça o
cache do outro (seção 9.3). Parear pelo nome em C1 nunca encontraria par —
cada consulta ficaria sozinha no seu bloco, nenhuma diferença Δ seria
calculada, e **C1 ficaria sem análise nenhuma**. C1 é justamente a condição que
mede a resolução recursiva completa, que é o caso caro e o cerne da Q2.

O erro não apareceria no piloto, porque sem o domínio do grupo (pendência D1)
não há C1 para coletar. Apareceria na análise, depois de sete dias de coleta.

**Correção:** a coluna `posicao` é gravada em toda linha — igual ao nome em C2
e C3, e `c1-0`, `c1-1`, … em C1 — e o pareamento usa ela. Há teste automático
para os dois casos, e a análise continua lendo CSVs sem a coluna, caindo de
volta para o nome.

Arquivo gerado: um CSV por rede, gravado **linha a linha**. Uma coleta de sete
dias cai — a máquina dorme, o Wi-Fi some. Gravando ao fim de cada rodada, o
que já foi medido está salvo.

---

## 7. Volume e tempo de rodada **[Validado]**

A seção 9.6 estima "cerca de 340 consultas por rodada, bem menos de um
minuto". Medido no piloto: **70 consultas em 2,6 a 3,7 segundos**, com 15
domínios e 4 resolvedores. Extrapolando linearmente, 340 consultas levam
**13 a 18 segundos**. A estimativa do Participante A está correta e com folga
confortável diante do intervalo de 30 minutos (D4).

Isso também mostra que **o intervalo entre rodadas não é limitado pelo tempo
de execução**, e sim pela carga que queremos impor aos serviços e pela
independência entre rodadas. A proposta de 30 minutos continua de pé.

---

## 8. O que continua pendente

| # | Pendência | Situação |
| --- | --- | --- |
| **D1** | Domínio próprio sem DNSSEC, fora da Cloudflare e do Google | **Bloqueia C1 e C2.** O coletor já implementa as duas condições e as liga sozinho com `--zona`; sem ela, roda só C3 e avisa. Não inventa estado de cache que não controla |
| **D2–D5** | Redes, nomes por rodada, intervalo, duração | Do grupo; o coletor é parametrizado e não depende da decisão |
| — | Lista Tranco congelada para C3 | É da seção 9.7, responsabilidade de B. O coletor aceita `--dominios arquivo.txt`; enquanto a lista não vem, usa 15 domínios com os três estratos representados, **só para o piloto** |

---

## 9. Limites desta validação

- **Uma rede e algumas horas.** Tudo aqui foi medido na rede de um integrante,
  numa madrugada. Serve para validar instrumento, não para concluir sobre
  resolvedores.
- **`TCP_NODELAY` medido em duas redes, não em cinquenta.** A magnitude da
  penalidade variou (−45,8 ms aqui, ≈ −62 ms no piloto 2): o efeito é
  consistente em direção, não em tamanho.
- **A verificação do `httpcore` é de leitura de código mais um indício de
  medida**, não uma captura de pacotes. Uma conferência definitiva exigiria
  `tcpdump`, que fica como trabalho da Sprint 02 se alguém questionar.
- **C1 e C2 nunca foram exercitadas com uma zona real**, porque ela não
  existe. O código está escrito e roda, mas só será validado de fato quando
  D1 for resolvida.
