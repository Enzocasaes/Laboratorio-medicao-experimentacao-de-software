# Lab05 — Protocolo Experimental Consolidado

**Versão:** 1.0, de 24/11/2026 (issue #129, *Revisar e consolidar o protocolo
experimental*).
**Situação:** revisado; **aguarda o aceite dos três participantes** (seção 10).
**Base:** versão 3 de [`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md),
[`PlanoDeInstrumentacao.md`](PlanoDeInstrumentacao.md),
[`DefinicaoDasMetricas.md`](DefinicaoDasMetricas.md),
[`PlanoDeAnalise.md`](PlanoDeAnalise.md),
[`RegistroDeRevisao.md`](RegistroDeRevisao.md) e o código em
[`../Sprint01/coleta/`](../Sprint01/coleta/).

> **Para que serve este documento.** O planejamento da Sprint 01 está
> distribuído em cinco documentos e no código, e eles divergem em alguns
> pontos. Este documento reúne em um só lugar o protocolo que **os três
> participantes** seguem na coleta da Sprint 02. **Onde ele divergir dos
> documentos da Sprint 01, vale este.** Os detalhes de medição continuam
> definidos no código ([`medidor.py`](../Sprint01/coleta/medidor.py)), como
> já estabelecia o Plano de Instrumentação.

**Convenção.**

| Marca | Significado |
| --- | --- |
| **[Fechada]** | Decidida antes desta revisão; a fonte é citada |
| **[Decidida nesta revisão]** | Ajuste de consistência feito aqui, com o motivo. Vale salvo objeção registrada no aceite (seção 10) |
| **[Proposta]** | Muda um critério de análise ou de desenho e precisa do aval do responsável indicado |
| **[Pendente]** | Depende do grupo; tem responsável e regra de contingência |
| **[Ação]** | Exige mudança no código antes da coleta (ou da análise) |

---

## 1. Como a revisão foi feita

1. **Leitura cruzada** dos cinco documentos da Sprint 01 e do código do
   coletor, da validação de rede e da análise, procurando o que um documento
   afirma e outro (ou o código) contradiz.
2. **Execução do protocolo num ambiente novo.** As execuções registradas até
   aqui foram em macOS (piloto 2) e numa máquina com interface `en0`
   (piloto C). Nenhuma tinha sido feita em **Windows**, e o grupo não tem
   garantia de que todos coletam no mesmo sistema. Nesta revisão o protocolo
   foi executado ponta a ponta em Windows 11:

   | Passo | Resultado |
   | --- | --- |
   | Testes automáticos (só biblioteca padrão) | 46 aprovados, 18 ignorados (dependem do dnspython) |
   | `requirements.txt` instalado num ambiente limpo | Instalação sem erro |
   | `ambiente.py` | **Aprovado**: Python 3.14.0, OpenSSL 3.0.18, TLS 1.3 disponível, dnspython 2.9.2, httpx2 2.16.2 |
   | `validar_rede.py` sem `--padrao` | Classificou a rede **errado**; ver 5.1 e V7 |
   | `validar_rede.py` com `--padrao` | Classificação **(a)**, sem interceptação |
   | `coletor.py --rodadas 1` | 55 consultas, 0 falhas, 2,9 s; TLS 1.3 em todas as conexões DoT |
   | `analise.py` | Relatório gerado sem erro |

   Esses números verificam o instrumento; **não são resultado do
   experimento** e não foram versionados.

O que a revisão encontrou está em três lugares: os ajustes de pergunta,
hipóteses, variáveis e tratamentos (seções 2 a 5), as divergências entre plano
e código (seção 7) e o quadro de decisões (seção 8).

---

## 2. Pergunta de pesquisa e objetivos

### 2.1 Pergunta **[Fechada]** (Planejamento, seção 6)

> **RQ.** Nas redes de acesso brasileiras usadas pelo grupo, o resolvedor
> público 1.1.1.1 resolve nomes **mais rápido e com menor variabilidade** do
> que o Google Public DNS (8.8.8.8) e o resolvedor padrão da rede? Quanto de
> latência os protocolos cifrados (DoT e DoH) acrescentam em relação ao DNS
> tradicional (Do53), com conexão nova e com conexão reaproveitada?

**Avaliação.** Mantida sem mudança. Ela é mensurável no cliente, tem escopo
declarado ("redes usadas pelo grupo") e é coerente com o Goal e com Q1–Q4.

### 2.2 Objetivo (GQM) **[Fechada]** (Planejamento, seção 7.1)

Analisar o serviço público de resolução DNS 1.1.1.1, **com o propósito de**
avaliá-lo e compará-lo, **com respeito a** desempenho (latência) e
confiabilidade (falhas e estabilidade), **do ponto de vista de** usuários e
administradores de rede que escolhem qual resolvedor configurar, **no contexto
de** redes de acesso brasileiras usadas pelo grupo, comparado com o 8.8.8.8 e
com o resolvedor padrão da rede, em Do53, DoT e DoH, durante pelo menos 7 dias.

### 2.3 Perguntas operacionais

| ID | Pergunta | Sub-experimento | Depende de D1 (zona do grupo)? |
| --- | --- | --- | --- |
| **Q1** | Latência Do53 do 1.1.1.1 × 8.8.8.8 × padrão, no estado natural de cache | E-1, C3 | Não |
| **Q2** | Como a comparação muda com o estado de cache (C1, C2, C3) | E-1, C1–C3 | **Sim**. Sem a zona, Q2 vira exploratória (estratos de C3) |
| **Q3** | Quanto DoT e DoH acrescentam ao Do53, com conexão nova e reaproveitada | E-2 | Parcialmente. Sem a zona, o E-2 roda em um nome real (V12) |
| **Q4** | Taxa de falhas, dispersão e variação por faixa horária | E-1 e E-2 | Não |

**Ajuste [Decidida nesta revisão].** A dependência de cada pergunta em relação
à zona do grupo (D1) passa a ficar explícita. Antes ela estava espalhada pelas
seções 9.3, 7.4 e pela Parte 4.2 do Registro.

---

## 3. Hipóteses

### 3.1 Quadro consolidado

Todas as hipóteses são testadas **por rede**: cada rede é uma réplica
(Planejamento, 10.2). Δ = latência do primeiro resolvedor − latência do
segundo, pareada no bloco e resumida pela mediana na unidade de inferência.

| ID | Enunciado | H₀ | H₁ | Unidade | Teste | Papel |
| --- | --- | --- | --- | --- | --- | --- |
| **H-a** | Em Do53, o 1.1.1.1 tem mediana de latência menor que o 8.8.8.8 | mediana de Δ(1.1.1.1 − 8.8.8.8) = 0, em C3 | mediana de Δ ≠ 0 | nome (C3) | Wilcoxon pareado bilateral, Holm na família E-1 | **Primária** |
| **H-b** | O padrão é o mais rápido com cache quente e perde a vantagem quando há recursão | Δ(padrão − 1.1.1.1) = 0 e Δ(padrão − 8.8.8.8) = 0, em C2 e em C1 | Δ ≠ 0. Sustentada se Δ < 0 em C2 e não houver Δ < 0 significativo em C1 | janela de 6 h | Wilcoxon pareado bilateral por condição, Holm | **Secundária**, só com D1 |
| **H-c1** | Com conexão nova, DoT e DoH custam dezenas de ms a mais que o Do53 | Δ(DoX nova − Do53) = 0 | Δ ≠ 0 | janela de 6 h | Wilcoxon pareado bilateral, Holm na família E-2 | Secundária |
| **H-c2** | Com conexão reaproveitada, o custo de DoT e DoH cai para poucos ms | ver 3.2 | ver 3.2 | janela de 6 h | IC 95% por bootstrap por conglomerado e Wilcoxon | **Primária** |
| — | Q4 (falhas, dispersão, faixa horária) | sem hipótese confirmatória | — | — | Descrição com IC; Wilcoxon sobre as taxas de falha por unidade como secundário | Descritiva |

### 3.2 Ajustes nas hipóteses

**R1 — Teste bilateral para hipóteses direcionais [Decidida nesta revisão].**
H-a e H-c são direcionais, mas a D8 fixou o Wilcoxon **bilateral**. As duas
coisas são compatíveis, e agora a regra está escrita: o teste é bilateral, e a
hipótese só é considerada **sustentada** se p (Holm) < 0,05 **e** o sinal de Δ
for o previsto. O teste bilateral é mais conservador. Ele também é necessário
porque os pilotos já mostraram inversões: no piloto 2, o padrão foi o mais
rápido; no piloto C, três nomes da cauda longa favoreceram o 8.8.8.8 por mais
de 50 ms.

**R2 — H-c dividida em H-c1 e H-c2, com margem de equivalência [Proposta,
aval de B].** A H-c original junta duas previsões de natureza diferente:

- "custa dezenas de ms a mais" é uma **diferença**, e o Wilcoxon contra Δ = 0
  testa isso;
- "cai para poucos ms" é uma afirmação de **diferença pequena**. Rejeitar
  Δ = 0 não sustenta essa previsão, e não rejeitar também não. Com milhares
  de consultas, até 0,5 ms sai significativo.

Como a D8 declara primária justamente a H-c com conexão reaproveitada, o
critério de "poucos ms" precisa ser fixado **antes** da coleta. Proposta:

> **H-c2 é sustentada** quando o IC 95% (bootstrap por conglomerado de
> janelas) da mediana de Δ(DoX reaproveitada − Do53) fica **inteiro dentro de
> ±5 ms**. O Wilcoxon continua reportado ao lado.

Os 5 ms vêm do piloto, em que os Δ com conexão reaproveitada ficaram entre
−2,5 e +2,5 ms nos dois resolvedores, enquanto o RTT de rede mediano ficou
entre 9 e 15 ms. Uma margem menor que a metade do RTT separa "custo do protocolo" de
"custo de uma ida e volta a mais". Se B preferir outra margem, troca-se o
número, **mas ele precisa estar fixado antes do primeiro dia de coleta**.

**R3 — H-b condicional à zona [Decidida nesta revisão].** Sem D1 não existem
C1 e C2, e a H-b não tem teste direto. Nesse caso ela é rebaixada a
**exploratória**: compara-se Δ(padrão − público) entre os estratos de C3, com
a ressalva de que o estrato não controla o cache (Planejamento, 9.7).

**R4 — Q4 sem hipótese confirmatória [Decidida nesta revisão].** O
planejamento formaliza H₀ para falhas (10.3) mas não declara hipótese de
trabalho para Q4. Fica explícito que Q4 é **descritiva**. O teste sobre as
taxas de falha é secundário e só é feito se houver falhas suficientes, como já
previa a seção 10.3.

**Famílias de comparação (Holm) [Decidida nesta revisão]**, como o
[`analise.py`](../Sprint01/coleta/analise.py) já implementa:

- **E-1:** por rede e condição de cache, {1.1.1.1 × 8.8.8.8, 1.1.1.1 × padrão}
  — 2 comparações.
- **E-2:** por rede e resolvedor, {DoT, DoH} × {nova, reaproveitada} contra o
  Do53 — 4 comparações.

Acrescentar comparações depois de ver os dados invalida a correção
(PlanoDeAnalise, seção 5).

---

## 4. Variáveis

| Tipo | Variável | Níveis ou unidade | Coluna do CSV | Situação |
| --- | --- | --- | --- | --- |
| Independente (principal) | Resolvedor | `1.1.1.1` · `8.8.8.8` · `padrao` | `resolvedor` | Ajustada: **um único** `padrao` por rede (5.1) |
| Independente | Protocolo | Do53 · DoT · DoH | `protocolo` | Validada |
| Independente | Estado da conexão | `unica` (Do53) · `nova` · `reaproveitada` | `conexao` | Validada |
| Independente | Condição de cache | C1 · C2 · C3 | `condicao_cache` | C1 e C2 dependem de D1 |
| Dependente | Latência (M1) | ms | `latencia_ms` | Validada |
| Dependente | Resultado (M8) | NOERROR · timeout · SERVFAIL · REFUSED · erro de transporte | `rcode`, `erro` | Validada |
| Dependente (validação) | Reconexão (M12) | booleano | `reconectou` | Validada |
| Bloco | Rede | `rede-a` · `rede-b` · `rede-c` | `rede_id` | Convenção nova (6.5) |
| Bloco | Rodada | carimbo UTC | `rodada_id` | Validada |
| Bloco | Posição | nome (C2, C3) ou `c1-<n>` (C1) | `posicao` | Validada |
| Covariável | RTT de rede (M11) | ms | `rtt_ms` | Porta 443 nos públicos, 53 no padrão — não comparar entre eles |
| Covariável | Ponto de presença | texto | `pop_id` | **Só Cloudflare** (DefinicaoDasMetricas, 2.4) |
| Covariável | TTL retornado | s | `ttl`, `ttl_autoritativo` | `ttl_autoritativo` só com D1 |
| Covariável | Tempo desde a última consulta | s | `s_desde_ultima_consulta` | Zera se o coletor reiniciar (V10) |
| Covariável | Handshakes | ms | `t_tcp_ms`, `t_tls_ms` | Só DoT com conexão nova; DoH não separa os tempos |
| Covariável | Versão HTTP do DoH | texto | `http_versao` | **Não é gravada** (V5) |
| Covariável | Interface | texto | `interface` | **Vazia no Windows** (V6) |
| Controle | Pilha do cliente | versões | `versao_*` | Validada |

**Unidades [Fechada]** (Planejamento, 9.1 e 10.2): observação = consulta;
pareamento = bloco rede × rodada × posição; inferência = nome em C3 e janela de
6 h em C1, C2 e E-2.

**R5 — Faixas horárias no horário de Brasília [Decidida nesta revisão; Ação de
C].** A M10 define as faixas 00–06, 06–12, 12–18 e 18–24 **no horário de
Brasília**. Elas também são a unidade de inferência de C1, C2 e E-2. Mas
`analise.janela_6h` corta as janelas em UTC (`hora // 6`). Em Brasília, isso dá
21–03, 03–09, 09–15 e 15–21, o que mistura madrugada com noite e manhã com
tarde, contra o que a M10 quer separar. Decisão: as janelas são cortadas em
**UTC−3**, fuso fixo, porque o Brasil não tem horário de verão desde 2019.
O carimbo continua gravado em UTC, e só a função de análise muda. Isso **não
bloqueia a coleta**.

---

## 5. Tratamentos

### 5.1 Os três resolvedores

| Tratamento | Do53 | DoT | DoH | Identificador |
| --- | --- | --- | --- | --- |
| **Cloudflare DNS** | `1.1.1.1:53` | `1.1.1.1:853`, SNI `cloudflare-dns.com` | `POST https://1.1.1.1/dns-query`, HTTP/2 | `1.1.1.1` |
| **Google Public DNS** | `8.8.8.8:53` | `8.8.8.8:853`, SNI `dns.google` | `POST https://8.8.8.8/dns-query`, HTTP/2 | `8.8.8.8` |
| **DNS padrão** | endereço definido abaixo, porta 53 | — | — | `padrao` |

Os dois públicos são medidos **só em IPv4**, com o mesmo endereço anycast nos
três protocolos **[Fechada]** (D6). Não há mudança.

**R6 — Definição operacional do "DNS padrão" [Decidida nesta revisão].** Era o
ponto mais frouxo do protocolo. A seção 9.5 diz "o IP configurado"; o Plano de
Instrumentação (3.2) admitiu dois padrões na mesma rede (`padrao-configurado` e
`padrao-gateway`); o piloto C mediu os dois. A revisão em Windows mostrou um
terceiro problema: **na máquina usada, a interface Wi-Fi tinha 8.8.8.8 e
1.1.1.1 configurados à mão**, e uma interface Ethernet desconectada apontava
para um roteador inativo. O `validar_rede.py` sem `--padrao` juntou os
servidores de todas as interfaces, tratou o próprio 1.1.1.1 e o 8.8.8.8 como
"padrão" e classificou a rede como **(b)**, "o padrão encaminha a um
público". Com o endereço certo do roteador, a mesma rede é **(a)**. Se a
coleta tivesse partido da primeira ficha, o tratamento "padrão" seria o
próprio Cloudflare.

Regra:

1. **O DNS padrão é o resolvedor que a rede entrega por DHCP (ou RA, em IPv6)
   na interface usada na coleta.** É o que um aparelho usa quando ninguém
   configurou nada. **Não** é o que estiver configurado à mão no sistema.
2. **Exatamente um por rede**, com o identificador fixo `padrao`. Com mais de
   um, o Friedman passa a ter outro número de tratamentos em cada rede, e as
   redes deixam de ser réplicas do mesmo desenho. O piloto C rodou com k = 4.
3. **Se a rede entrega mais de um**, usa-se o **primeiro** da lista do DHCP.
   Se ela só entrega IPv6, usa-se o IPv6, como ajustou o Plano de
   Instrumentação (3.2). A ficha registra qual foi escolhido e por quê.
4. **Nunca** pode ser 1.1.1.1, 1.0.0.1, 8.8.8.8, 8.8.4.4 ou outro endereço de
   Cloudflare ou Google. Se o DHCP entregar um desses, a rede é classificada
   como **(b)** pela seção 9.5, e o `padrao` é o endereço entregue mesmo assim.
   O que não pode acontecer é ele vir de uma configuração manual.
5. Sempre passar `--padrao padrao=<ip>` **explicitamente**, tanto no
   `validar_rede.py` quanto no `coletor.py`. Nunca usar a detecção automática.

Como achar o endereço entregue pela rede:

| Sistema | Comando | O que procurar |
| --- | --- | --- |
| Windows | `netsh interface ipv4 show dnsservers` | "DNS servers configured through DHCP" na interface ativa. Se aparecer "Statically Configured", a configuração é manual; veja o DNS no roteador |
| macOS | `ipconfig getpacket en0` (ou a interface ativa) | `domain_name_server` |
| Linux | `nmcli dev show <interface>` ou `resolvectl status` | `IP4.DNS` / `DNS Servers` da interface ativa |

### 5.2 Matriz de tratamentos por rodada

Há dois modos, conforme a decisão D1.

**Modo A — com a zona do grupo (desenho completo).**

| Sub-experimento | Resolvedores | Protocolo × conexão | Cache | Nomes por rodada | Consultas por rodada |
| --- | --- | --- | --- | --- | --- |
| E-1 | 3 | Do53 | C3 | 60 (um dos 3 subconjuntos de 180) | 180 |
| E-1 | 3 | Do53 | C1 | 10 posições, nome único por resolvedor | 30 |
| E-1 | 3 | Do53 | C2 | 10 nomes fixos | 30 |
| E-2 | 2 públicos | Do53, DoT nova, DoT reap., DoH nova, DoH reap. | C2 | os mesmos 10 | 100 |
| **Total** | | | | | **≈ 340** |

**Modo B — sem a zona (contingência de D1).**

| Sub-experimento | Resolvedores | Protocolo × conexão | Cache | Nomes por rodada | Consultas por rodada |
| --- | --- | --- | --- | --- | --- |
| E-1 | 3 | Do53 | C3 | 60 | 180 |
| E-2 | 2 públicos | os 5 | C3 (nome real) | 1: a **primeira linha** da lista de C3 | 10 |
| **Total** | | | | | **≈ 190** |

Em 7 dias a cada 30 minutos (336 rodadas), são cerca de 114 mil consultas por
rede no modo A e 64 mil no modo B. Pelo tamanho médio das linhas do piloto
(≈ 245 bytes), dá **28 MB e 16 MB de CSV** por rede, abaixo do limite de
100 MB por arquivo do GitHub.

**R7 — Nome do E-2 no modo B [Decidida nesta revisão].** O código usa
`dominios[0]` quando não há zona. Para as três redes usarem o mesmo nome, a
**primeira linha** da lista de C3 versionada é reservada a ele. Ela deve ser um
domínio do topo global que **não** pertença a Cloudflare nem a Google, por
exemplo `wikipedia.org`. Esse domínio é escolhido à mão, e não sorteado. Ele
fica no estrato popular global e participa do rodízio do E-1 como os demais.

---

## 6. Procedimento comum de coleta

Os três participantes executam **os mesmos passos, com os mesmos parâmetros**.
O que muda de uma rede para outra é só o `--rede-id`, o `--padrao` e a semente.

### 6.1 Antes de começar (uma vez)

| Item | Regra | Windows | macOS | Linux |
| --- | --- | --- | --- | --- |
| Python | ≥ 3.10 com OpenSSL e TLS 1.3 | python.org (traz OpenSSL) | Homebrew/pyenv/python.org; **não** o do sistema | o da distribuição |
| Ambiente | `requirements.txt` fixado, em `.venv` | `py -3 -m venv .venv` | `python3 -m venv .venv` | `python3 -m venv .venv` |
| Executável | — | `.venv\Scripts\python.exe` | `.venv/bin/python` | `.venv/bin/python` |
| Relógio | sincronizado por NTP | `w32tm /query /status` | `sntp time.apple.com` | `timedatectl status` |
| Não dormir | máquina ligada na tomada, sem suspender | `powercfg /change standby-timeout-ac 0` (restaurar depois) | `caffeinate -i <comando>` | `systemd-inhibit --what=sleep:idle <comando>` |
| Conexão | cabo de preferência; registrar qual foi usada | | | |
| Interferências | **VPN desligada**; sem software que intercepte DNS (filtro de antivírus, AdGuard, Pi-hole local) | | | |

### 6.2 Passo 1 — Ambiente

Sempre a partir de `Lab5/`. Nos comandos abaixo, `python` é o executável da
`.venv` (tabela 6.1).

```bash
python -m pip install -r Sprint01/coleta/requirements.txt
python Sprint01/coleta/ambiente.py
```

Só segue quem obtiver `Ambiente aprovado para a coleta`. A saída vai para o
aceite (seção 10).

### 6.3 Passo 2 — Ficha da rede

```bash
python Sprint01/coleta/validar_rede.py --rede-id rede-X \
    --padrao padrao=<ip do DNS entregue pela rede (5.1)> \
    --saida Sprint02/dados/rede-X_ficha_AAAAMMDD.json
```

| Classificação | Consequência |
| --- | --- |
| (a) padrão independente | Experimento completo |
| (b) padrão encaminha a um público | Entra; "padrão × público" se lê como "encaminhador com cache × acesso direto" |
| (c) interceptação da porta 53 | Só E-2 (DoT e DoH). **Avisar o grupo antes de começar** |

### 6.4 Passo 3 — Rodada de teste

```bash
python Sprint01/coleta/coletor.py --rede-id rede-X --rodadas 1 \
    --padrao padrao=<ip> --saida <pasta temporária>/teste.csv
```

O teste passa se houver **zero falhas** e **TLS 1.3** nas linhas de DoT. O CSV
de teste **não** é versionado.

### 6.5 Passo 4 — Coleta definitiva

Parâmetros fixos, iguais nas três redes:

| Parâmetro | Valor | Origem |
| --- | --- | --- |
| `--rede-id` | `rede-a`, `rede-b`, `rede-c` (sem nome de pessoa, sem cidade) | **[Decidida nesta revisão]** |
| `--rodadas` | `336` (7 dias × 48) | D4, D5 |
| `--intervalo` | `1800` | D4 |
| `--padrao` | `padrao=<ip>` (5.1) | R6 |
| `--dominios` | `Sprint02/dominios/c3.txt`, a lista congelada e versionada | 9.7 — **[Pendente] B** |
| `--zona` | a zona do grupo (modo A) ou omitido (modo B) | D1 — **[Pendente]** |
| `--nomes-c1`, `--nomes-c2` | `10` e `10`. **Obrigatório passar**: o padrão do código é 2 (V2) | D3 |
| `--subconjuntos` | `3` (já é o padrão do código) | D3, V1 |
| `--saida` | `Sprint02/dados/rede-X.csv` (**caminho relativo**) | **[Decidida nesta revisão]** |
| `--semente` | omitir: cada rede sorteia a sua e ela fica no log | Planejamento, 9.6 |
| saída de erros | redirecionada para `Sprint02/dados/rede-X.log` | V9 |

```bash
python Sprint01/coleta/coletor.py --rede-id rede-X \
    --rodadas 336 --intervalo 1800 --padrao padrao=<ip> \
    --dominios Sprint02/dominios/c3.txt [--zona <zona> --nomes-c1 10 --nomes-c2 10] \
    --saida Sprint02/dados/rede-X.csv  2>> Sprint02/dados/rede-X.log
```

O caminho relativo em `--saida` evita que o log registre a pasta do usuário
(por exemplo `C:\Users\<nome>`), que identificaria o participante.

### 6.6 Durante a coleta

- **Uma vez por dia:** repetir o Passo 2 com a data do dia no nome da ficha
  (Planejamento, 9.5, passo 5). Se a classificação mudar, avisar o grupo.
- **Uma vez por dia:** conferir no log se as rodadas continuam a cada 30 min e
  se apareceu `AVISO` ou muitas falhas.
- **Não** mudar a configuração de rede, de DNS ou de VPN, nem trocar entre
  cabo e Wi-Fi.

### 6.7 Se a coleta parar

Reiniciar com **o mesmo `--saida`** (o coletor acrescenta sem repetir o
cabeçalho) e com `--rodadas` igual ao número de rodadas que faltam até o fim
da janela de 7 dias. Escrever no log a hora da queda e o motivo. Não se
"compensa" rodada perdida estendendo a coleta: a janela é a mesma nas três
redes (D5). A lacuna é declarada no relatório.

### 6.8 Entrega dos dados

| Arquivo | Conteúdo |
| --- | --- |
| `Sprint02/dados/rede-X.csv` | todas as consultas |
| `Sprint02/dados/rede-X.log` | saída de erros do coletor: versões, sementes, avisos, quedas |
| `Sprint02/dados/rede-X_ficha_AAAAMMDD.json` | uma ficha por dia |

Antes do commit, conferir que nenhum arquivo traz endereço IP público inteiro
nem nome de pessoa (Planejamento, 9.6). As fichas já saem truncadas.

---

## 7. Divergências entre o plano e a implementação

Encontradas nesta revisão. "Bloqueia" significa que a coleta definitiva não
deve começar antes da correção.

| # | Divergência | Evidência | Impacto | Decisão ou ação | Resp. | Bloqueia? |
| --- | --- | --- | --- | --- | --- | --- |
| **V1** | **O rodízio de C3 não estava implementado.** O plano (9.3, 9.6, D3) prevê 180 domínios em 3 subconjuntos de 60, alternados entre rodadas. O coletor consultava **todos** os domínios da lista em **toda** rodada | `montar_rodada` percorria `dominios` inteiro | Com 180 domínios, cada um seria consultado a cada 30 min, e não a cada 90, o que aumenta o autoaquecimento do cache em C3 | **Resolvido (24/11/2026).** `--subconjuntos` (padrão 3). A lista aceita o estrato na 2ª coluna; os domínios são distribuídos em rodízio estrato por estrato, então os subconjuntos diferem em no máximo um domínio, no total e por estrato. A divisão depende só do arquivo, e é a mesma nas três redes. O subconjunto da rodada é o número de rodadas já gravadas no `--saida`, mod 3: reiniciar a coleta continua o ciclo. O E-2 sem zona usa sempre a primeira linha. Há 10 testes novos, e a coleta real com reinício foi verificada (seção 7.1) | C | Não |
| **V2** | `--nomes-c1` e `--nomes-c2` valem **2** por padrão; o plano (D3) usa **10** | `coletor.py`, argumentos | Um participante que esquecesse o parâmetro coletaria 5 vezes menos C1 e C2 | Parâmetro **obrigatório** no comando (6.5). Recomendado mudar o padrão para 10 | C | Não (resolvido pelo comando) |
| **V3** | **O aquecimento de C2 não está implementado.** O plano (9.3) manda consultar o nome C2 uma vez e medir pelo menos 2 s depois | Só as conexões reaproveitadas têm consulta de aquecimento | Sem ele, a primeira consulta C2 de cada resolvedor (e qualquer uma depois de o TTL expirar) mede recursão e não cache, e a M6 acusa a falha só depois | **[Ação]** consultar cada nome C2 em cada resolvedor no início da rodada, antes do embaralhamento, e esperar ≥ 2 s | C | **Sim, no modo A** |
| **V4** | Janelas de 6 h em UTC × faixas da M10 em Brasília | `analise.janela_6h` | Janelas misturam madrugada com noite (R5) | **[Ação]** cortar em UTC−3 | C | Não (só análise) |
| **V5** | `http_versao` **nunca é preenchida**, embora a seção 9.4 mande registrar a versão HTTP negociada | Coluna vazia em todas as linhas DoH, no piloto C e na revisão | Não há como provar que o DoH usou HTTP/2 em todas as redes | **[Ação]** gravar a versão da resposta do `httpx2` | C | Não, mas recomendado |
| **V6** | `interface` fica **vazia no Windows** | `interface_ativa` só trata macOS e Linux | Não se sabe se a coleta foi no cabo ou no Wi-Fi | Registrar na ficha e no log até haver correção. **[Ação]** opcional: tratar Windows | C | Não |
| **V7** | `validar_rede.py` sem `--padrao` junta os servidores de **todas** as interfaces e aceita resolvedores públicos como "padrão" | Revisão em Windows (5.1): rede (a) classificada como (b) | Ficha errada e tratamento "padrão" igual ao Cloudflare | `--padrao` explícito e obrigatório (R6). **[Ação]** recusar como padrão os endereços de 1.1.1.1/8.8.8.8 e afins | C | Não (resolvido pela regra) |
| **V8** | A análise aceita qualquer número de padrões por rede | Piloto C: Friedman com k = 4 | Redes com desenhos diferentes deixam de ser réplicas | Um único `padrao` (R6) | — | Não |
| **V9** | A semente e as versões só aparecem no terminal; não vão para o CSV | `coletor.main` | Sem a semente não se reproduz a ordem dos tratamentos | Log obrigatório (6.5) | — | Não |
| **V10** | `s_desde_ultima_consulta` zera quando o coletor reinicia | Estado só em memória | A análise de sensibilidade 1 perde a primeira rodada após cada queda | Declarar; as quedas ficam no log (6.7) | — | Não |
| **V11** | Pequenas incoerências de texto: o README dos dados fala em 29 colunas (são 30); o checklist fala em "1,6 a 3,7 s" (o Plano de Instrumentação mede 2,6 a 3,7 s); a seção 9.4 ainda diz "somente IPv4" para tudo | Leitura cruzada | Nenhum na coleta | **Corrigido nesta revisão** (README e checklist); a seção 9.4 fica superada pela 5.1 deste documento | — | Não |
| **V12** | Sem a zona, o E-2 usa um único nome real, cujo estado de cache não é controlado. Na revisão, o TTL devolvido para esse nome variou de 17 a 300 s entre tratamentos da mesma rodada | CSV da revisão | Parte do Δ do E-2 pode ser recursão, não protocolo | R7 (mesmo nome nas três redes) e declaração como ameaça à validade interna no modo B | — | Não |

### 7.1 Verificação do rodízio (V1)

Executado em Windows com uma lista de 9 domínios (3 por estrato): duas
rodadas, uma interrupção e uma terceira rodada com o mesmo `--saida`.

| Rodada | Subconjunto | Domínios de C3 | Nome do E-2 |
| --- | --- | --- | --- |
| 1 | 1/3 | `wikipedia.org`, `uol.com.br`, `sqlite.org` | `wikipedia.org` |
| 2 | 2/3 | `github.com`, `globo.com`, `gnu.org` | `wikipedia.org` |
| *(reinício)* | | | |
| 3 | 3/3 | `amazon.com`, `gov.br`, `unicode.org` | `wikipedia.org` |

Cada subconjunto tem um domínio de cada estrato. Depois do reinício, o ciclo
continuou do ponto em que parou. Os testes automáticos também pegaram um
desequilíbrio da primeira versão: com 5 domínios por estrato, recomeçar a
contagem em cada estrato dava subconjuntos de 6, 6 e 3. Isso foi corrigido
antes do commit.

---

## 8. Registro das decisões

### 8.1 Decisões fechadas

| # | Decisão | Fonte |
| --- | --- | --- |
| D6 | Configuração dos protocolos: tipo A, EDNS0 1.232 sem DO, timeout de 2 s com uma tentativa, `TCP_NODELAY`, TLS 1.3, DoH POST HTTP/2 por IP | PlanoDeInstrumentacao, seção 4. **Revalidada em Windows** nesta revisão |
| D7 | Ambiente: `requirements.txt` fixado, `ambiente.py` aborta se algo não bater | PlanoDeInstrumentacao, seção 5. **Revalidada em Windows** |
| D8 | Estratégia estatística: Friedman, Wilcoxon bilateral com Holm, bootstrap por conglomerado com 10.000 réplicas, α = 0,05, primárias H-a e H-c | PlanoDeAnalise, seção 1. Complementada por R1 e R2 |
| R1, R3–R7 | Ajustes desta revisão | Seções 3 a 5 |

### 8.2 Decisões pendentes

Cada uma tem uma **regra de contingência**, para que a falta de decisão não
pare a coleta nem seja resolvida de modos diferentes em cada rede.

| # | O que decidir | Proposta | Quem | Se não for decidido antes da coleta | Bloqueia? |
| --- | --- | --- | --- | --- | --- |
| **D1** | Domínio próprio, sem DNSSEC, fora de Cloudflare e Google | Registro, Parte 4.2 | Grupo (envolve custo) | **Modo B** (5.2): Q2 e H-b exploratórias, E-2 com o nome real R7. A zona tem de estar delegada **2 dias antes** do início; senão, vale o modo B | Não (a contingência é o modo B) |
| **D2** | Número de redes | 3, uma por participante, ao menos uma no cabo | Grupo | Coletam as redes disponíveis; com menos de 3, o relatório trata o estudo como de menos réplicas | Não |
| **D3** | Nomes por rodada | 80 (60 C3 + 10 C1 + 10 C2) | B, com C | 80; o rodízio que a proposta pressupõe já está implementado (V1) | Não |
| **D4** | Intervalo | 30 min. C mediu que o tempo da rodada não limita | B e C | 30 min | Não |
| **D5** | Duração e simultaneidade | 7 dias corridos, começando num dia útil, **nas três redes ao mesmo tempo** | Grupo | **Falta a data de início**, que precisa ser comum | **Sim** |
| **D9** | Responsáveis pelas etapas 5–9 | Registro, Parte 7 | Grupo | A proposta da Parte 7 vale | Não |
| **D10** | Sete categorias conforme a Aula 8 | — | B | Classificação provisória (Planejamento, 8) | Não |
| **D11** | Verificações de fonte | — | A | Ressalvas no texto | Não |
| **D12** | Artefato por participante em cada sprint | — | Grupo | Seguir a regra do Lab02 por precaução | Não |
| **L1** | Lista de domínios de C3 (Tranco congelada, 3 estratos, sorteio com semente, primeira linha reservada ao E-2), no formato `dominio estrato` por linha, com 60 por estrato | Planejamento, 9.7; R7; V1 | B | Sem a lista, só o piloto de 15 domínios, que **não serve** para a coleta definitiva | **Sim** |
| **R2** | Margem de 5 ms para a H-c2 | 3.2 | B | Fica valendo 5 ms, desde que fixada antes do início | Não |
| **P1** | Identificador de instância do Google (`o-o.myaddr.l.google.com` em `pop_id`) | DefinicaoDasMetricas, 2.4 | C | Sem ele; assimetria declarada como ameaça | Não |

---

## 9. Pronto para começar a coleta?

A coleta definitiva **só começa** quando todos os itens abaixo estiverem
marcados:

- [ ] **L1** — lista de C3 versionada em `Sprint02/dominios/c3.txt`
- [x] **V1** — rodízio implementado (24/11/2026)
- [ ] **D1** — zona funcionando 2 dias antes (modo A), ou modo B declarado
- [ ] **V3** — aquecimento de C2 implementado (só no modo A)
- [ ] **D5** — data de início comum às três redes
- [ ] **R2** — margem da H-c2 fixada
- [ ] Os três participantes com o Passo 1 aprovado, a ficha do Passo 2 e a
      rodada de teste do Passo 3 sem falhas
- [ ] Aceite dos três (seção 10)

**Situação em 24/11/2026: não pronto.** Bloqueiam L1, D5 e o aceite;
D1 e V3 bloqueiam apenas o modo A.

---

## 10. Aceite dos participantes

Cada participante confirma que leu este protocolo e vai segui-lo sem mudança.
Uma objeção a qualquer item marcado **[Decidida nesta revisão]** vai para a
coluna "Objeções", e o item volta a ser pendente.

| Participante | Rede | Sistema | Ambiente aprovado (Python · OpenSSL · dnspython) | Classificação da rede | Rodada de teste | Objeções | Data |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | `rede-a` | | | | | | |
| B | `rede-b` | | | | | | |
| C | `rede-c` | | | | | | |

---

## 11. O que este documento altera nos documentos da Sprint 01

| Documento | Seção | Situação |
| --- | --- | --- |
| PlanejamentoEPesquisa | 6 (hipóteses) | Complementada por 3 (R1–R4) |
| PlanejamentoEPesquisa | 9.4 ("somente IPv4") | Superada por 5.1: vale só para os públicos |
| PlanejamentoEPesquisa | 9.5, passo 1 ("o IP configurado") | Superada por R6: o DNS entregue pela rede |
| PlanejamentoEPesquisa | 9.6 (registro) | O esquema real tem 30 colunas (PlanoDeInstrumentacao, 6) |
| PlanoDeInstrumentacao | 3.2 (dois padrões por rede) | Superada por R6: um único `padrao` |
| DefinicaoDasMetricas | 2.5 (M10 em UTC) | Superada por R5 |
| ChecklistEntregaSprint01 | D3 | Número corrigido (V11) |
| `Sprint01/dados/README.md` | Esquema | Número de colunas corrigido (V11) |

O texto da versão 3 do planejamento **não foi reescrito**: ele continua sendo o
registro da Sprint 01, e este documento é a camada normativa da Sprint 02.
