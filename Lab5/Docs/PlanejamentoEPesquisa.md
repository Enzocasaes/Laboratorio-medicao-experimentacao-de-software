# Lab05 — Sprint 01 · Participante A: Planejamento e Pesquisa

**Objeto de estudo:** serviço público de resolução DNS **1.1.1.1**, da Cloudflare.
**Tema do experimento:** desempenho e confiabilidade de resolvedores DNS públicos
em redes de acesso brasileiras, com DNS tradicional e cifrado.
**Data de referência das fontes:** todas as fontes foram acessadas em
**18/11/2026**, salvo indicação em contrário.
**Versão:** 3 (fechamento das pendências da Sprint 01, 18/11/2026). O registro
das alterações está em [`RegistroDeRevisao.md`](RegistroDeRevisao.md) e a
situação da entrega em [`ChecklistEntregaSprint01.md`](ChecklistEntregaSprint01.md).

> **Sprint 02.** O protocolo da coleta definitiva foi consolidado em
> [`ProtocoloExperimental.md`](ProtocoloExperimental.md) (issue #129, 24/11/2026).
> Onde ele divergir deste documento — hipóteses (6), definição do resolvedor
> padrão (9.5), restrição a IPv4 (9.4) e faixas horárias (M10) —, vale o
> protocolo. Este texto permanece como registro da Sprint 01.

> **Convenção usada no texto.** **[Fato]** marca informação comprovada por
> fonte citada ou por medição do grupo. **[Hipótese]** marca expectativa ou
> explicação ainda não testada. **[Decisão]** marca escolha de desenho
> proposta pelo Participante A, que pode ser revista com os Participantes B e C.
> **[Pendente]** marca o que ainda precisa ser verificado ou decidido antes da
> coleta definitiva.

**Responsabilidade por seção.** O texto inteiro foi redigido pelo Participante
A. As seções que, pela divisão de papéis do grupo, cabem a B ou a C estão aqui
como **rascunho para validação** e só passam a valer depois da revisão do
responsável. A divisão abaixo foi informada pelo Participante A e ainda precisa
ser confirmada por B e C **[Pendente]**.

| Seções | Responsável principal | Situação |
| --- | --- | --- |
| 1 a 5, 6 (pergunta e justificativa), 7.1, 7.3, 7.5 | **A** | Pronto |
| 7.2 (pilotos) | **A** e **C** | Pronto; C herda os scripts para o coletor da S02 |
| 7.4 (métricas) | **A** (definição) e **C** (operacionalização) | Pronto para validação de C |
| 6 (hipóteses), 6.2, 8, 9.1, 9.2, 9.3, 9.7, 9.8 | **B** | Rascunho de A; aguarda validação de B |
| 9.4, 9.5, 9.6 | **C** | Rascunho de A; aguarda validação de C |
| 10 | **C**, com **B** em 10.3 | Rascunho de A; aguarda validação de B e C |
| 11 e 12 | Grupo (manutenção por A) | Pronto; atualizar a cada revisão |

---

## 1. Apresentação do software escolhido

| Item | Descrição |
| --- | --- |
| **Nome** | 1.1.1.1 (Cloudflare Public DNS Resolver) |
| **Responsável** | Cloudflare, Inc., com acordo de pesquisa com o APNIC (Asia Pacific Network Information Centre), que detém o bloco de endereços 1.1.1.0/24 [R3] |
| **Endereços** | IPv4 `1.1.1.1` e `1.0.0.1`; IPv6 `2606:4700:4700::1111` e `2606:4700:4700::1001` [R2] |
| **Protocolos** | DNS tradicional sobre UDP/TCP na porta 53 (Do53) [R20], DNS over TLS (DoT, porta 853) [R22] e DNS over HTTPS (DoH, porta 443) [R23], todos suportados pelo serviço [R1][R4] |
| **Lançamento** | 1º de abril de 2018 [R3] |

**Finalidade e principais funcionalidades.** O 1.1.1.1 é um **resolvedor DNS
recursivo público**. Toda vez que um dispositivo acessa um nome como
`www.exemplo.com.br`, ele precisa traduzir esse nome para um endereço IP. Em
geral essa tradução é feita pelo resolvedor do provedor de internet, mas o
usuário (ou o administrador da rede) pode configurar um resolvedor público no
lugar dele. O resolvedor recursivo consulta os servidores autoritativos em nome
do cliente e guarda as respostas em cache pelo tempo indicado no campo TTL de
cada registro [R20][R21]. A documentação oficial apresenta o 1.1.1.1 como
alternativa "mais rápida e mais privada" ao resolvedor do provedor e destaca
três recursos: suporte a DNS cifrado (DoH e DoT), compromisso de não vender
dados de usuários e uma variante com filtragem de malware e conteúdo adulto
(1.1.1.1 for Families) [R1][R5].

**Contexto de utilização.** O serviço é usado:

- por usuários finais que configuram manualmente o DNS no sistema operacional,
  no roteador doméstico ou no aplicativo 1.1.1.1/WARP;
- por navegadores: em 25/02/2020 o Firefox começou a ativar o DoH **por padrão**
  para usuários dos EUA, enviando as consultas cifradas à Cloudflare [R10]
  **[Fato]**. Não verificamos se essa configuração continua igual em 2026
  **[Pendente]**;
- em ambientes corporativos: o produto Cloudflare Gateway também foi afetado
  pelo incidente de 14/07/2025, com "intermittent degradation of service" [R6].

**Importância para o mercado e a sociedade.** O DNS é etapa obrigatória de
praticamente toda conexão na internet. Quando o resolvedor configurado falha, o
usuário perde acesso a quase tudo, mesmo que os sites estejam no ar. A
própria Cloudflare registrou isso no relatório do incidente de 14/07/2025:
para muitos usuários, não conseguir resolver nomes pelo 1.1.1.1 significou que
"basically all Internet services were unavailable" [R6] **[Fato]**. Além disso,
os dados agregados do 1.1.1.1 alimentam o Cloudflare Radar, observatório
público de tendências da internet [R5][R7].

---

## 2. Justificativa da escolha

### 2.1 Alternativas consideradas

Cinco candidatos foram avaliados de forma qualitativa. A avaliação não usa
números de popularidade, porque popularidade sozinha não decide a escolha. O
critério dominante foi a **possibilidade de medir o software em funcionamento,
de forma repetível, sem acesso privilegiado**. As notas da tabela são
julgamento do grupo, não medições.

| Candidato | Relevância | Informação pública | Facilidade de medir | Viabilidade do experimento | Motivo de descarte ou escolha |
| --- | --- | --- | --- | --- | --- |
| **Cloudflare 1.1.1.1** | Alta | Alta (documentação, blog técnico com números, relatórios de incidente, dados APNIC) | **Alta**: qualquer máquina mede latência com `dig` ou `dnspython` | **Alta**: tratamentos controláveis (resolvedor, protocolo, estado da conexão), milhares de observações por dia | **Escolhido** |
| Google Public DNS (8.8.8.8) | Alta | Média: o último volume oficial de consultas encontrado é de 2012 | Alta | Alta | Usado como **comparação**, não como objeto: as evidências de impacto atuais são mais fracas que as do 1.1.1.1 |
| Portal gov.br | Alta no Brasil | Média | Média: Lighthouse/CrUX medem a página, mas os serviços exigem login | Média: muitas variáveis fora de controle (mudanças no front-end, CDN) | Difícil isolar o que está sendo medido |
| Pix (Banco Central) | Muito alta no Brasil | Alta (estatísticas do BCB) | **Baixa**: medir transações exige contas reais e a API é restrita a instituições participantes | Baixa | Inviável medir o sistema em operação sem acesso institucional |
| WhatsApp | Muito alta | Baixa (dados técnicos internos não são públicos) | Baixa: exige instrumentar o cliente móvel; os termos de uso restringem automação | Baixa | Risco ético e técnico alto |

### 2.2 Por que o 1.1.1.1

1. **Atende aos três critérios com fontes primárias** (seções 3 a 5).
2. **É medível do lado do usuário sem nenhum acesso especial.** O serviço foi
   feito para receber consultas de qualquer pessoa, e a métrica principal
   (tempo de resolução) é obtida com a biblioteca `dnspython`, que suporta
   Do53, DoT e DoH [R14]. Os dois pilotos (seção 7.2) confirmaram isso.
3. **Permite um experimento de verdade, não só uma observação.** O grupo
   controla os fatores (qual resolvedor, qual protocolo, conexão nova ou
   reaproveitada, estado de cache, horário) e pode repetir as medições
   milhares de vezes a custo praticamente zero.
4. **A alegação central do fornecedor é testável.** A documentação afirma que o
   1.1.1.1 "has been measured as the fastest public DNS resolver" [R1], com base
   no DNSPerf, que testa os resolvedores a cada minuto a partir de mais de 200
   localidades de monitoramento, sobre IPv4 e com timeout de 1 s [R13]. Esse
   ranking global não mostra como o serviço se comporta em **redes de acesso
   brasileiras**, que é o cenário de quem decide trocar o DNS.
5. **O resultado interessa a quem usa.** Usuários, administradores de redes
   domésticas e de pequenas empresas escolhem o resolvedor com base em
   desempenho e privacidade, e o Brasil tem uso expressivo de resolvedores
   públicos (seção 5).
6. **Os pilotos já mostraram que a resposta não é óbvia** (seção 7.2).

---

## 3. Comprovação de que o software é real

| # | Informação encontrada | Fonte original | Link | Publicação | Acesso |
| --- | --- | --- | --- | --- | --- |
| E1 | Página oficial de documentação do 1.1.1.1 descreve o serviço como resolvedor DNS público gratuito, com suporte a DoH e DoT, que "runs on Cloudflare's network in hundreds of cities worldwide" | Cloudflare Developers Docs [R1] | https://developers.cloudflare.com/1.1.1.1/ | Atualizada em 30/04/2026 (metadado `dateModified`) | 18/11/2026 |
| E2 | Endereços oficiais: `1.1.1.1`, `1.0.0.1`, `2606:4700:4700::1111`, `2606:4700:4700::1001` | Cloudflare Developers Docs [R2] | https://developers.cloudflare.com/1.1.1.1/ip-addresses/ | Atualizada em 30/04/2026 | 18/11/2026 |
| E3 | Anúncio oficial do lançamento, em 01/04/2018, assinado pelo CEO Matthew Prince, com o acordo com o APNIC e o compromisso, na época, de apagar os logs em 24 horas | Blog da Cloudflare [R3] | https://blog.cloudflare.com/announcing-1111/ | 01/04/2018 | 18/11/2026 |
| E4 | Compromissos formais de privacidade em vigor: endereços IP truncados, logs apagados em até 25 horas, compartilhamento apenas com o APNIC, auditoria por "one of the top four accounting firms" | Cloudflare Developers Docs [R5] | https://developers.cloudflare.com/1.1.1.1/privacy/public-dns-resolver/ | "Last updated March 27, 2024" (texto visível) | 18/11/2026 |
| E5 | O 1.1.1.1 é medido de forma independente pelo APNIC Labs, que o identifica nas consultas de usuários reais de cada país (ver E12) | APNIC Labs [R8] | https://stats.labs.apnic.net/rvrs/BR | Série diária, atualizada continuamente | 18/11/2026 |
| E6 | Verificação direta: o resolvedor respondeu a todas as consultas feitas pelo grupo nos dois pilotos (seção 7.2) | Medição própria | — | 18/11/2026 | — |

**Uso real.** Além do uso direto por usuários finais (E12), o 1.1.1.1 foi
escolhido pela Mozilla como provedor padrão de DoH do Firefox nos EUA a partir
de 2020 [R10]. O fato de uma falha de configuração ter derrubado a internet de
"the majority of 1.1.1.1 users globally" em julho de 2025 [R6] também mostra
uso real e massivo.

---

## 4. Comprovação de que está em operação

| # | Informação encontrada | Fonte original | Link | Publicação | Acesso |
| --- | --- | --- | --- | --- | --- |
| E7 | Documentação técnica mantida: páginas do 1.1.1.1 com `dateModified` entre 30/04/2026 e 06/05/2026 (página principal, endereços IP, criptografia, política de privacidade) | Cloudflare Developers Docs [R1][R2][R4][R5] | https://developers.cloudflare.com/1.1.1.1/ | 2026 | 18/11/2026 |
| E8 | Relatório público de incidente: indisponibilidade global de 62 minutos, das 21:52 às 22:54 UTC de 14/07/2025. Detalha causa (mudança de configuração de 06/06/2025), linha do tempo e ações corretivas. Do53 e DoT foram afetados; o DoH via `cloudflare-dns.com` seguiu quase sem impacto, por usar outros endereços IP | Blog da Cloudflare [R6] | https://blog.cloudflare.com/cloudflare-1-1-1-1-incident-on-july-14-2025 | 15/07/2025 | 18/11/2026 |
| E9 | Publicação técnica com dados operacionais: média de 1,9 trilhão de consultas por dia, vindas de cerca de 250 países/regiões. Distribuição de protocolos em 19–26/02/2025: 86,6% UDP, 9,6% DoT, 2,0% TCP e 1,7% DoH. O próprio texto avisa que o DoH está **sub-representado**, porque o tráfego DoH da Mozilla e de outras grandes plataformas ficou fora da análise | Blog da Cloudflare, Belson e Gerhart [R7] | https://blog.cloudflare.com/new-dns-section-on-cloudflare-radar/ | 27/02/2025 | 18/11/2026 |
| E10 | Série diária do APNIC Labs com medições até **16/11/2026**, mostrando uso contínuo do 1.1.1.1 no Brasil e no mundo | APNIC Labs [R8][R9] | https://stats.labs.apnic.net/rvrs/BR | Série até 16/11/2026 | 18/11/2026 |
| E11 | Serviço respondendo no dia do acesso, a partir do ponto de presença de São Paulo (identificador `gru`, seção 7.2) | Medição própria | — | 18/11/2026 | — |

**Observação sobre "versão" e "releases".** O 1.1.1.1 é um serviço operado pela
própria Cloudflare (SaaS), não um software instalado pelo usuário. Por isso não
há números de versão públicos. As evidências de manutenção ativa são a
documentação atualizada (E7), o relatório de incidente com ações corretivas
(E8) e as publicações técnicas com dados operacionais (E9).

---

## 5. Comprovação de alto impacto

| # | Informação encontrada | Fonte original | Link | Publicação | Acesso |
| --- | --- | --- | --- | --- | --- |
| E12 | **Brasil:** em 16/11/2026, **7,539%** dos usuários brasileiros amostrados tinham consultas DNS atendidas pelo 1.1.1.1 (Google Public DNS: **24,093%**). Um ano antes, em 16/11/2025, os valores eram 7,705% e 25,295% | APNIC Labs, "Use of DNS Resolvers for Brazil (BR)" [R8] | https://stats.labs.apnic.net/rvrs/BR | Série diária, último ponto 16/11/2026 | 18/11/2026 |
| E13 | **Mundo:** em 16/11/2026, **4,279%** dos usuários amostrados globalmente usavam o 1.1.1.1 (Google: **12,067%**). É o segundo resolvedor público mais usado entre os que o APNIC acompanha | APNIC Labs, "Use of DNS Resolvers for World (XA)" [R9] | https://stats.labs.apnic.net/rvrs/XA | Série diária, último ponto 16/11/2026 | 18/11/2026 |
| E14 | Volume: média de **1,9 trilhão de consultas por dia** (dado declarado pelo operador) | Blog da Cloudflare [R7] | https://blog.cloudflare.com/new-dns-section-on-cloudflare-radar/ | 27/02/2025 | 18/11/2026 |
| E15 | Análise independente: "Cloudflare service being the second largest open DNS recursive resolver on the Internet" (17% dos usuários no Google, 3% na Cloudflare e menos de 1% no OpenDNS, em 2022) | APNIC Blog, Geoff Huston [R11] | https://blog.apnic.net/2022/09/02/doh-dot-and-plain-old-dns/ | 02/09/2022 | 18/11/2026 |
| E16 | Provedor padrão do DoH ativado por padrão no Firefox para usuários dos EUA, a partir de 25/02/2020 | Mozilla Blog [R10] | https://blog.mozilla.org/en/products/firefox/firefox-continues-push-to-bring-dns-over-https-by-default-for-us-users/ | 25/02/2020 | 18/11/2026 |
| E17 | Impacto de uma falha: indisponibilidade global atingiu "the majority of 1.1.1.1 users globally" | Blog da Cloudflare [R6] | https://blog.cloudflare.com/cloudflare-1-1-1-1-incident-on-july-14-2025 | 15/07/2025 | 18/11/2026 |

**Como ler os percentuais do APNIC.** O APNIC Labs mede o comportamento de
usuários finais com anúncios on-line: "APNIC Labs uses online advertisements
(ads) to perform such measurements", com 15 a 20 milhões de impressões por dia,
e "each measurement test in each impressed ad uses a different DNS label" para
evitar que caches interfiram. Os dados de cada país são ponderados pela
quantidade de usuários de internet do país [R19]. O número publicado é a
**proporção de usuários amostrados** cujas consultas chegam àquele resolvedor
("ratio of users whose queries are passed to the open recursive resolvers on
the first query" [R11]). Não é fatia de mercado em número de consultas. As
fontes não deixam claro se um mesmo usuário pode ser contado em mais de um
resolvedor **[Pendente]**. Os valores foram extraídos da série diária
publicada na página em 18/11/2026.

**Síntese.** O impacto se sustenta por três evidências independentes entre si:
o volume declarado pelo operador (E14), a medição externa do APNIC (E12, E13 e
E15) e o efeito observado de uma falha (E17). No Brasil, cerca de 1 em cada 13
usuários amostrados tem consultas atendidas pelo 1.1.1.1.

---

## 6. Pergunta de pesquisa

> **RQ.** Nas redes de acesso brasileiras usadas pelo grupo, o resolvedor
> público 1.1.1.1 resolve nomes **mais rápido e com menor variabilidade** do
> que o Google Public DNS (8.8.8.8) e o resolvedor padrão da rede? Quanto de
> latência os protocolos cifrados (DoT e DoH) acrescentam em relação ao DNS
> tradicional (Do53), com conexão nova e com conexão reaproveitada?

**Por que a pergunta é mensurável.** Cada consulta DNS produz um tempo de
resposta em milissegundos e um resultado (sucesso, timeout ou erro). Os dois
são registrados no cliente, sem depender de dados internos da Cloudflare.

**Escopo e limites.** **[Decisão]** Os detalhes estão na seção 9.

- **Tratamentos:** 1.1.1.1 e 8.8.8.8 em Do53, DoT e DoH; resolvedor padrão
  da rede apenas em Do53 (em geral é o único protocolo que ele oferece).
- **Pontos de coleta:** as redes de acesso que os integrantes do grupo usam
  (residenciais e a rede da universidade), identificadas pelo provedor (AS) e
  pela cidade.
- **Período:** coleta contínua de pelo menos 7 dias, para cobrir dias úteis,
  fim de semana e todas as faixas horárias.
- **Generalização:** os resultados valem para essas redes. Eles **não**
  representam o Brasil inteiro, e o relatório dirá isso explicitamente.

### 6.1 Justificativa da pergunta

1. **A alegação de desempenho não foi medida no cenário de quem decide.** A
   documentação afirma que o 1.1.1.1 é o resolvedor público mais rápido [R1],
   mas a fonte citada (DNSPerf) mede a partir de pontos de monitoramento
   espalhados pelo mundo, com resultado agregado [R13]. A latência percebida em
   uma rede doméstica brasileira depende da distância até o ponto de presença
   anycast mais próximo, da rota escolhida pelo provedor e do estado do cache.
   Nada disso aparece nesse ranking.
2. **O uso no Brasil é alto.** Cerca de 24% dos usuários amostrados usam o
   Google Public DNS e cerca de 7,5% usam o 1.1.1.1 (E12). A escolha entre
   eles e o resolvedor do provedor afeta milhões de pessoas.
3. **O custo do DNS cifrado depende de como a conexão é usada.** A literatura
   já mediu esse custo em larga escala. Böttger et al. [R29] mostraram que o
   DoH tem custo por consulta maior que o Do53, mas efeito limitado no tempo de
   carregamento de páginas, sobretudo com conexões persistentes. Hounsel et al.
   [R30] compararam Do53, DoT e DoH no carregamento de páginas. Lu et al. [R31]
   mediram DoT e DoH a partir de dezenas de milhares de pontos em 166 países. O
   que falta é uma medição **nas redes concretas** em que o usuário toma a
   decisão, separando conexão nova de conexão reaproveitada. O grupo não fez
   busca sistemática por estudos feitos especificamente a partir de redes
   brasileiras **[Pendente]**.
4. **Confiabilidade importa tanto quanto velocidade.** O incidente de 2025 (E8)
   mostrou que depender de um único resolvedor tem custo. Medir taxa de falha e
   cauda da distribuição (p95) responde a isso de forma objetiva.
5. **Os pilotos já contrariaram a expectativa simples** (seção 7.2). O
   resolvedor da rede local foi o mais rápido, e o 8.8.8.8 teve uma cauda longa
   que a média esconderia. A pergunta tem resposta incerta, e é isso que a
   torna digna de um experimento.

**[Hipóteses de trabalho]** (formalizadas como H₀/H₁ na seção 10):

- H-a: em Do53, a mediana de latência do 1.1.1.1 é menor que a do 8.8.8.8.
- H-b: o resolvedor padrão da rede tem a menor mediana quando a resposta já
  está em cache, por estar mais próximo do cliente, mas perde essa vantagem
  quando a resolução recursiva é necessária.
- H-c: com conexão nova, DoT e DoH custam dezenas de milissegundos a mais que
  o Do53, por causa dos handshakes TCP e TLS [R24]. Com conexão reaproveitada,
  a diferença cai para poucos milissegundos.

### 6.2 Caminho de pesquisa

O caminho vai da pergunta à resposta em nove etapas. As etapas 1 a 4 compõem a
Sprint 01; as demais são o plano para as sprints seguintes. A divisão das
etapas 5 a 9 entre os Participantes A, B e C ainda precisa ser combinada
**[Pendente]**.

| Etapa | Atividade | Produto | Sprint |
| --- | --- | --- | --- |
| 1 | Escolha do software e levantamento documental das evidências | Seções 1 a 5 | S01 (feito) |
| 2 | Pergunta de pesquisa, hipóteses e GQM | Seções 6 e 7 | S01 (feito) |
| 3 | Pilotos de viabilidade da instrumentação | Seção 7.2 e scripts em `Lab5/Sprint01/piloto/` | S01 (feito) |
| 4 | Classificação da pesquisa, desenho, plano de coleta e plano de análise | Seções 8, 9 e 10 | S01 (feito, com decisões pendentes) |
| 5 | Validação de cada rede de coleta (resolvedor padrão, interceptação, ambiente) | Ficha de cada rede (seção 9.5) | S02 |
| 6 | Seleção e qualificação dos domínios; preparação da zona de teste | Lista de domínios congelada e versionada | S02 |
| 7 | Coleta contínua de pelo menos 7 dias | Registros brutos (CSV ou Parquet) | S02 |
| 8 | Limpeza, classificação das falhas e análise descritiva e inferencial | Tabelas, gráficos e testes (seção 10) | S02–S03 |
| 9 | Interpretação, ameaças à validade e relatório final | Relatório do Lab05 | S03 |

---

## 7. Objetivo segundo o GQM

O modelo Goal-Question-Metric [R15] parte de um objetivo formal, desdobra o
objetivo em perguntas operacionais e associa a cada pergunta métricas que a
respondem. A definição do objetivo segue o modelo de escopo de experimentos de
Wohlin et al. [R18], que usa os mesmos cinco elementos.

### 7.1 Estrutura do objetivo

| Elemento GQM | Definição |
| --- | --- |
| **Analyze** (Analisar) | o serviço público de resolução DNS 1.1.1.1 da Cloudflare |
| **For the purpose of** (com o propósito de) | avaliar e comparar |
| **With respect to** (com respeito a) | desempenho (latência de resolução) e confiabilidade (taxa de falhas e estabilidade da latência) |
| **From the viewpoint of** (do ponto de vista de) | usuários finais e administradores de redes domésticas e de pequenas organizações que escolhem qual resolvedor configurar |
| **In the context of** (no contexto de) | consultas originadas de redes de acesso brasileiras usadas pelos integrantes do grupo, comparadas com Google Public DNS e com o resolvedor padrão da rede, em DNS tradicional (Do53) e cifrado (DoT e DoH), durante um período contínuo de pelo menos 7 dias |

**Goal (declaração completa).** Analisar o serviço público de resolução DNS
1.1.1.1 da Cloudflare, com o propósito de avaliá-lo e compará-lo, com respeito
a desempenho (latência de resolução) e confiabilidade (taxa de falhas e
estabilidade), do ponto de vista de usuários finais e administradores de redes
que escolhem qual resolvedor configurar, no contexto de consultas originadas de
redes de acesso brasileiras usadas pelo grupo, comparadas com o Google Public
DNS e com o resolvedor padrão da rede, em DNS tradicional e cifrado, durante
pelo menos 7 dias de coleta contínua.

### 7.2 Pilotos de viabilidade (18/11/2026)

Os dois pilotos usaram a mesma rede de um integrante e consultas do tipo A.
Eles **não são resultado do experimento**: as amostras são pequenas, de uma
única rede e de um único horário. Servem para testar a instrumentação e
encontrar problemas antes da coleta.

#### Piloto 1 — Do53 com `dig`

Foram feitas 10 consultas para cada combinação de resolvedor e domínio
(`google.com`, `wikipedia.org`, `gov.br`), com `dig` 9.10.6 (macOS), timeout
de 2 s e uma única tentativa. Foram 30 consultas por resolvedor. O p95 foi
calculado por interpolação (`statistics.quantiles`, n = 20) e, com n = 30, é
instável.

| Resolvedor | n | Mediana (ms) | p95 (ms) | Mín–Máx (ms) | Falhas |
| --- | --- | --- | --- | --- | --- |
| 1.1.1.1 | 30 | 21,0 | 25,5 | 19–26 | 0 |
| 8.8.8.8 | 30 | 23,0 | 126,4 | 19–188 | 0 |
| Padrão da rede | 30 | 7,0 | 14,4 | 4–21 | 0 |

- **[Fato]** Nas consultas a `google.com`, o 8.8.8.8 alternou entre cerca de
  21 ms e cerca de 69–76 ms. Por isso a análise deve usar mediana e
  percentis, não só média.
- **[Fato]** O resolvedor padrão da rede do piloto tem endereço privado, ou
  seja, é um encaminhador local. As sondas do piloto 2 indicaram que ele repassa
  ao menos parte das consultas ao Google Public DNS (ver abaixo). Os 7 ms
  medem principalmente o cache desse encaminhador, e não um resolvedor
  independente. **[Hipótese]**
- **[Fato]** O `dig` do macOS (9.10.6) não suporta DoT nem DoH.

#### Piloto 2 — Do53, DoT e DoH com `dnspython`

O script mediu, por resolvedor, 10 repetições de cada condição para
`google.com` (já aquecido no cache por uma consulta prévia). Também mediu o
tempo de conexão TCP às portas 853 e 443 como estimativa do RTT de rede. As
condições foram:

- Do53 via `dns.query.udp_with_fallback`;
- DoT com conexão nova a cada consulta, com os handshakes TCP e TLS
  cronometrados à parte;
- DoT com a mesma conexão reaproveitada;
- DoH (HTTP/2, URL por IP, por exemplo `https://1.1.1.1/dns-query`) com
  cliente novo a cada consulta;
- DoH com o mesmo cliente reaproveitado.

O script rodou em dois ambientes Python da mesma máquina, com um minuto de
intervalo (~22:33 UTC):

- **Ambiente A:** Python 3.9.6 do macOS, LibreSSL 2.8.3, dnspython 2.7.0;
  negociou **TLS 1.2**.
- **Ambiente B:** Python 3.11.18 (Homebrew), OpenSSL 3.6.4, dnspython 2.9.2;
  negociou **TLS 1.3**.

Medianas em ms (n = 10 por célula):

| Condição | 1.1.1.1 (A) | 1.1.1.1 (B) | 8.8.8.8 (A) | 8.8.8.8 (B) |
| --- | --- | --- | --- | --- |
| RTT de rede (TCP connect :443) | 20,4 | 22,5 | 22,8 | 21,8 |
| Do53 | 22,0 | 26,1 | 75,9 | 24,7 |
| DoT, conexão nova (total) | 100,0 | 171,8 | 158,3 | 282,5 |
| ↳ handshake TLS | 49,1 (TLS 1.2) | 33,7 (TLS 1.3) | 99,4 (TLS 1.2) | 82,3 (TLS 1.3) |
| ↳ 1ª consulta após o handshake | 21,5 | **87,4** | 26,8 | **119,2** |
| DoT, conexão reaproveitada | 23,2 | 23,6 | 26,6 | 26,0 |
| DoH, cliente novo (total) | 114,8 | 113,8 | 261,6 | 166,9 |
| DoH, cliente reaproveitado | 26,9 | 29,4 | 27,4 | 35,9 |

Em seguida, um teste específico no ambiente B mediu a primeira consulta DoT
após o handshake, com e sem a opção `TCP_NODELAY` no socket (10 conexões em
cada caso):

| Resolvedor | Sem `TCP_NODELAY` | Com `TCP_NODELAY` |
| --- | --- | --- |
| 1.1.1.1 | 85,9 ms | 23,6 ms |
| 8.8.8.8 | 121,5 ms | 36,3 ms |

**O que os pilotos mostram e o que muda no plano:**

1. **[Fato]** Com a conexão reaproveitada, DoT e DoH ficaram a poucos
   milissegundos do Do53. Com conexão nova, custaram de cerca de 100 ms a mais
   de 250 ms. Esse padrão é compatível com H-c.
2. **[Fato]** A versão do TLS depende da biblioteca do cliente, não só do
   servidor. O Python do macOS não oferece TLS 1.3 (`ssl.HAS_TLSv1_3 = False`)
   e negociou TLS 1.2, com handshake mais longo. **Correção:** a coleta exige
   Python com OpenSSL e suporte a TLS 1.3, verificado na inicialização do
   script (seção 9.4).
3. **[Fato]** Com TLS 1.3 e sem `TCP_NODELAY`, a primeira consulta após o
   handshake atrasou cerca de 60 ms. Com `TCP_NODELAY`, o atraso sumiu. O
   `dns.query.tls` do dnspython não liga essa opção, enquanto o cliente HTTP
   usado no DoH (`httpcore`) a liga automaticamente (verificado no código-fonte
   das versões instaladas). Sem correção, o experimento atribuiria ao DoT um
   custo que é artefato do cliente e favoreceria o DoH na comparação.
   **[Hipótese]** O mecanismo provável é o algoritmo de Nagle [R25] retendo a
   consulta até a confirmação do último segmento do handshake. **Correção:**
   `TCP_NODELAY` obrigatório em todo socket TCP aberto pelo script.
4. **[Fato]** O 8.8.8.8 respondeu ao Do53 com mediana de 75,9 ms no ambiente A
   e de 24,7 ms no ambiente B, um minuto depois, com RTT de rede de cerca de
   22 ms nos dois casos. A diferença não está na rede. Por isso o RTT de rede
   passa a ser registrado em toda rodada (métrica M11), para separar a
   distância do tempo gasto no servidor.
5. **[Fato]** O ponto de presença da Cloudflare respondeu `gru22` na primeira
   execução e `gru02` na segunda (consulta `id.server`, classe CHAOS). Ambos
   ficam em São Paulo, mas a instância muda entre execuções. O identificador
   passa a ser registrado em toda rodada.
6. **[Fato]** Na consulta de diagnóstico `o-o.myaddr.l.google.com`, o 8.8.8.8
   repassou ao servidor autoritativo a sub-rede do cliente (EDNS Client Subnet,
   ECS [R28]); o 1.1.1.1 não repassou. **[Hipótese]** O ECS divide o cache por
   sub-rede de cliente [R28], o que pode reduzir a taxa de acertos de cache do
   8.8.8.8 para domínios que usam ECS. O experimento não testa esse mecanismo,
   mas o registra como possível explicação.
7. **[Fato]** Consultado pelo resolvedor padrão da rede do piloto, o nome
   `whoami.akamai.net` (que devolve o endereço de quem consultou o servidor
   autoritativo) retornou um endereço do AS15169, do Google, segundo o serviço
   IP-to-ASN da Team Cymru [R41]. O nome `o-o.myaddr.l.google.com`, consultado
   pelo mesmo caminho, retornou um endereço fora desse bloco. Isso indica que o
   resolvedor padrão dessa rede encaminha ao menos parte das consultas ao
   Google Public DNS. Por isso o procedimento de validação da seção 9.5 é
   obrigatório.
8. **[Fato]** As medições frias variaram muito entre as duas execuções, feitas
   com um minuto de intervalo (por exemplo, DoH frio do 8.8.8.8: 261,6 e
   166,9 ms). Isso confirma que n = 10 em um único horário serve para
   validar a instrumentação, mas não para tirar conclusões.

### 7.3 Questions (perguntas)

| ID | Pergunta |
| --- | --- |
| **Q1** | Qual é a latência de resolução do 1.1.1.1 em Do53, comparada à do 8.8.8.8 e à do resolvedor padrão, para os domínios da amostra no seu estado natural de cache? |
| **Q2** | Como essa comparação muda conforme o estado de cache da resposta: ausência de cache forçada, cache quente e estado natural? |
| **Q3** | Quanto de latência DoT e DoH acrescentam ao 1.1.1.1 e ao 8.8.8.8, em relação ao Do53, quando a conexão é nova (inclui os handshakes) e quando é reaproveitada? |
| **Q4** | Quão confiável e estável é o 1.1.1.1 ao longo do período: qual a taxa de falhas, a dispersão da latência e a variação entre faixas horárias? |

### 7.4 Metrics (métricas)

Todas as métricas são calculadas a partir de **um registro por consulta**
(esquema na seção 9.6). A unidade de pareamento é o **bloco**: rede × rodada ×
posição consultada. Em C3 e C2, a posição é o próprio nome. Em C1, é uma
posição sorteada da rodada, e cada resolvedor recebe um nome único diferente
(seção 9.3). Dentro de um bloco, todos os tratamentos são aplicados em ordem
aleatória, com poucos segundos de diferença. A unidade de **inferência** muda
conforme a condição de cache e está definida na seção 10.2.

| ID | Métrica | Definição operacional | Como é obtida | Unidade | Responde |
| --- | --- | --- | --- | --- | --- |
| **M1** | Latência de resolução | Do53: do envio da consulta até a resposta decodificada. DoT/DoH com conexão reaproveitada: o mesmo, sobre a conexão já aberta. DoT/DoH com conexão nova: da abertura do socket até a resposta decodificada, incluindo os handshakes | `time.perf_counter()` em volta das chamadas da seção 9.4. Consultas enviadas direto ao IP do resolvedor, sem passar pelo cache do sistema operacional | ms | Q1–Q4 |
| **M2** | Mediana e p95 da latência | Percentis 50 e 95 de M1 por tratamento, calculados primeiro dentro de cada unidade de inferência (nome em C3, janela de 6 h em C1 e C2) e depois resumidos entre unidades | pandas; o p95 só é reportado quando houver pelo menos 100 observações na célula **[Decisão]** | ms | Q1, Q2, Q4 |
| **M3** | Diferença pareada de latência | Para cada bloco, Δ = M1(1.1.1.1) − M1(comparador). Resume-se pela mediana de Δ dentro de cada unidade de inferência (nome em C3; janela de 6 h em C1 e C2) e, depois, pela mediana entre unidades, com IC de 95% | Bootstrap por conglomerado: reamostram-se as **unidades de inferência** com reposição, mantendo juntas todas as observações de cada uma; 10.000 réplicas; intervalo percentil (ou BCa) [R33][R34] | ms | Q1, Q2 |
| **M4** | Tamanho de efeito | (a) Para o teste pareado: r = \|Z\| / √n do Wilcoxon sobre as medianas por unidade de inferência (nome ou janela), como no Lab02. (b) Descritivo: delta de Cliff, δ = P(X₁ < X₂) − P(X₁ > X₂), com X = latência; δ > 0 indica que o 1.1.1.1 tende a ser mais rápido [R17]. Limiares de Romano et al.: \|δ\| < 0,147 desprezível, < 0,33 pequeno, < 0,474 médio, demais grande [R32] | Calculados sobre as medianas por unidade de inferência; o delta de Cliff ignora o pareamento e por isso é só descritivo | adimensional | Q1, Q2 |
| **M5** | Taxa de vitória | Proporção de blocos em que o 1.1.1.1 respondeu mais rápido que o comparador. Diferenças menores que ε = 1 ms contam como empate **[Decisão]**; falha conta como derrota de quem falhou | Contagem por bloco; IC de 95% por bootstrap por conglomerado (mesmas unidades de M3) | % | Q1, Q2 |
| **M6** | Verificação do estado de cache (checagem de manipulação) | Confere se cada condição de cache da seção 9.3 realmente produziu o estado pretendido. C1: a consulta chegou ao servidor autoritativo (log da zona) ou voltou com o TTL integral. C2: a consulta voltou com TTL menor que o configurado. C3: só descritivo (razão TTL retornado ÷ TTL autoritativo) | Comparação com o TTL **conhecido** da zona controlada pelo grupo e, quando disponível, com o log do servidor autoritativo | % de consultas no estado pretendido | Q2 (valida a manipulação) |
| **M7** | Custo do protocolo cifrado | Para cada bloco (rodada × nome C2) e resolvedor: (a) custo com conexão nova, Δ = M1(DoX nova) − M1(Do53); (b) custo com conexão reaproveitada, Δ = M1(DoX reaproveitada) − M1(Do53). Resume-se como em M3 (mediana por janela de 6 h e, depois, entre janelas). O custo relativo é Δ ÷ M1(Do53) | Calculado a partir de M1; os tempos de handshake TCP e TLS são registrados à parte, apenas para análise exploratória | ms e % | Q3 |
| **M8** | Taxa de falhas | (timeouts + SERVFAIL + REFUSED + erros de transporte) ÷ consultas válidas, com timeout de 2 s e uma tentativa. Falhas atribuídas à rede local ou ao domínio são excluídas pela regra da seção 10.4 | Contagem; IC de Wilson [R37] como aproximação descritiva. Como as falhas tendem a se concentrar em certas rodadas e nomes, o IC de referência é o bootstrap por conglomerado (seção 10.5). Comparação entre resolvedores na seção 10.3 | % | Q4 |
| **M9** | Dispersão da latência | Intervalo interquartil (IQR) e dispersão relativa IQR ÷ mediana | Por tratamento | ms e adimensional | Q4 |
| **M10** | Variação por faixa horária | M2 e M8 por faixa (00–06h, 06–12h, 12–18h, 18–24h, horário de Brasília) | Agrupamento pelo carimbo de tempo | ms e % | Q4 |
| **M11** | RTT de rede ao resolvedor | Tempo de estabelecimento da conexão TCP (`connect`) à porta 443 de cada resolvedor público, medido em toda rodada. Para o resolvedor padrão, usa-se a porta 53 via TCP, se ele aceitar | `socket.create_connection` cronometrado | ms | Covariável de Q1–Q4 |

**Por que M6 mudou.** Na versão 1, M6 inferia "resposta em cache" comparando o
TTL retornado pelo resolvedor com o TTL obtido no servidor autoritativo. Essa
inferência não é confiável em domínios de terceiros:

- **O TTL só cai em segundos inteiros.** Uma resposta que acabou de entrar no
  cache volta com o TTL integral, igual a uma resposta que veio do autoritativo
  [R20][R21].
- **Resolvedores alteram o TTL.** Muitos aplicam TTL mínimo ou máximo, e alguns
  renovam registros populares antes de expirarem (prefetch). Em qualquer desses
  casos o TTL retornado deixa de refletir o tempo em cache.
- **Respostas de cache vencido podem voltar com TTL arbitrário.** Com
  *serve-stale*, o resolvedor responde com dados vencidos e TTL recomendado de
  30 s [R26].
- **O "TTL do autoritativo" nem sempre é um valor único.** Domínios de CDN usam
  TTLs curtos e respostas que variam por localização, e servidores
  autoritativos diferentes do mesmo domínio podem devolver TTLs diferentes.
- **Resolvedores anycast têm muitos caches independentes.** O cache que
  respondeu a uma consulta pode não ser o mesmo que responde à seguinte
  [Hipótese, compatível com a variação de instância observada no piloto 2].

Por isso o estado de cache passa a ser **controlado pelo desenho** (seção 9.3),
como faz o próprio APNIC Labs, que usa um rótulo DNS único por teste para
eliminar a interferência de caches [R19]. O TTL continua útil, mas apenas numa
zona controlada pelo grupo, em que o TTL configurado é conhecido. Ali ele vira
uma checagem de que a manipulação funcionou.

**Por que M9 mudou.** O coeficiente de variação (desvio-padrão ÷ média) é
dominado pela cauda em distribuições assimétricas como a latência, que tem
picos raros de centenas de milissegundos (piloto 1). IQR ÷ mediana mede a
mesma ideia de dispersão relativa de forma robusta.

### 7.5 Relação entre Goal, Questions e Metrics

```
GOAL: avaliar desempenho e confiabilidade do 1.1.1.1 para o usuário em redes brasileiras
│
├── Q1 Latência Do53, estado natural ─────────── M1, M2, M3, M4, M5   (+ M11 covariável)
├── Q2 Latência por estado de cache ──────────── M1, M2, M3, M4, M5, M6 (M6 valida a manipulação)
├── Q3 Custo do DNS cifrado ─────────────────── M1, M7                (+ M11 covariável)
└── Q4 Confiabilidade e estabilidade ───────── M1, M2, M8, M9, M10
```

O objetivo tem duas dimensões de qualidade, **desempenho** e
**confiabilidade**, e as perguntas as dividem em situações que o usuário
realmente encontra.

- **Q1 e Q2** separam o caso comum (resposta em cache) do caso caro (resolução
  completa). Um resolvedor pode vencer em um caso e perder no outro. A M6 não
  responde a uma pergunta: ela confere se as condições de cache foram de fato
  produzidas.
- **Q3** isola o fator protocolo e o estado da conexão, que são decisões
  independentes da escolha do resolvedor.
- **Q4** cobre a dimensão de confiabilidade.

Do lado das métricas, a **M1** é a medida básica comum a todas as perguntas, e
as demais são agregações dela. A **M2** e a **M3** respondem "quanto mais
rápido"; a **M4** e a **M5** respondem "com que frequência mais rápido"; a
**M8**, a **M9** e a **M10** respondem "com que segurança". A **M11** separa a
distância de rede do tempo gasto no resolvedor. Todas são calculadas a partir
de dados que o próprio grupo coleta, o que garante a rastreabilidade das
conclusões até os registros brutos.

---

## 8. Classificação da pesquisa

> **Versão provisória, não validada com o material do professor [Pendente].**
> Em 18/11/2026 o material da Aula 8 foi procurado no repositório, em todas
> as branches, no histórico do Git, nos relatórios finais dos Labs 01 e 02 e
> na pasta da disciplina, e não foi encontrado. Os **nomes** das sete
> categorias abaixo foram informados pelo grupo como os da Aula 8. Os
> **níveis** de cada categoria e suas definições vêm de Prodanov e Freitas
> [R39], Wohlin et al. [R18] e Kitchenham [R38], e ainda precisam ser
> confrontados com a aula. Quando houver divergência, vale a classificação da
> disciplina.

| Categoria | Classificação | Justificativa |
| --- | --- | --- |
| **Natureza** | Aplicada | Gera conhecimento para uma decisão prática: qual resolvedor e qual protocolo configurar em uma rede [R39]. |
| **Objetivos** | Explicativa, com componente descritivo | Testa se o fator "resolvedor" e o fator "protocolo/conexão" produzem diferenças de latência e de falhas (explicativa) e caracteriza as distribuições observadas (descritiva) [R39]. O estudo não explica o **mecanismo interno** dos resolvedores, como o efeito do ECS, que fica como hipótese. |
| **Abordagem** | Quantitativa | Todas as variáveis dependentes são numéricas (ms, %) e a análise é estatística. |
| **Procedimentos** | Experimental, apoiada por pesquisa documental | Os pesquisadores manipulam os tratamentos e randomizam a ordem de aplicação (experimental). As evidências das seções 3 a 5 vêm de documentos oficiais e relatórios técnicos (documental) [R39]. |
| **Temporalidade** | Longitudinal de curta duração | As mesmas redes e os mesmos nomes são medidos repetidamente ao longo de pelo menos 7 dias, justamente para observar a variação no tempo (M10). Uma única rodada seria um estudo transversal. |
| **Controle das variáveis** | Experimento controlado de campo, em blocos completos aleatorizados | Todo nome recebe todos os tratamentos, em ordem aleatória a cada rodada, o que caracteriza um desenho em blocos com alocação aleatória da ordem. Por isso não é um quase-experimento no sentido de Wohlin et al. [R18]. O ambiente, porém, é a internet real (*in vivo*), sem controle sobre rotas e carga. As redes não são sorteadas, o que limita a generalização, mas não muda a classificação do controle. |
| **Nível de evidência** | Estudo comparativo com aleatorização, de alcance local | Na hierarquia de evidências adaptada à Engenharia de Software por Kitchenham [R38], estudos com alocação aleatória ficam acima de estudos comparativos sem aleatorização e de estudos de caso. O estudo tem boa validade interna, pelos tratamentos pareados e pela ordem aleatória, mas validade externa limitada às redes medidas. O nível exato na escala da Aula 8 precisa ser conferido **[Pendente]**. |

**Ajustes previstos se a Aula 8 usar outra escala.** Para agilizar a
conferência pelo Participante B:

- **Objetivos (exploratória × descritiva × explicativa):** se a aula pedir um
  único nível, usar **explicativa**, porque o estudo testa hipóteses sobre o
  efeito de fatores manipulados.
- **Procedimentos:** se a lista da aula não tiver "experimental" separado de
  "estudo de caso" ou "levantamento", **experimental** continua sendo o mais
  adequado, porque há manipulação dos tratamentos.
- **Temporalidade (transversal × longitudinal):** se a aula definir
  "longitudinal" como acompanhamento por meses ou anos, a classificação mais
  honesta passa a ser "transversal com medidas repetidas", e a justificativa
  precisa mencionar os 7 dias.
- **Controle das variáveis (experimental × quase-experimental × não
  experimental):** se a aula exigir sorteio das unidades, e não só da ordem
  dos tratamentos, para chamar o estudo de experimento, a classificação passa a
  ser **quase-experimento**. As redes não são sorteadas, e esse ponto precisa
  ser conferido.
- **Nível de evidência:** usar a escala da aula. A justificativa acima
  (aleatorização da ordem, pareamento, alcance local) vale para qualquer
  escala.

---

## 9. Desenho experimental e plano de coleta

> Os números desta seção são **propostas** do Participante A **[Decisão]**.
> Os valores finais precisam ser fechados com os Participantes B e C
> (ver [`RegistroDeRevisao.md`](RegistroDeRevisao.md), Parte 4).

### 9.1 Variáveis

| Tipo | Variável | Níveis ou unidade |
| --- | --- | --- |
| **Independente (fator principal)** | Resolvedor | 1.1.1.1 · 8.8.8.8 · padrão da rede |
| **Independente** | Protocolo | Do53 · DoT · DoH (o padrão da rede só em Do53) |
| **Independente** | Estado da conexão (só DoT e DoH) | nova · reaproveitada |
| **Independente** | Condição de cache | C1 ausência forçada · C2 cache quente · C3 natural |
| **Dependente** | Latência (M1) | ms |
| **Dependente** | Resultado da consulta (M8) | sucesso · timeout · SERVFAIL · REFUSED · erro de transporte |
| **Bloco** | Rede de coleta | uma por ponto de coleta (identificada por AS, cidade, cabo ou Wi-Fi) |
| **Bloco** | Rodada | carimbo de tempo UTC |
| **Bloco** | Posição consultada | domínio da amostra (C3), nome fixo da zona de teste (C2) ou posição sorteada com nomes únicos por resolvedor (C1) |
| **Covariável** | RTT de rede (M11), identificador do ponto de presença, TTL retornado, uso de TCP no Do53 | ms · texto · s · booleano |

**Unidade experimental e unidade de análise.** A unidade de observação é a
**consulta**. A unidade de pareamento é o **bloco** rede × rodada × posição.
A unidade de inferência, dentro de cada rede, é o **nome** em C3 e a **janela
de 6 h** em C1, C2 e E-2. As rodadas são medidas repetidas e não podem ser
tratadas como observações independentes (seção 10.2).

### 9.2 Tratamentos e sub-experimentos

Para não multiplicar combinações sem necessidade, o desenho se divide em dois
sub-experimentos que compartilham as rodadas:

- **E-1 (Q1, Q2, Q4): resolvedor × condição de cache, em Do53.** 3 resolvedores
  × 3 condições de cache. É o experimento principal.
- **E-2 (Q3): protocolo × estado da conexão, nos resolvedores públicos.**
  2 resolvedores × {Do53, DoT nova, DoT reaproveitada, DoH nova, DoH
  reaproveitada}, sempre em nomes de cache quente (C2). Assim o tempo de
  recursão não se mistura com o custo de transporte.

### 9.3 Condições de cache

| Condição | Como é produzida | O que mede | Requisito |
| --- | --- | --- | --- |
| **C1 — ausência forçada** | Consulta a um nome único, gerado na hora e **diferente para cada resolvedor** (por exemplo, `<rede>-<rodada>-<resolvedor>-<uuid>.c1.<zona-do-grupo>`), respondido por um registro curinga numa zona **sem DNSSEC**. Nenhum resolvedor pode ter esse nome em cache. Nomes distintos por resolvedor impedem que um resolvedor aqueça o cache de outro, o que aconteceria se o resolvedor padrão encaminhasse ao 8.8.8.8 (seção 9.5). A zona sem DNSSEC evita que o resolvedor sintetize respostas a partir de registros NSEC já em cache [R27] | Custo de uma resolução recursiva completa | Domínio e servidor autoritativo do grupo **[Pendente]** |
| **C2 — cache quente** | Um nome fixo da zona do grupo, com TTL conhecido (por exemplo, 3.600 s), é consultado uma vez para aquecer o cache, e a consulta medida é feita **pelo menos 2 s depois**, para que o TTL já tenha caído ao menos 1 s. Se o TTL retornado for menor que o configurado, a resposta veio do cache (M6). A checagem vale também para as consultas DoT e DoH do E-2 | Custo de uma resposta de cache, que é o melhor caso do resolvedor | Mesma zona de C1 |
| **C3 — natural** | Domínios reais da amostra (seção 9.7), consultados sem preparação | O que o usuário encontra no dia a dia | Lista de domínios |

**Escolha do servidor autoritativo [Pendente].** O tempo de C1 depende da
distância entre cada resolvedor e o servidor autoritativo da zona. Hospedar a
zona na Cloudflare ou no Google daria vantagem ao resolvedor da mesma empresa.
A zona deve ficar num provedor neutro e, se possível, com log de consultas, o
que torna a verificação M6 direta. Se o grupo não puder ter um domínio, C1 e C2
saem do desenho, e a Q2 passa a ser respondida só pela estratificação de C3,
com a ressalva explícita de que o estado de cache não é controlado.

**Autoaquecimento em C3.** As próprias rodadas do experimento aquecem o cache:
se um domínio tem TTL de 1 hora e é consultado a cada 30 minutos, a consulta
seguinte tende a encontrá-lo em cache por causa da consulta anterior do grupo.
Para controlar isso, os domínios de C3 são divididos em subconjuntos que se
revezam entre rodadas, e cada registro guarda o tempo desde a última consulta
do grupo àquele nome no mesmo resolvedor. Uma análise de sensibilidade
exclui as observações em que esse tempo for menor que o TTL autoritativo do
domínio (seção 10.6).

### 9.4 Instrumentação

| Item | Especificação | Motivo |
| --- | --- | --- |
| Linguagem e TLS | Python ≥ 3.10 com OpenSSL. O script aborta se `ssl.HAS_TLSv1_3` for falso | Piloto 2: o Python do macOS negocia apenas TLS 1.2 |
| Biblioteca DNS | `dnspython` com o extra `doh`, em versão fixada num `requirements.txt` idêntico para todos os integrantes **[Decisão]** | A versão 2.9 trocou o cliente HTTP `httpx` por `httpx2` (piloto 2); versões diferentes mudariam a pilha medida |
| Do53 | `dns.query.udp_with_fallback`, timeout de 2 s, uma tentativa, registrando se a resposta caiu para TCP | O fallback para TCP em respostas truncadas tem custo extra e precisa ser identificável [R14] |
| DoT | Abrir o socket manualmente, ligar `TCP_NODELAY`, envolver com contexto TLS com verificação de certificado e SNI (`cloudflare-dns.com` / `dns.google`), deixar o socket não bloqueante e passá-lo em `sock=` para `dns.query.tls`. Registrar a versão do TLS e os tempos de handshake TCP e TLS | Piloto 2: sem `TCP_NODELAY` a primeira consulta atrasa cerca de 60 ms; o `dnspython` não liga a opção |
| DoH | Cliente `httpx2.Client(http2=True)` passado em `session=`, URL por IP (`https://1.1.1.1/dns-query`, `https://8.8.8.8/dns-query`), método POST [R23]. Registrar a versão HTTP negociada | O cliente HTTP já liga `TCP_NODELAY`; usar IP evita uma resolução DNS escondida dentro da medida e mantém o mesmo endereço anycast do Do53 |
| Conexão nova | Socket ou cliente novo para cada consulta medida | Mede o custo completo que o usuário paga ao abrir a conexão |
| Conexão reaproveitada | Uma conexão por resolvedor e protocolo aberta no início da rodada; a primeira consulta é descartada; se o servidor fechar a conexão, a reconexão é registrada | Mede o regime estável dos navegadores e sistemas que mantêm a conexão aberta |
| Consulta | Tipo A, classe IN, EDNS0 com payload de 1.232 bytes, sem o bit DO, somente IPv4 **[Decisão]** | Mesma mensagem para todos os tratamentos |
| Identificação | A cada rodada: `id.server` (classe CHAOS) no 1.1.1.1 e M11 para os dois resolvedores públicos | Detectar mudanças de ponto de presença e separar distância de tempo de servidor |
| Ambiente | Máquina dedicada à coleta durante o período, preferencialmente no cabo, sem hibernar (`caffeinate -i` no macOS), relógio sincronizado por NTP; interface e versões registradas em cada arquivo | Reduzir ruído do cliente e permitir auditoria |

### 9.5 Validação do resolvedor padrão de cada rede

Consultar diretamente o IP configurado mede o que os dispositivos da rede usam
de verdade. Porém esse IP costuma ser o roteador ou outro encaminhador, que
pode repassar as consultas a um resolvedor público. Antes da coleta, cada rede
passa pelo procedimento abaixo, e o resultado vai para uma ficha da rede.

1. **Identificar o resolvedor configurado.** No macOS, `scutil --dns`; no
   Linux, `resolvectl status` ou `/etc/resolv.conf`; no Windows,
   `ipconfig /all`. Anotar se o endereço é privado (encaminhador local) ou
   público (resolvedor do provedor).
2. **Identificar quem resolve de fato.** Consultar pelo resolvedor padrão, 20
   vezes cada, `whoami.akamai.net` (tipo A) e `o-o.myaddr.l.google.com` (tipo
   TXT). As duas respostas trazem o endereço do resolvedor que chegou ao
   servidor autoritativo. Mapear esses endereços para o AS correspondente com
   o serviço IP-to-ASN da Team Cymru [R41] e classificar o upstream como
   provedor, Google (AS15169), Cloudflare (AS13335) ou outro. Repetir 20 vezes
   revela encaminhadores com vários upstreams, como no piloto.
3. **Detectar interceptação de DNS.** Consultar `id.server` (classe CHAOS)
   em `1.1.1.1`, que deve devolver um código de ponto de presença da
   Cloudflare, e `whoami.akamai.net` via `1.1.1.1` e via `8.8.8.8`, que devem
   cair nos AS13335 e AS15169. Se não caírem, o provedor está interceptando a
   porta 53, e as medições Do53 dos resolvedores públicos naquela rede deixam
   de valer. DoT e DoH continuam válidos, porque o certificado é verificado.
4. **Classificar a rede:**
   - **(a)** padrão independente: entra no experimento completo;
   - **(b)** padrão que encaminha para o Google ou a Cloudflare: entra, mas a
     comparação "padrão × público" é interpretada como "encaminhador local
     com cache × acesso direto";
   - **(c)** com interceptação: entra apenas no E-2 (DoT e DoH).
5. **Repetir os passos 2 e 3 uma vez por dia durante a coleta**, para detectar
   mudança de configuração da rede.

### 9.6 Rodadas, volume e registro

- **Rodada.** A cada 30 minutos **[Decisão]**, o script mede M11 e o
  identificador do ponto de presença, e depois aplica todos os tratamentos
  aos nomes da rodada em **ordem aleatória** (semente registrada). Assim nenhum
  resolvedor é sempre o primeiro ou o último e a ordem não se confunde com
  variações de curto prazo.
- **Volume estimado por rodada** (proposta, 80 nomes por rodada):
  - E-1: 60 nomes de C3 + 10 posições de C1 + 10 nomes de C2, vezes 3
    resolvedores, dá cerca de 240 consultas. Os 60 nomes de C3 são um dos três
    subconjuntos de um conjunto de 180 domínios (60 por estrato), que se
    revezam entre rodadas; assim cada domínio é consultado a cada 90 minutos e
    acumula cerca de 112 observações em 7 dias;
  - E-2: os mesmos 10 nomes de C2, vezes 2 resolvedores e 5 condições, dá
    cerca de 100 consultas.
  - São cerca de 340 consultas por rodada, que levam bem menos de um minuto.
    Ao longo de 7 dias, isso dá cerca de 115 mil consultas por rede.
- **Carga e ética.** Esse volume é desprezível diante de 1,9 trilhão de
  consultas diárias (E14). Os serviços são públicos e feitos para receber
  consultas de qualquer pessoa. As consultas de C1 e C2 vão ao servidor
  autoritativo do próprio grupo.
- **Registro (um por consulta):** `ts_utc`, `rede_id`, `rodada_id`, `ordem`,
  `experimento`, `resolvedor`, `protocolo`, `conexao`, `condicao_cache`,
  `nome`, `latencia_ms`, `t_tcp_ms`, `t_tls_ms`, `tls_versao`, `http_versao`,
  `rcode`, `erro`, `usou_tcp`, `ttl`, `ttl_autoritativo`,
  `s_desde_ultima_consulta`, `pop_id`, `rtt_ms`, `interface`,
  `versao_python`, `versao_openssl`, `versao_dnspython`.
- **Privacidade.** O endereço IP público de cada rede e a sub-rede ECS
  devolvida pelas sondas **não** entram nos arquivos versionados; fica
  registrado apenas o AS e a cidade.

### 9.7 Amostra de domínios (C3)

**Problema da versão 1.** A versão anterior trocava o Cloudflare Radar pela
lista Tranco para evitar o viés a favor do 1.1.1.1, já que o Radar é construído
a partir dos dados do próprio resolvedor [R12]. Mas a Tranco atual combina
cinco fontes, e o próprio Cloudflare Radar é uma delas desde 26/09/2022 [R40].
As outras quatro são o Chrome UX Report, a Farsight, a Majestic e o Cisco
Umbrella. Ou seja, a Tranco **atenua** o viés, mas não o elimina. Ela também
inclui fontes ligadas ao Google (CrUX) e ao resolvedor da Cisco (Umbrella), o
que dilui o peso de qualquer um dos resolvedores comparados [R16][R40].

**Problema de fundo.** Popularidade global não equivale a probabilidade de
estar em cache. Um domínio muito popular no mundo pode ser pouco consultado no
ponto de presença de São Paulo; domínios de CDN têm TTLs curtos e expiram
rápido mesmo sendo populares; e cada resolvedor anycast tem caches
fragmentados. Por isso, na versão 2, a popularidade **não é usada como
indicador de cache**: o estado de cache é controlado por C1 e C2, e a
popularidade serve só para estratificar C3.

**Estratificação de C3 [Decisão]:**

| Estrato | Critério | Função |
| --- | --- | --- |
| Popular global | Domínios do topo da Tranco (por exemplo, posições 1–1.000) | Uso típico |
| Popular no Brasil | Domínios `.br` presentes na Tranco, pela ordem do ranking | Aproximação da relevância local, já que a Tranco não publica listas por país [R40] |
| Cauda longa | Sorteio entre posições baixas da Tranco (por exemplo, 100.000–1.000.000) | Nomes pouco consultados, mais sujeitos a ausência de cache |

**Regras da amostra:**

- A lista Tranco usada é congelada pelo seu identificador permanente e
  versionada no repositório.
- Os domínios passam por uma qualificação prévia: saem os que não resolvem em
  nenhum dos três resolvedores.
- Os domínios são sorteados dentro de cada estrato com semente registrada.
- Uma análise de sensibilidade repete os resultados de C3 só com os estratos
  sem relação direta com nenhum dos resolvedores. Verificar se a Tranco
  permite gerar uma lista personalizada sem a fonte Cloudflare Radar
  **[Pendente]**.

### 9.8 Fatores de confusão e controles

| Fator | Risco | Controle |
| --- | --- | --- |
| Carga e qualidade da rede local (Wi-Fi, outros usuários) | Ruído e picos que não são do resolvedor | Pareamento dentro da rodada (todos os tratamentos com segundos de diferença); preferência por cabo; interface registrada |
| Horário e carga da internet | Mudança de latência ao longo do dia | Rodadas uniformes por 7 dias; faixa horária como fator (M10) |
| Mudança de rota anycast ou de ponto de presença | Diferença atribuída ao resolvedor que é, na verdade, de rota | Registro de `pop_id` e do RTT (M11) em toda rodada; análise com e sem ajuste por RTT |
| Ordem das consultas | Efeito de ordem e aquecimento cruzado | Ordem aleatória por rodada |
| Encaminhamento do resolvedor padrão para um público | Comparação "padrão × público" sem sentido e aquecimento cruzado de cache | Validação da seção 9.5 e classificação da rede |
| Interceptação da porta 53 pelo provedor | Do53 "do 1.1.1.1" respondido pelo provedor | Passo 3 da seção 9.5 |
| Autoaquecimento do cache pelas próprias rodadas | C3 parece mais quente do que é | Rodízio de subconjuntos e análise de sensibilidade |
| Pilha do cliente (versão do TLS, Nagle, versão das bibliotecas, Python) | Custo de protocolo que é artefato do cliente | Especificação da seção 9.4, verificada na inicialização e registrada |
| Endpoints diferentes para DoH | Rota diferente da do Do53 | URL por IP, com o mesmo endereço anycast. Em troca, o DoH medido não é exatamente o que os navegadores usam (seção 10.7) |
| Aquecimento cruzado em C1 quando o padrão encaminha ao 8.8.8.8 | O padrão encontraria em cache um nome que o 8.8.8.8 acabou de resolver | Nome C1 distinto para cada resolvedor (seção 9.3) |
| ECS (só no 8.8.8.8) | Mecanismo que pode afetar o cache do Google | Não é controlado; registrado como explicação possível **[Hipótese]** |
| Hibernação ou carga da máquina | Lacunas e atrasos do cliente | `caffeinate -i`, máquina dedicada, monitoramento de lacunas entre rodadas |

---

## 10. Plano de análise

> A estratégia estatística final precisa ser aprovada pelo grupo **[Pendente]**.
> O plano abaixo segue a lógica do Lab02 (medianas e Wilcoxon pareado) e a
> adapta à estrutura de medidas repetidas deste estudo.

### 10.1 Análise descritiva

- Para cada rede, tratamento, condição de cache e estrato: n, mediana, p95,
  IQR, IQR ÷ mediana e taxa de falhas (M2, M8, M9).
- **Gráficos:** distribuição acumulada (ECDF) da latência por tratamento,
  boxplots por faixa horária (M10) e série temporal da mediana por rodada.
- **Média só como complemento.** A distribuição de latência é assimétrica e
  tem cauda longa (piloto 1); a média vem sempre acompanhada da mediana.

### 10.2 Dependência entre observações

As consultas não são independentes. As do mesmo nome se repetem em centenas de
rodadas, e as da mesma rodada compartilham o estado momentâneo da rede. Tratar
cada consulta como observação independente estreitaria artificialmente os
intervalos de confiança e inflaria a significância. O plano lida com isso em
três passos:

1. **Pareamento dentro do bloco.** A diferença Δ é calculada entre tratamentos
   da mesma rodada e da mesma posição, o que remove o efeito comum da rodada.
2. **Agregação pela unidade de inferência.** A unidade depende de onde vem a
   variabilidade que interessa:
   - **C3 (domínios reais):** a unidade é o **nome**. Os domínios são uma
     amostra de uma população real, e o interesse é generalizar para outros
     domínios. Para cada rede e nome, toma-se a mediana de Δ sobre as rodadas.
   - **C1 e C2 (nomes sintéticos da zona do grupo):** os nomes são réplicas
     idênticas, e tratá-los como unidades seria pseudorreplicação. Aqui a
     variabilidade de interesse é a do **tempo**. A unidade é a **janela de
     6 h** (as quatro faixas de M10 em cada dia, cerca de 28 janelas em 7
     dias). Para cada rede e janela, toma-se a mediana de Δ. Janelas vizinhas
     ainda podem ser correlacionadas; essa dependência residual entra como
     ameaça à validade de conclusão (seção 10.7).
3. **Redes analisadas separadamente.** Com poucas redes (3, se cada integrante
   coletar em uma), não há como estimar a variação entre redes. Cada rede é uma
   réplica, e o relatório mostra se a direção do efeito se repete entre elas.

### 10.3 Testes de hipótese

| Hipótese | Teste | Por que este teste |
| --- | --- | --- |
| **E-1, Q1 e Q2:** H₀ — as latências medianas dos três resolvedores em Do53 são iguais, por rede e condição de cache | **Friedman** sobre as medianas por unidade de inferência (nomes em C3, janelas em C1 e C2), que funcionam como blocos [R35] | Três tratamentos relacionados no mesmo bloco; distribuição não normal; comparação por postos |
| **E-1, comparações par a par:** 1.1.1.1 × 8.8.8.8 e 1.1.1.1 × padrão | **Wilcoxon** pareado bilateral sobre as mesmas medianas [R43], com correção de **Holm** [R36] | Pareado e não paramétrico; Holm controla o erro global sem o conservadorismo de Bonferroni |
| **E-2, Q3:** H₀ — DoT/DoH (nova e reaproveitada) têm a mesma latência que o Do53 no mesmo resolvedor | Wilcoxon pareado sobre as medianas de Δ por janela de 6 h, com correção de Holm | Os nomes C2 são réplicas sintéticas; a unidade é a janela (seção 10.2) |
| **Q4, falhas:** H₀ — a proporção de falhas é igual entre dois resolvedores | **Wilcoxon** pareado sobre as taxas de falha por unidade de inferência; o teste exato de **McNemar** [R42] sobre os blocos discordantes fica só como análise exploratória | Mantém a mesma unidade de inferência das latências. O McNemar supõe pares independentes, o que os blocos de um mesmo nome não são. Se as falhas forem raras demais (a maioria das unidades com zero falhas nos dois resolvedores), as taxas são apenas descritas, com IC por bootstrap por conglomerado |

**Regras gerais [Decisão]:**

- α = 0,05, e o tamanho de efeito (M4) e o IC por bootstrap (M3) são sempre
  reportados junto do p-valor.
- Pares com Δ = 0 são descartados no Wilcoxon, como no Lab02.
- A **análise primária** fica limitada a H-a e a H-c (custo com conexão
  reaproveitada); o resto é secundário ou exploratório. Isso evita que o grande
  número de comparações produza falsos positivos.
- **Alternativa mais completa (opcional):** um modelo linear misto sobre o log
  da latência, com resolvedor e protocolo como efeitos fixos e nome e rodada
  como efeitos aleatórios, por rede. Só será adotado se o grupo dominar a
  técnica e os resíduos forem aceitáveis; não substitui os testes acima.

### 10.4 Classificação de falhas

| Situação na rodada | Interpretação | Tratamento em M8 |
| --- | --- | --- |
| Todos os tratamentos de todos os resolvedores falham | Falha da rede local | Excluída do numerador e do denominador; reportada à parte |
| Um nome falha em todos os resolvedores (por exemplo, SERVFAIL por DNSSEC quebrado no domínio) | Falha do domínio | Excluída; o domínio é marcado e reavaliado |
| Falha em um resolvedor enquanto os outros respondem | Falha atribuível ao resolvedor | Conta em M8 |

Os timeouts são **censurados** em 2.000 ms. As medianas são calculadas sobre
as consultas bem-sucedidas, e uma análise de sensibilidade inclui os timeouts
com o valor de 2.000 ms para mostrar o efeito das falhas sobre a cauda (p95).

### 10.5 Bootstrap

- **10.000 réplicas é adequado.** O número de réplicas controla apenas o erro
  de simulação do próprio bootstrap. Para intervalos percentis, alguns
  milhares já bastam, e 10.000 reduz esse erro a um nível desprezível a custo
  computacional baixo [R33][R34].
- **O que importa é a unidade de reamostragem.** Reamostrar consultas
  individuais trataria como independentes observações que não são. Reamostram-se
  as **unidades de inferência** da seção 10.2 (conglomerados): os **nomes** em
  C3, mantendo juntas todas as rodadas de cada nome, e as **janelas de 6 h** em
  C1, C2 e E-2 [R34].
- **Tipo de intervalo.** Percentil para a mediana e BCa se a distribuição das
  réplicas for assimétrica. Para o p95, o IC por bootstrap é menos estável e
  será reportado só com cautela.

### 10.6 Análises de sensibilidade

1. Excluir as observações de C3 possivelmente aquecidas pelo próprio grupo
   (tempo desde a última consulta menor que o TTL).
2. Ajustar pelo RTT de rede (M11): comparar Δ com e sem a subtração do RTT,
   para separar distância de tempo de servidor.
3. Excluir as rodadas em que o ponto de presença do 1.1.1.1 mudou.
4. Incluir os timeouts como 2.000 ms.
5. Repetir C3 sem o estrato mais sujeito ao viés da lista (seção 9.7).

### 10.7 Ameaças à validade

Organizadas nos quatro tipos de Wohlin et al. [R18]:

| Tipo | Ameaça | Mitigação ou declaração |
| --- | --- | --- |
| **Conclusão** | Dependência residual entre janelas de 6 h vizinhas (C1, C2, E-2) | Agregação por janela e bootstrap por conglomerado; o risco residual é declarado |
| **Conclusão** | Muitas comparações | Hipóteses primárias declaradas (H-a e H-c) e correção de Holm |
| **Conclusão** | Falhas raras demais para teste | Descrição com IC, sem teste (seção 10.3) |
| **Interna** | Artefatos do cliente (versão do TLS, Nagle, bibliotecas) | Especificação e verificação da seção 9.4 |
| **Interna** | Mudança de rota ou de ponto de presença durante a coleta | `pop_id`, M11 e análises de sensibilidade 2 e 3 |
| **Interna** | Aquecimento cruzado e autoaquecimento do cache | Nomes C1 distintos por resolvedor; rodízio em C3; sensibilidade 1 |
| **Interna** | Resolvedor padrão que encaminha ou rede com interceptação | Validação e classificação da seção 9.5 |
| **Construto** | "Latência medida no cliente" inclui o processamento do próprio cliente, que é maior no DoH (HTTP/2 em Python) do que no Do53 | Mesma máquina e bibliotecas em todos os tratamentos; a diferença é declarada como parte do custo medido do protocolo |
| **Construto** | O estado de cache de C3 é desconhecido | O controle de cache fica em C1 e C2; C3 representa o uso cotidiano, sem afirmar estado de cache |
| **Externa** | Poucas redes, escolhidas por conveniência | Escopo restrito às redes do grupo; cada rede tratada como réplica |
| **Externa** | DoH medido pela URL por IP (`https://1.1.1.1/dns-query`), enquanto navegadores costumam usar nomes como `cloudflare-dns.com`, que apontam para outros endereços (E8) | Escolha feita para manter o mesmo endereço do Do53; a diferença é declarada |
| **Externa** | Só IPv4, só registros tipo A, uma única máquina por rede | Declarado como limite do escopo |
| **Externa** | Resultados de uma semana específica | Data da coleta registrada; replicação em outra época fica como trabalho futuro |

---

## 11. Revisão crítica da proposta

| # | Pergunta de validação | Avaliação |
| --- | --- | --- |
| 1 | O software atende aos três critérios? | **Sim.** **Real:** documentação oficial, endereços públicos e anúncio de lançamento (E1–E4). **Em operação:** documentação atualizada em 2026, relatório de incidente de 2025, série APNIC até 16/11/2026 e respostas nos pilotos (E7–E11). **Alto impacto:** 1,9 trilhão de consultas por dia, 4,3% dos usuários no mundo e 7,5% no Brasil, segundo maior resolvedor público (E12–E17). |
| 2 | As evidências são suficientes e verificáveis? | **Sim, com ressalvas.** Todas têm link direto e data. O volume de 1,9 trilhão por dia é declarado pelo próprio operador, por isso aparece ao lado de uma medição independente (APNIC). Os percentuais do APNIC mudam todo dia, e a data do dado está registrada. Ficam pendentes: a situação atual do DoH padrão no Firefox e se o APNIC pode contar um usuário em mais de um resolvedor. |
| 3 | A pergunta de pesquisa pode ser respondida? | **Sim.** Todas as variáveis são observáveis do lado do cliente, e os dois pilotos mostraram que a coleta funciona nos três protocolos. A pergunta não exige dados internos da Cloudflare nem explica a **causa** das diferenças, apenas as mede. |
| 4 | O objetivo GQM está corretamente estruturado? | **Sim.** Os cinco elementos estão preenchidos e são distintos entre si. Cada pergunta tem ao menos uma métrica, e cada métrica serve a ao menos uma pergunta. A M6 deixou de ser uma métrica de resposta e passou a ser uma checagem de manipulação, o que agora está explícito. |
| 5 | As métricas são mensuráveis? | **Sim.** Cada métrica tem definição operacional, unidade, ferramenta e procedimento de cálculo. As duas que dependiam de premissas frágeis foram corrigidas: a M6 (TTL em domínios de terceiros) e a M9 (coeficiente de variação). |
| 6 | O estudo é viável no laboratório? | **Sim, com uma dependência.** Usa ferramentas gratuitas e computadores dos integrantes, e uma semana de coleta cabe em uma sprint. A dependência é a zona DNS do grupo, necessária para C1 e C2. Sem ela, o estudo continua viável, mas a Q2 fica mais fraca (seção 9.3). |
| 7 | Há fragilidades que podem comprometer a aprovação? | Sim, as listadas abaixo, todas com correção aplicada ou mitigação definida. |

**Fragilidades identificadas e tratamento**

1. **"Um serviço DNS é um software?"** O professor pode esperar um
   aplicativo. *Mitigação:* o 1.1.1.1 é um sistema de software distribuído em
   operação, acessado por protocolos padronizados, e é exatamente o tipo de
   objeto que o enunciado pede ("o software em funcionamento, e não a
   mineração de código"). A seção 1 deixa isso explícito.
2. **Validade externa limitada.** As medições saem de poucas redes.
   *Correção aplicada:* a RQ e o objetivo agora dizem "redes usadas pelo
   grupo", cada rede é analisada como réplica e identificada por AS e cidade.
3. **Viés na escolha de domínios.** *Correção aplicada:* a versão 1 dizia que a
   Tranco eliminava o viés do Radar, mas a Tranco inclui o Radar entre suas
   fontes. A popularidade deixou de ser indicador de cache, e o viés residual
   entra na análise de sensibilidade (seção 9.7).
4. **Inferência de cache pelo TTL.** *Correção aplicada:* o estado de cache
   passou a ser controlado pelo desenho (C1, C2, C3), e o TTL só é usado numa
   zona com TTL conhecido (M6).
5. **Artefatos do cliente no custo do DNS cifrado.** *Correção aplicada:* TLS
   1.3 obrigatório, `TCP_NODELAY` no DoT, versões fixadas e registradas
   (seção 9.4).
6. **Dependência entre observações.** *Correção aplicada:* pareamento por
   bloco, agregação pela unidade de inferência (nome em C3, janela de 6 h nos
   nomes sintéticos de C1 e C2) e bootstrap por conglomerado (seções 10.2 e
   10.5). A versão 2 usava o nome como unidade também em C1 e C2, o que seria
   pseudorreplicação.
7. **O resolvedor padrão pode ser um encaminhador, ou a porta 53 pode ser
   interceptada.** *Mitigação:* o procedimento da seção 9.5, que no piloto já
   detectou encaminhamento ao Google.
8. **Dependência de uma zona DNS do grupo.** *Mitigação:* há um plano
   alternativo, sem C1 e C2, descrito na seção 9.3.
9. **Classificação das sete categorias sem o material da Aula 8.** O material
   não foi encontrado no repositório, no histórico do Git, nos relatórios
   anteriores nem na pasta da disciplina. *Mitigação:* a seção 8 traz uma
   classificação provisória com justificativas e com o ajuste previsto caso a
   Aula 8 use outros níveis; a conferência com o material do professor
   continua pendente.
10. **Divisão de responsabilidades ainda não confirmada.** O texto foi redigido
    por A, inclusive seções que cabem a B e C. *Mitigação:* a tabela de
    responsabilidade no início do documento marca essas seções como rascunho
    até a validação do responsável.

---

## 12. Referências

As fontes foram acessadas em 18/11/2026. As referências [R15], [R17], [R18],
[R33]–[R39], [R42] e [R43] são obras clássicas citadas pela forma bibliográfica
corrente; a paginação deve ser conferida no exemplar usado pelo grupo.

- **[R1]** CLOUDFLARE. *1.1.1.1 — Cloudflare 1.1.1.1 docs*. Disponível em:
  https://developers.cloudflare.com/1.1.1.1/. Atualizado em 30/04/2026.
- **[R2]** CLOUDFLARE. *IP addresses — 1.1.1.1 docs*. Disponível em:
  https://developers.cloudflare.com/1.1.1.1/ip-addresses/. Atualizado em 30/04/2026.
- **[R3]** PRINCE, Matthew. *Announcing 1.1.1.1: the fastest, privacy-first
  consumer DNS service*. Cloudflare Blog, 01/04/2018. Disponível em:
  https://blog.cloudflare.com/announcing-1111/.
- **[R4]** CLOUDFLARE. *Encryption — 1.1.1.1 docs*. Disponível em:
  https://developers.cloudflare.com/1.1.1.1/encryption/. Atualizado em 05/05/2026.
- **[R5]** CLOUDFLARE. *1.1.1.1 Public DNS Resolver — Privacy policy*.
  Disponível em: https://developers.cloudflare.com/1.1.1.1/privacy/public-dns-resolver/.
  Última atualização declarada: 27/03/2024.
- **[R6]** CLOUDFLARE. *Cloudflare 1.1.1.1 incident on July 14, 2025*.
  Cloudflare Blog, 15/07/2025. Disponível em:
  https://blog.cloudflare.com/cloudflare-1-1-1-1-incident-on-july-14-2025.
- **[R7]** BELSON, David; GERHART, Hannes. *Some TXT about, and A PTR to, new
  DNS insights on Cloudflare Radar*. Cloudflare Blog, 27/02/2025. Disponível em:
  https://blog.cloudflare.com/new-dns-section-on-cloudflare-radar/.
- **[R8]** APNIC LABS. *Use of DNS Resolvers for Brazil (BR)*. Série diária;
  valores de 16/11/2025 e 16/11/2026. Disponível em:
  https://stats.labs.apnic.net/rvrs/BR.
- **[R9]** APNIC LABS. *Use of DNS Resolvers for World (XA)*. Série diária;
  valor de 16/11/2026. Disponível em: https://stats.labs.apnic.net/rvrs/XA.
- **[R10]** MOZILLA. *Firefox continues push to bring DNS over HTTPS by default
  for US users*. Mozilla Blog, 25/02/2020. Disponível em:
  https://blog.mozilla.org/en/products/firefox/firefox-continues-push-to-bring-dns-over-https-by-default-for-us-users/.
- **[R11]** HUSTON, Geoff. *DoH, DoT, and plain old DNS*. APNIC Blog,
  02/09/2022. Disponível em: https://blog.apnic.net/2022/09/02/doh-dot-and-plain-old-dns/.
- **[R12]** MARTINHO, Celso. *Goodbye, Alexa. Hello, Cloudflare Radar Domain
  Rankings*. Cloudflare Blog, 30/09/2022. Disponível em:
  https://blog.cloudflare.com/radar-domain-rankings/.
- **[R13]** PERFOPS. *DNSPerf — DNS Resolvers*. Metodologia: testes a cada
  minuto a partir de mais de 200 localidades, IPv4, timeout de 1 s. Disponível
  em: https://www.dnsperf.com/#!dns-resolvers.
- **[R14]** DNSPYTHON CONTRIBUTORS. *dnspython — DNS Query Support*. Disponível
  em: https://dnspython.readthedocs.io/en/stable/query.html.
- **[R15]** BASILI, Victor R.; CALDIERA, Gianluigi; ROMBACH, H. Dieter. The
  Goal Question Metric Approach. In: MARCINIAK, John J. (ed.). *Encyclopedia of
  Software Engineering*. New York: John Wiley & Sons, 1994. v. 1, p. 528–532.
- **[R16]** LE POCHAT, Victor; VAN GOETHEM, Tom; TAJALIZADEHKHOOB, Samaneh;
  KORCZYŃSKI, Maciej; JOOSEN, Wouter. Tranco: A Research-Oriented Top Sites
  Ranking Hardened Against Manipulation. In: *Proceedings of the 2019 Network
  and Distributed System Security Symposium (NDSS)*. San Diego: Internet
  Society, 2019. DOI: 10.14722/ndss.2019.23386.
  Lista disponível em: https://tranco-list.eu/.
- **[R17]** CLIFF, Norman. Dominance statistics: Ordinal analyses to answer
  ordinal questions. *Psychological Bulletin*, v. 114, n. 3, p. 494–509, 1993.
- **[R18]** WOHLIN, Claes et al. *Experimentation in Software Engineering*.
  Berlin: Springer, 2012.
- **[R19]** HUSTON, Geoff. *How we measure: DNSSEC validation*. APNIC Blog,
  31/10/2023. Disponível em:
  https://blog.apnic.net/2023/10/31/how-we-measure-dnssec-validation/.
- **[R20]** MOCKAPETRIS, P. *RFC 1035: Domain names — implementation and
  specification*. IETF, nov. 1987. Disponível em:
  https://www.rfc-editor.org/rfc/rfc1035.
- **[R21]** ELZ, R.; BUSH, R. *RFC 2181: Clarifications to the DNS
  Specification*. IETF, jul. 1997. Disponível em:
  https://www.rfc-editor.org/rfc/rfc2181.
- **[R22]** HU, Z. et al. *RFC 7858: Specification for DNS over Transport Layer
  Security (TLS)*. IETF, maio 2016. Disponível em:
  https://www.rfc-editor.org/rfc/rfc7858.
- **[R23]** HOFFMAN, P.; McMANUS, P. *RFC 8484: DNS Queries over HTTPS (DoH)*.
  IETF, out. 2018. Disponível em: https://www.rfc-editor.org/rfc/rfc8484.
- **[R24]** RESCORLA, E. *RFC 8446: The Transport Layer Security (TLS) Protocol
  Version 1.3*. IETF, ago. 2018. Disponível em:
  https://www.rfc-editor.org/rfc/rfc8446.
- **[R25]** NAGLE, J. *RFC 896: Congestion Control in IP/TCP Internetworks*.
  IETF, jan. 1984. Disponível em: https://www.rfc-editor.org/rfc/rfc896.
- **[R26]** LAWRENCE, D.; KUMARI, W.; SOOD, P. *RFC 8767: Serving Stale Data to
  Improve DNS Resiliency*. IETF, mar. 2020. Disponível em:
  https://www.rfc-editor.org/rfc/rfc8767.
- **[R27]** FUJIWARA, K.; KATO, A.; KUMARI, W. *RFC 8198: Aggressive Use of
  DNSSEC-Validated Cache*. IETF, jul. 2017. Disponível em:
  https://www.rfc-editor.org/rfc/rfc8198.
- **[R28]** CONTAVALLI, C.; VAN DER GAAST, W.; LAWRENCE, D.; KUMARI, W.
  *RFC 7871: Client Subnet in DNS Queries*. IETF, maio 2016. Disponível em:
  https://www.rfc-editor.org/rfc/rfc7871.
- **[R29]** BÖTTGER, Timm; CUADRADO, Felix; ANTICHI, Gianni; FERNANDES, Eder
  Leão; TYSON, Gareth; CASTRO, Ignacio; UHLIG, Steve. An Empirical Study of
  the Cost of DNS-over-HTTPS. In: *Proceedings of the Internet Measurement
  Conference (IMC '19)*. Amsterdam: ACM, 2019. DOI: 10.1145/3355369.3355575.
- **[R30]** HOUNSEL, Austin; BORGOLTE, Kevin; SCHMITT, Paul; HOLLAND, Jordan;
  FEAMSTER, Nick. Comparing the Effects of DNS, DoT, and DoH on Web
  Performance. In: *Proceedings of The Web Conference 2020 (WWW '20)*. Taipei:
  ACM, 2020. p. 562–572. DOI: 10.1145/3366423.3380139.
- **[R31]** LU, Chaoyi et al. An End-to-End, Large-Scale Measurement of
  DNS-over-Encryption: How Far Have We Come? In: *Proceedings of the Internet
  Measurement Conference (IMC '19)*. Amsterdam: ACM, 2019. p. 22–35. DOI:
  10.1145/3355369.3355580.
- **[R32]** ROMANO, Jeanine; KROMREY, Jeffrey D.; CORAGGIO, Jesse; SKOWRONEK,
  Jeff. Appropriate statistics for ordinal level data: Should we really be
  using t-test and Cohen's d for evaluating group differences on the NSSE and
  other surveys? In: *Annual Meeting of the Florida Association of
  Institutional Research*, 2006.
- **[R33]** EFRON, Bradley; TIBSHIRANI, Robert J. *An Introduction to the
  Bootstrap*. New York: Chapman & Hall, 1993.
- **[R34]** DAVISON, A. C.; HINKLEY, D. V. *Bootstrap Methods and their
  Application*. Cambridge: Cambridge University Press, 1997.
- **[R35]** FRIEDMAN, Milton. The use of ranks to avoid the assumption of
  normality implicit in the analysis of variance. *Journal of the American
  Statistical Association*, v. 32, n. 200, p. 675–701, 1937.
- **[R36]** HOLM, Sture. A simple sequentially rejective multiple test
  procedure. *Scandinavian Journal of Statistics*, v. 6, n. 2, p. 65–70, 1979.
- **[R37]** WILSON, Edwin B. Probable inference, the law of succession, and
  statistical inference. *Journal of the American Statistical Association*,
  v. 22, n. 158, p. 209–212, 1927.
- **[R38]** KITCHENHAM, Barbara. *Procedures for Performing Systematic
  Reviews*. Keele University Technical Report TR/SE-0401, 2004.
- **[R39]** PRODANOV, Cleber Cristiano; FREITAS, Ernani Cesar de. *Metodologia
  do trabalho científico: métodos e técnicas da pesquisa e do trabalho
  acadêmico*. 2. ed. Novo Hamburgo: Feevale, 2013.
- **[R40]** TRANCO. *Methodology*. Disponível em:
  https://tranco-list.eu/methodology.
- **[R41]** TEAM CYMRU. *IP to ASN Mapping Service*. Disponível em:
  https://www.team-cymru.com/ip-asn-mapping.
- **[R42]** McNEMAR, Quinn. Note on the sampling error of the difference
  between correlated proportions or percentages. *Psychometrika*, v. 12, n. 2,
  p. 153–157, 1947.
- **[R43]** WILCOXON, Frank. Individual comparisons by ranking methods.
  *Biometrics Bulletin*, v. 1, n. 6, p. 80–83, 1945.
